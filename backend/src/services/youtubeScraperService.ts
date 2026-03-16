import puppeteer, { Browser, Page } from 'puppeteer';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { logger } from '../utils/logger';
import { YoutubeTranscript } from 'youtube-transcript';
import { VideoMetadata, SearchResult, TranscriptItem } from '../types/video';
import { getRedisClient } from '../config/redis';

export class YouTubeScraperService {
  private browser: Browser | null = null;
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly MAX_RESULTS = 50;
  // Pool size 1 on free-tier hosts; set SCRAPER_BROWSER_POOL=3 locally for higher throughput
  private readonly BROWSER_POOL_SIZE = parseInt(process.env.SCRAPER_BROWSER_POOL || '1', 10);
  // Set SCRAPER_ENABLED=false to disable Chrome entirely (e.g. Render free tier)
  private readonly scraperEnabled = process.env.SCRAPER_ENABLED !== 'false';
  private browserPool: Browser[] = [];
  private poolIndex = 0;

  async initialize(): Promise<void> {
    if (!this.scraperEnabled) {
      logger.info('YouTube scraper (Chrome) is disabled via SCRAPER_ENABLED=false — skipping browser init');
      return;
    }
    try {
      for (let i = 0; i < this.BROWSER_POOL_SIZE; i++) {
        const browser = await puppeteer.launch({
          headless: 'new',
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu',
            '--disable-images',
            '--disable-plugins',
            '--disable-extensions',
            '--disable-background-timer-throttling',
            '--disable-backgrounding-occluded-windows',
            '--disable-renderer-backgrounding',
            '--disable-features=TranslateUI',
            '--disable-ipc-flooding-protection',
            '--js-flags=--max-old-space-size=128',
          ],
        });
        this.browserPool.push(browser);
      }

      this.browser = this.browserPool[0];
      logger.info(`YouTube scraper browser pool initialized with ${this.BROWSER_POOL_SIZE} browser(s)`);
    } catch (error) {
      logger.error('Failed to initialize browser pool:', error);
      throw error;
    }
  }

  async close(): Promise<void> {
    // Close all browsers in the pool
    for (const browser of this.browserPool) {
      await browser.close();
    }
    this.browserPool = [];
      this.browser = null;
    logger.info('YouTube scraper browser pool closed');
  }

  private getBrowser(): Browser {
    if (this.browserPool.length === 0) {
      throw new Error('Browser pool not initialized');
    }
    const browser = this.browserPool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.browserPool.length;
    return browser;
  }

  /**
   * Search for YouTube videos based on query and educational topics
   */
  async searchVideos(query: string, maxResults: number = 20): Promise<SearchResult[]> {
    const cacheKey = `search:${query}:${maxResults}`;
    
    try {
      // Check cache first (if Redis is available)
      const redisClient = getRedisClient();
      if (redisClient) {
      const cachedResults = await redisClient.get(cacheKey);
      
      if (cachedResults) {
        logger.info(`Cache hit for search query: ${query}`);
        return JSON.parse(cachedResults);
        }
      }

      // Perform search
      const searchResults = await this.performSearch(query, maxResults);
      
      // Cache results (if Redis is available)
      if (redisClient) {
      await redisClient.setEx(cacheKey, this.CACHE_TTL, JSON.stringify(searchResults));
      }
      
      return searchResults;
    } catch (error) {
      logger.error(`Error searching videos for query "${query}":`, error);
      throw error;
    }
  }

  private async performSearch(query: string, maxResults: number): Promise<SearchResult[]> {
    if (!this.scraperEnabled) {
      logger.warn('performSearch skipped: SCRAPER_ENABLED=false');
      return [];
    }
    if (this.browserPool.length === 0) {
      await this.initialize();
    }

    const browser = this.getBrowser();
    const page = await browser.newPage();
    
    try {
      // Set user agent to avoid detection
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      // Disable images, CSS, and other resources for faster loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'stylesheet', 'font', 'media'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });
      
      // Navigate to YouTube search with optimized parameters
      // sp=EgIQAQ filters for: Videos only
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ`;
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded', // Faster than networkidle0
        timeout: 15000 // Reduced timeout
      });

      // Wait for video elements with shorter timeout
      await page.waitForSelector('ytd-video-renderer', { timeout: 5000 });

      // Extract video data
      const videos = await page.evaluate((maxResults) => {
        const videoElements = document.querySelectorAll('ytd-video-renderer');
        const results: any[] = [];

        for (let i = 0; i < Math.min(videoElements.length, maxResults); i++) {
          const element = videoElements[i];
          
          try {
            const titleElement = element.querySelector('#video-title');
            const thumbnailElement = element.querySelector('img');
            const channelElement = element.querySelector('#text a');
            const durationElement = element.querySelector('span.style-scope.ytd-thumbnail-overlay-time-status-renderer');
            const viewsElement = element.querySelector('#metadata-line span:first-child');
            const uploadTimeElement = element.querySelector('#metadata-line span:last-child');
            const descriptionElement = element.querySelector('#description-text');

            if (!titleElement || !thumbnailElement) continue;

            const videoUrl = titleElement.getAttribute('href');
            if (!videoUrl) continue;

            const videoId = videoUrl.split('v=')[1]?.split('&')[0];
            if (!videoId) continue;

            results.push({
              videoId,
              title: titleElement.textContent?.trim() || '',
              thumbnail: thumbnailElement.getAttribute('src') || '',
              channel: channelElement?.textContent?.trim() || '',
              duration: durationElement?.textContent?.trim() || '',
              views: viewsElement?.textContent?.trim() || '',
              uploadTime: uploadTimeElement?.textContent?.trim() || '',
              description: descriptionElement?.textContent?.trim() || '',
              url: `https://www.youtube.com${videoUrl}`
            });
          } catch (error) {
            console.error('Error extracting video data:', error);
          }
        }

        return results;
      }, maxResults);

      logger.info(`Found ${videos.length} videos for query: ${query}`);
      return videos;

    } finally {
      await page.close();
    }
  }

  /**
   * Get detailed video metadata
   */
  async getVideoMetadata(videoId: string): Promise<VideoMetadata> {
    const cacheKey = `metadata:${videoId}`;
    
    try {
      const redisClient = getRedisClient();
      if (redisClient) {
        const cachedMetadata = await redisClient.get(cacheKey);
        if (cachedMetadata) {
          logger.info(`Cache hit for video metadata: ${videoId}`);
          return JSON.parse(cachedMetadata);
        }
      }

      let metadata: VideoMetadata;

      if (this.scraperEnabled) {
        metadata = await this.scrapeVideoMetadata(videoId);
      } else {
        metadata = await this.fetchMetadataViaInnertube(videoId);
      }
      
      if (redisClient) {
        await redisClient.setEx(cacheKey, this.CACHE_TTL * 24, JSON.stringify(metadata));
      }
      
      return metadata;
    } catch (error) {
      logger.error(`Error getting metadata for video ${videoId}:`, error);
      throw error;
    }
  }

  private async fetchMetadataViaInnertube(videoId: string): Promise<VideoMetadata> {
    const { Innertube, UniversalCache } = await import('youtubei.js');
    const client = await Innertube.create({
      lang: 'en', location: 'US', retrieve_player: true,
      cache: new UniversalCache(false), generate_session_locally: true,
    });

    const suppress = this.suppressYtjsWarnings();
    try {
      const info = await client.getInfo(videoId);
      const bi = (info as any).basic_info || {};
      const pi = (info as any).primary_info;
      const si = (info as any).secondary_info;

      const title = bi.title
        || pi?.title?.text || pi?.title?.toString?.()
        || '';
      if (!title) {
        throw new Error(`Innertube returned empty title for ${videoId}`);
      }

      const channel = bi.author
        || si?.owner?.author?.name
        || bi.channel?.name
        || 'Unknown';

      const description = bi.short_description
        || si?.description?.text || si?.description?.toString?.()
        || '';

      const durationSec = bi.duration || 0;
      const mins = Math.floor(durationSec / 60);
      const secs = durationSec % 60;
      const durationStr = durationSec > 0 ? `${mins}:${String(secs).padStart(2, '0')}` : '';

      const publishedText = pi?.published?.text || pi?.relative_date?.text || '';

      return {
        videoId,
        title,
        channel,
        description: description.substring(0, 500),
        duration: durationStr,
        views: bi.view_count != null ? String(bi.view_count) : '0',
        likes: bi.like_count != null ? String(bi.like_count) : '',
        uploadDate: publishedText,
        category: bi.category || '',
        thumbnail: bi.thumbnail?.[0]?.url || `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        scrapedAt: new Date(),
      };
    } finally {
      suppress();
    }
  }

  private suppressYtjsWarnings(): () => void {
    const origWarn = console.warn;
    console.warn = (...args: any[]) => {
      const msg = String(args[0] || '');
      if (msg.includes('[YOUTUBEJS]') && msg.includes('ParsingError')) return;
      origWarn.apply(console, args);
    };
    return () => { console.warn = origWarn; };
  }

  private async scrapeVideoMetadata(videoId: string): Promise<VideoMetadata> {
    if (!this.scraperEnabled) {
      throw new Error('Scraper disabled (SCRAPER_ENABLED=false)');
    }
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      await page.goto(videoUrl, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for video metadata to load
      await page.waitForSelector('h1.ytd-video-primary-info-renderer', { timeout: 10000 });

      const metadata = await page.evaluate(() => {
        const titleElement = document.querySelector('h1.ytd-video-primary-info-renderer yt-formatted-string');
        const channelElement = document.querySelector('#text a.yt-simple-endpoint');
        const viewsElement = document.querySelector('#count .view-count');
        const likesElement = document.querySelector('#segmented-like-button button[aria-label*="like"]');
        const descriptionElement = document.querySelector('#expand ytd-expander #content');
        const uploadDateElement = document.querySelector('#info-strings yt-formatted-string');
        const categoryElement = document.querySelector('meta[property="og:video:tag"]');

        // Extract duration from video player
        const durationElement = document.querySelector('.ytp-time-duration');
        
        return {
          title: titleElement?.textContent?.trim() || '',
          channel: channelElement?.textContent?.trim() || '',
          views: viewsElement?.textContent?.trim() || '',
          likes: likesElement?.getAttribute('aria-label') || '',
          description: descriptionElement?.textContent?.trim() || '',
          uploadDate: uploadDateElement?.textContent?.trim() || '',
          duration: durationElement?.textContent?.trim() || '',
          category: categoryElement?.getAttribute('content') || '',
        };
      });

      return {
        videoId,
        ...metadata,
        url: `https://www.youtube.com/watch?v=${videoId}`,
        thumbnail: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        scrapedAt: new Date()
      };

    } finally {
      await page.close();
    }
  }

  /**
   * Extract video transcript
   */
  async getVideoTranscript(videoId: string): Promise<TranscriptItem[]> {
    const cacheKey = `transcript:${videoId}`;
    
    try {
      // Check cache first (if Redis is available)
      const redisClient = getRedisClient();
      if (redisClient) {
      const cachedTranscript = await redisClient.get(cacheKey);
      
      if (cachedTranscript) {
        logger.info(`Cache hit for video transcript: ${videoId}`);
        return JSON.parse(cachedTranscript);
        }
      }

      // Get transcript using youtube-transcript library with language fallbacks
      let transcript: any[] = [];
      const langs = ['en', 'en-US', 'en-GB'];
      for (const lang of langs) {
        try {
          transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang } as any);
          if (Array.isArray(transcript) && transcript.length > 0) break;
        } catch { /* try next lang */ }
      }

      const formattedTranscript: TranscriptItem[] = Array.isArray(transcript)
        ? transcript.map((item: any) => ({
            text: item.text,
            start: typeof item.offset === 'number' ? item.offset / 1000 : (item.start || 0),
            duration: typeof item.duration === 'number' ? item.duration / 1000 : (item.dur || 0),
          }))
        : [];

      // Cache transcript (if Redis is available)
      if (redisClient) {
      await redisClient.setEx(cacheKey, this.CACHE_TTL * 24, JSON.stringify(formattedTranscript)); // Cache for 24 hours
      }
      
      if (formattedTranscript.length > 0) {
        logger.info(`Successfully extracted transcript for video: ${videoId} (segments=${formattedTranscript.length})`);
      } else {
        logger.warn(`Transcript extraction returned 0 segments for video: ${videoId}`);
      }
      return formattedTranscript;
      
    } catch (error) {
      logger.error(`Error getting transcript for video ${videoId}:`, error);
      
      // Fallback: try to scrape transcript manually
      try {
        return await this.scrapeTranscriptManually(videoId);
      } catch (fallbackError) {
        logger.error(`Fallback transcript extraction failed for ${videoId}:`, fallbackError);
        throw new Error(`Unable to extract transcript for video ${videoId}`);
      }
    }
  }

  private async scrapeTranscriptManually(videoId: string): Promise<TranscriptItem[]> {
    if (!this.browser) {
      await this.initialize();
    }

    const page = await this.browser!.newPage();
    
    try {
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const videoUrl = `https://www.youtube.com/watch?v=${videoId}`;
      await page.goto(videoUrl, { waitUntil: 'networkidle0', timeout: 30000 });

      // Try to find and click transcript button
      try {
        await page.waitForSelector('button[aria-label*="transcript"]', { timeout: 5000 });
        await page.click('button[aria-label*="transcript"]');
        
        // Wait for transcript to load
        await page.waitForSelector('ytd-transcript-segment-renderer', { timeout: 5000 });
        
        const transcript = await page.evaluate(() => {
          const segments = document.querySelectorAll('ytd-transcript-segment-renderer');
          const transcriptItems: any[] = [];
          
          segments.forEach((segment: Element) => {
            const timeElement = segment.querySelector('.ytd-transcript-segment-renderer[role="button"] div:first-child');
            const textElement = segment.querySelector('.ytd-transcript-segment-renderer[role="button"] div:last-child');
            
            if (timeElement && textElement) {
              const timeText = timeElement.textContent?.trim() || '';
              const text = textElement.textContent?.trim() || '';
              
              // Parse time (format: "MM:SS" or "H:MM:SS")
              const timeParts = timeText.split(':').map(Number);
              let seconds = 0;
              
              if (timeParts.length === 2) {
                seconds = timeParts[0] * 60 + timeParts[1];
              } else if (timeParts.length === 3) {
                seconds = timeParts[0] * 3600 + timeParts[1] * 60 + timeParts[2];
              }
              
              transcriptItems.push({
                text,
                start: seconds,
                duration: 5 // Approximate duration
              });
            }
          });
          
          return transcriptItems;
        });
        
        return transcript;
      } catch (error) {
        logger.warn(`No transcript available for video ${videoId}`);
        return [];
      }

    } finally {
      await page.close();
    }
  }

  /**
   * Search for educational videos by topic
   */
  private scoreRelevance(query: string, video: SearchResult): number {
    const q = query.toLowerCase();
    const title = (video.title || '').toLowerCase();
    const desc = (video.description || '').toLowerCase();

    let score = 0;
    // Exact phrase boost
    if (title.includes(q)) score += 50;
    if (desc.includes(q)) score += 15;

    // Word-level boosts
    const words = q.split(/\s+/).filter(Boolean);
    const inTitle = words.filter(w => title.includes(w)).length;
    const inDesc = words.filter(w => desc.includes(w)).length;
    score += inTitle * 12 + inDesc * 3;

    // Duration preference (avoid shorts < 2m)
    const dur = (video.duration || '').trim();
    const m = dur.match(/(\d+):(\d{2})/);
    if (m) {
      const mins = parseInt(m[1], 10);
      if (mins >= 2 && mins <= 90) score += 8; // tutorial-sized
    }

    // Views boost (rough)
    const numViews = parseInt((video.views || '').replace(/[^\d]/g, '')) || 0;
    if (numViews > 10000) score += 5;
    if (numViews > 100000) score += 8;

    // Penalize entertainment keywords if present
    const negative = ['music','gaming','vlog','prank','trailer','funny'];
    if (negative.some(k => title.includes(k) || desc.includes(k))) score -= 20;

    return score;
  }

  private parseViews(viewsText: string | undefined): number {
    if (!viewsText) return 0;
    const cleaned = viewsText.toLowerCase().replace(/views?/g, '').trim();
    const m = cleaned.match(/([\d,.]+)\s*([km])?/i);
    if (!m) return parseInt(cleaned.replace(/[^\d]/g, '')) || 0;
    let n = parseFloat(m[1].replace(/,/g, ''));
    const suffix = m[2]?.toLowerCase();
    if (suffix === 'k') n *= 1_000;
    if (suffix === 'm') n *= 1_000_000;
    return Math.floor(n);
  }

  async searchEducationalVideos(topic: string, filters?: {
    duration?: 'short' | 'medium' | 'long';
    uploadDate?: 'hour' | 'today' | 'week' | 'month' | 'year';
    sortBy?: 'relevance' | 'date' | 'views' | 'rating';
  }, limit: number = 20): Promise<SearchResult[]> {
    const base = `${topic}`.trim();
    
    // Try fast search (HTTP-based, works with or without proxies)
    try {
      const timeoutMs = this.scraperEnabled ? 3000 : 10000;
      const timeoutPromise = new Promise<SearchResult[]>((_, reject) => 
        setTimeout(() => reject(new Error('Timeout')), timeoutMs)
      );
      
      const searchPromise = this.fastSearch(base, limit);
      
      const fastResults = await Promise.race([searchPromise, timeoutPromise]);
      
      if (fastResults.length > 0) {
        logger.info(`Fast search returned ${fastResults.length} results for: ${base}`);
        return fastResults;
      }
    } catch (error) {
      logger.warn('Fast search failed or timed out:', error);
    }
    
    // Fallback to browser scraping (only when Puppeteer is available)
    if (!this.scraperEnabled) {
      logger.warn('Search returned 0 results — scraper disabled, no browser fallback');
      return [];
    }
    const raw = await this.searchVideos(base, this.MAX_RESULTS);
    return raw.slice(0, limit);
  }

  /**
   * Ultra-fast search using YouTube's internal API (much faster than HTML scraping)
   */
  private async fastSearch(query: string, limit: number): Promise<SearchResult[]> {
    try {
      const startTime = Date.now();
      // sp=EgIQAQ filters for: Videos only
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ`;
      
      const response = await axios.get(searchUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Connection': 'keep-alive',
        },
        timeout: 8000,
        maxRedirects: 3,
        validateStatus: (status) => status < 400
      });

      // Extract initial data from YouTube's embedded JSON
      const html = response.data;
      const results: SearchResult[] = [];
      
      // Try to extract from ytInitialData
      const ytInitialDataMatch = html.match(/var ytInitialData = ({.+?});/);
      if (ytInitialDataMatch) {
        try {
          const ytData = JSON.parse(ytInitialDataMatch[1]);
          const contents = ytData?.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents;
          
          if (contents) {
            for (const section of contents) {
              const items = section?.itemSectionRenderer?.contents || [];
              
              for (const item of items) {
                if (results.length >= limit) break;
                
                const videoRenderer = item?.videoRenderer;
                if (!videoRenderer) continue;
                
                const videoId = videoRenderer.videoId;
                const title = videoRenderer.title?.runs?.[0]?.text || '';
                const thumbnail = videoRenderer.thumbnail?.thumbnails?.[0]?.url || '';
                const channel = videoRenderer.ownerText?.runs?.[0]?.text || '';
                const duration = videoRenderer.lengthText?.simpleText || '';
                const views = videoRenderer.viewCountText?.simpleText || '';
                const uploadTime = videoRenderer.publishedTimeText?.simpleText || '';
                
                if (videoId && title) {
                  results.push({
                    videoId,
                    title,
                    thumbnail: thumbnail.startsWith('//') ? `https:${thumbnail}` : thumbnail,
                    channel,
                    duration,
                    views,
                    uploadTime,
                    description: videoRenderer.descriptionSnippet?.runs?.map((r: any) => r.text).join('') || '',
                    url: `https://www.youtube.com/watch?v=${videoId}`
                  });
                }
              }
              
              if (results.length >= limit) break;
            }
          }
        } catch (parseError) {
          logger.warn('Error parsing ytInitialData, falling back to HTML parsing:', parseError);
        }
      }
      
      // Fallback to cheerio if JSON parsing failed
      if (results.length === 0) {
        const $ = cheerio.load(html);
        $('ytd-video-renderer, ytm-video-with-context-renderer').slice(0, limit).each((index, element) => {
          try {
            const $el = $(element);
            const titleElement = $el.find('#video-title, .media-item-headline');
            const thumbnailElement = $el.find('img').first();
            const channelElement = $el.find('#text a, .media-item-metadata').first();
            const durationElement = $el.find('span.ytd-thumbnail-overlay-time-status-renderer, .thumbnail-overlay-time-status-renderer').first();
            const viewsElement = $el.find('#metadata-line span:first-child, .media-item-metadata-stats').first();

            const videoUrl = titleElement.attr('href');
            if (videoUrl) {
              const videoId = videoUrl.split('v=')[1]?.split('&')[0] || videoUrl.split('/watch/')[1]?.split('?')[0];
              if (videoId) {
                results.push({
                  videoId,
                  title: titleElement.text().trim() || titleElement.attr('title') || '',
                  thumbnail: thumbnailElement.attr('src') || thumbnailElement.attr('data-src') || '',
                  channel: channelElement.text().trim(),
                  duration: durationElement.text().trim(),
                  views: viewsElement.text().trim(),
                  uploadTime: '',
                  description: '',
                  url: `https://www.youtube.com/watch?v=${videoId}`
                });
              }
            }
          } catch (error) {
            // Silent fail for individual items
          }
        });
      }

      const elapsed = Date.now() - startTime;
      logger.info(`Fast search completed in ${elapsed}ms, found ${results.length} results`);
      
      return results;
    } catch (error) {
      logger.error('Fast search error:', error);
      throw error;
    }
  }

  /**
   * Batch process multiple video IDs
   */
  async batchProcessVideos(videoIds: string[]): Promise<{
    metadata: VideoMetadata[];
    transcripts: { [videoId: string]: TranscriptItem[] };
    errors: { [videoId: string]: string };
  }> {
    const metadata: VideoMetadata[] = [];
    const transcripts: { [videoId: string]: TranscriptItem[] } = {};
    const errors: { [videoId: string]: string } = {};

    // Process in batches to avoid overwhelming the system
    const batchSize = 5;
    for (let i = 0; i < videoIds.length; i += batchSize) {
      const batch = videoIds.slice(i, i + batchSize);
      
      const promises = batch.map(async (videoId) => {
        try {
          const [videoMetadata, videoTranscript] = await Promise.all([
            this.getVideoMetadata(videoId),
            this.getVideoTranscript(videoId)
          ]);
          
          metadata.push(videoMetadata);
          transcripts[videoId] = videoTranscript;
        } catch (error) {
          errors[videoId] = error instanceof Error ? error.message : 'Unknown error';
          logger.error(`Error processing video ${videoId}:`, error);
        }
      });

      await Promise.all(promises);
      
      // Add delay between batches to be respectful
      if (i + batchSize < videoIds.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return { metadata, transcripts, errors };
  }
}

// Singleton instance
export const youtubeScraperService = new YouTubeScraperService();
