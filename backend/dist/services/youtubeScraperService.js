"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.youtubeScraperService = exports.YouTubeScraperService = void 0;
const puppeteer_1 = __importDefault(require("puppeteer"));
const axios_1 = __importDefault(require("axios"));
const cheerio = __importStar(require("cheerio"));
const logger_1 = require("../utils/logger");
const youtube_transcript_1 = require("youtube-transcript");
const redis_1 = require("../config/redis");
class YouTubeScraperService {
    constructor() {
        this.browser = null;
        this.CACHE_TTL = 3600; // 1 hour
        this.MAX_RESULTS = 50;
        this.BROWSER_POOL_SIZE = 3;
        this.browserPool = [];
        this.poolIndex = 0;
    }
    async initialize() {
        try {
            // Initialize browser pool for better performance
            for (let i = 0; i < this.BROWSER_POOL_SIZE; i++) {
                const browser = await puppeteer_1.default.launch({
                    headless: 'new',
                    args: [
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--disable-accelerated-2d-canvas',
                        '--no-first-run',
                        '--no-zygote',
                        '--disable-gpu',
                        '--disable-images', // Don't load images
                        '--disable-plugins',
                        '--disable-extensions',
                        '--disable-background-timer-throttling',
                        '--disable-backgrounding-occluded-windows',
                        '--disable-renderer-backgrounding',
                        '--disable-features=TranslateUI',
                        '--disable-ipc-flooding-protection',
                        '--memory-pressure-off',
                        '--max_old_space_size=4096'
                    ]
                });
                this.browserPool.push(browser);
            }
            // Keep the main browser for backward compatibility
            this.browser = this.browserPool[0];
            logger_1.logger.info(`YouTube scraper browser pool initialized with ${this.BROWSER_POOL_SIZE} browsers`);
        }
        catch (error) {
            logger_1.logger.error('Failed to initialize browser pool:', error);
            throw error;
        }
    }
    async close() {
        // Close all browsers in the pool
        for (const browser of this.browserPool) {
            await browser.close();
        }
        this.browserPool = [];
        this.browser = null;
        logger_1.logger.info('YouTube scraper browser pool closed');
    }
    getBrowser() {
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
    async searchVideos(query, maxResults = 20) {
        const cacheKey = `search:${query}:${maxResults}`;
        try {
            // Check cache first (if Redis is available)
            const redisClient = (0, redis_1.getRedisClient)();
            if (redisClient) {
                const cachedResults = await redisClient.get(cacheKey);
                if (cachedResults) {
                    logger_1.logger.info(`Cache hit for search query: ${query}`);
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
        }
        catch (error) {
            logger_1.logger.error(`Error searching videos for query "${query}":`, error);
            throw error;
        }
    }
    async performSearch(query, maxResults) {
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
                }
                else {
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
                const results = [];
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
                        if (!titleElement || !thumbnailElement)
                            continue;
                        const videoUrl = titleElement.getAttribute('href');
                        if (!videoUrl)
                            continue;
                        const videoId = videoUrl.split('v=')[1]?.split('&')[0];
                        if (!videoId)
                            continue;
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
                    }
                    catch (error) {
                        console.error('Error extracting video data:', error);
                    }
                }
                return results;
            }, maxResults);
            logger_1.logger.info(`Found ${videos.length} videos for query: ${query}`);
            return videos;
        }
        finally {
            await page.close();
        }
    }
    /**
     * Get detailed video metadata
     */
    async getVideoMetadata(videoId) {
        const cacheKey = `metadata:${videoId}`;
        try {
            // Check cache first (if Redis is available)
            const redisClient = (0, redis_1.getRedisClient)();
            if (redisClient) {
                const cachedMetadata = await redisClient.get(cacheKey);
                if (cachedMetadata) {
                    logger_1.logger.info(`Cache hit for video metadata: ${videoId}`);
                    return JSON.parse(cachedMetadata);
                }
            }
            // Scrape metadata
            const metadata = await this.scrapeVideoMetadata(videoId);
            // Cache metadata (if Redis is available)
            if (redisClient) {
                await redisClient.setEx(cacheKey, this.CACHE_TTL * 24, JSON.stringify(metadata)); // Cache for 24 hours
            }
            return metadata;
        }
        catch (error) {
            logger_1.logger.error(`Error getting metadata for video ${videoId}:`, error);
            throw error;
        }
    }
    async scrapeVideoMetadata(videoId) {
        if (!this.browser) {
            await this.initialize();
        }
        const page = await this.browser.newPage();
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
        }
        finally {
            await page.close();
        }
    }
    /**
     * Extract video transcript
     */
    async getVideoTranscript(videoId) {
        const cacheKey = `transcript:${videoId}`;
        try {
            // Check cache first (if Redis is available)
            const redisClient = (0, redis_1.getRedisClient)();
            if (redisClient) {
                const cachedTranscript = await redisClient.get(cacheKey);
                if (cachedTranscript) {
                    logger_1.logger.info(`Cache hit for video transcript: ${videoId}`);
                    return JSON.parse(cachedTranscript);
                }
            }
            // Get transcript using youtube-transcript library with language fallbacks
            let transcript = [];
            const langs = ['en', 'en-US', 'en-GB'];
            for (const lang of langs) {
                try {
                    transcript = await youtube_transcript_1.YoutubeTranscript.fetchTranscript(videoId, { lang });
                    if (Array.isArray(transcript) && transcript.length > 0)
                        break;
                }
                catch { /* try next lang */ }
            }
            const formattedTranscript = Array.isArray(transcript)
                ? transcript.map((item) => ({
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
                logger_1.logger.info(`Successfully extracted transcript for video: ${videoId} (segments=${formattedTranscript.length})`);
            }
            else {
                logger_1.logger.warn(`Transcript extraction returned 0 segments for video: ${videoId}`);
            }
            return formattedTranscript;
        }
        catch (error) {
            logger_1.logger.error(`Error getting transcript for video ${videoId}:`, error);
            // Fallback: try to scrape transcript manually
            try {
                return await this.scrapeTranscriptManually(videoId);
            }
            catch (fallbackError) {
                logger_1.logger.error(`Fallback transcript extraction failed for ${videoId}:`, fallbackError);
                throw new Error(`Unable to extract transcript for video ${videoId}`);
            }
        }
    }
    async scrapeTranscriptManually(videoId) {
        if (!this.browser) {
            await this.initialize();
        }
        const page = await this.browser.newPage();
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
                    const transcriptItems = [];
                    segments.forEach((segment) => {
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
                            }
                            else if (timeParts.length === 3) {
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
            }
            catch (error) {
                logger_1.logger.warn(`No transcript available for video ${videoId}`);
                return [];
            }
        }
        finally {
            await page.close();
        }
    }
    /**
     * Search for educational videos by topic
     */
    scoreRelevance(query, video) {
        const q = query.toLowerCase();
        const title = (video.title || '').toLowerCase();
        const desc = (video.description || '').toLowerCase();
        let score = 0;
        // Exact phrase boost
        if (title.includes(q))
            score += 50;
        if (desc.includes(q))
            score += 15;
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
            if (mins >= 2 && mins <= 90)
                score += 8; // tutorial-sized
        }
        // Views boost (rough)
        const numViews = parseInt((video.views || '').replace(/[^\d]/g, '')) || 0;
        if (numViews > 10000)
            score += 5;
        if (numViews > 100000)
            score += 8;
        // Penalize entertainment keywords if present
        const negative = ['music', 'gaming', 'vlog', 'prank', 'trailer', 'funny'];
        if (negative.some(k => title.includes(k) || desc.includes(k)))
            score -= 20;
        return score;
    }
    parseViews(viewsText) {
        if (!viewsText)
            return 0;
        const cleaned = viewsText.toLowerCase().replace(/views?/g, '').trim();
        const m = cleaned.match(/([\d,.]+)\s*([km])?/i);
        if (!m)
            return parseInt(cleaned.replace(/[^\d]/g, '')) || 0;
        let n = parseFloat(m[1].replace(/,/g, ''));
        const suffix = m[2]?.toLowerCase();
        if (suffix === 'k')
            n *= 1000;
        if (suffix === 'm')
            n *= 1000000;
        return Math.floor(n);
    }
    async searchEducationalVideos(topic, filters, limit = 20) {
        const base = `${topic}`.trim();
        // Try fast search with race condition for ultra-speed
        try {
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 1500) // 1.5 second max
            );
            const searchPromise = this.fastSearch(base, limit);
            const fastResults = await Promise.race([searchPromise, timeoutPromise]);
            if (fastResults.length > 0) {
                logger_1.logger.info(`Fast search returned ${fastResults.length} results for: ${base}`);
                return fastResults;
            }
        }
        catch (error) {
            logger_1.logger.warn('Fast search failed or timed out, falling back to browser scraping:', error);
        }
        // Fallback to browser scraping
        const raw = await this.searchVideos(base, this.MAX_RESULTS);
        return raw.slice(0, limit);
    }
    /**
     * Ultra-fast search using YouTube's internal API (much faster than HTML scraping)
     */
    async fastSearch(query, limit) {
        try {
            const startTime = Date.now();
            // sp=EgIQAQ filters for: Videos only
            const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}&sp=EgIQAQ`;
            const response = await axios_1.default.get(searchUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Connection': 'keep-alive',
                },
                timeout: 2000, // Reduced to 2 seconds
                maxRedirects: 0,
                validateStatus: (status) => status < 400
            });
            // Extract initial data from YouTube's embedded JSON
            const html = response.data;
            const results = [];
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
                                if (results.length >= limit)
                                    break;
                                const videoRenderer = item?.videoRenderer;
                                if (!videoRenderer)
                                    continue;
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
                                        description: videoRenderer.descriptionSnippet?.runs?.map((r) => r.text).join('') || '',
                                        url: `https://www.youtube.com/watch?v=${videoId}`
                                    });
                                }
                            }
                            if (results.length >= limit)
                                break;
                        }
                    }
                }
                catch (parseError) {
                    logger_1.logger.warn('Error parsing ytInitialData, falling back to HTML parsing:', parseError);
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
                    }
                    catch (error) {
                        // Silent fail for individual items
                    }
                });
            }
            const elapsed = Date.now() - startTime;
            logger_1.logger.info(`Fast search completed in ${elapsed}ms, found ${results.length} results`);
            return results;
        }
        catch (error) {
            logger_1.logger.error('Fast search error:', error);
            throw error;
        }
    }
    /**
     * Batch process multiple video IDs
     */
    async batchProcessVideos(videoIds) {
        const metadata = [];
        const transcripts = {};
        const errors = {};
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
                }
                catch (error) {
                    errors[videoId] = error instanceof Error ? error.message : 'Unknown error';
                    logger_1.logger.error(`Error processing video ${videoId}:`, error);
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
exports.YouTubeScraperService = YouTubeScraperService;
// Singleton instance
exports.youtubeScraperService = new YouTubeScraperService();
//# sourceMappingURL=youtubeScraperService.js.map