import axios from 'axios';
import { logger } from '../utils/logger';

export interface FallbackTranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

function extractPlayerResponse(html: string): any | null {
  // Try ytInitialPlayerResponse assignment (most common)
  const patterns = [
    /ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*var\s|\s*<\/script>)/s,
    /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/,
    /\"playerResponse\":(\{[\s\S]*?\})\s*,\"responseContext\"/
  ];
  
  for (const re of patterns) {
    const m = html.match(re);
    if (m && m[1]) {
      try {
        return JSON.parse(m[1]);
      } catch (e) {
        // Try to fix common JSON issues
        try {
          // Sometimes the JSON has trailing content
          const cleaned = m[1].replace(/\}\s*;?\s*$/, '}');
          return JSON.parse(cleaned);
        } catch {}
      }
    }
  }
  return null;
}

export async function fetchTranscriptViaWatchPage(videoId: string, preferredLangs: string[] = ['en', 'en-US', 'en-GB', 'en-IN', 'hi', 'hi-IN']): Promise<FallbackTranscriptSegment[]> {
  const startTime = Date.now();
  try {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const { data: html } = await axios.get(url, {
      timeout: 8000,
      headers: {
        'Accept-Language': 'en-US,en;q=0.9',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
      }
    });

    const pr = extractPlayerResponse(html);
    if (!pr) {
      logger.warn(`Could not extract playerResponse from watch page for ${videoId}`);
      return [];
    }
    
    const tracks: any[] = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
    
    if (!tracks.length) {
      logger.info(`No caption tracks found in playerResponse for video: ${videoId}`);
      return [];
    }
    
    logger.info(`Found ${tracks.length} caption track(s) for video: ${videoId}`);
    
    // Log available languages for debugging
    const availableLangs = tracks.map(t => t.languageCode).join(', ');
    logger.debug(`Available languages: ${availableLangs}`);

    // Choose best track - prefer English, then any available
    let chosen = tracks.find(t => preferredLangs.includes(t.languageCode)) || tracks[0];
    logger.info(`Selected caption track: ${chosen?.languageCode || 'unknown'}`);
    
    if (!chosen?.baseUrl) {
      logger.warn(`No baseUrl found for caption track in video: ${videoId}`);
      return [];
    }

    // Try JSON3 format first (most reliable), then others
    const base = chosen.baseUrl;
    const candidates: string[] = [
      `${base}&fmt=json3`,  // Most reliable format
      base,                  // Original URL (might already have format)
      `${base}&fmt=srv3`,
      `${base}&fmt=vtt`
    ];
    
    for (const urlCandidate of candidates) {
      try {
        logger.info(`Trying caption URL: ${urlCandidate.substring(0, 100)}...`);
        const { data, status } = await axios.get(urlCandidate, { 
          timeout: 8000,
          responseType: 'text',
          headers: { 
            'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
          }
        });
        
        const dataLen = typeof data === 'string' ? data.length : JSON.stringify(data).length;
        logger.info(`Caption response: status=${status}, type=${typeof data}, length=${dataLen}`);
        
        // Parse JSON if it's a string
        let parsedData = data;
        if (typeof data === 'string') {
          const trimmed = data.trim();
          
          // Log what we actually got
          if (trimmed.length === 0) {
            logger.warn(`Caption URL returned empty string`);
            continue; // Skip to next URL format
          }
          
          // Check if it looks like JSON
          if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
            try {
              parsedData = JSON.parse(data);
              logger.info(`Parsed JSON string response successfully`);
            } catch (e) {
              logger.debug(`Failed to parse as JSON: ${(e as Error).message}`);
            }
          } else if (trimmed.startsWith('<?xml') || trimmed.includes('<transcript>') || trimmed.includes('<text ')) {
            // It's XML format - parse it
            logger.info(`Response is XML format, parsing...`);
            const segments = parseXMLTranscript(trimmed);
            if (segments.length > 0) {
              const elapsed = Date.now() - startTime;
              logger.info(`✅ Watch-page extracted ${segments.length} XML segments for ${videoId} in ${elapsed}ms`);
              return segments;
            }
          } else {
            // Log first 200 chars to understand the format
            logger.info(`Response starts with: ${trimmed.substring(0, 200)}`);
          }
        }
        
        // Try JSON format first (json3 or srv3)
        if (parsedData && typeof parsedData === 'object') {
          const events = parsedData?.events || [];
          logger.info(`JSON response has ${events.length} events`);
          const segments: FallbackTranscriptSegment[] = [];
          
          for (const ev of events) {
            const startMs = ev?.tStartMs;
            const durMs = ev?.dDurationMs || 0;
            const parts = ev?.segs || ev?.segments || [];
            
            if (typeof startMs !== 'number') continue;
            
            let text = '';
            if (Array.isArray(parts)) {
              text = parts.map((p: any) => p?.utf8 || p?.text || '').join('').trim();
            }
            
            // Skip empty or whitespace-only segments
            if (!text || text === '\n') continue;
            
            // Clean the text
            text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
            
            segments.push({ 
              text, 
              start: Math.max(0, Math.floor(startMs / 1000)), 
              duration: Math.max(1, Math.floor((durMs || 1000) / 1000)) 
            });
          }
          
          if (segments.length > 0) {
            const elapsed = Date.now() - startTime;
            logger.info(`✅ Watch-page extracted ${segments.length} JSON segments for ${videoId} in ${elapsed}ms`);
            return segments;
          }
        }
        
        // Try VTT text format (check the original data, not parsed)
        if (typeof data === 'string' && data.includes('-->')) {
          const segments = parseVTT(data);
          if (segments.length > 0) {
            const elapsed = Date.now() - startTime;
            logger.info(`✅ Watch-page extracted ${segments.length} VTT segments for ${videoId} in ${elapsed}ms`);
            return segments;
          }
        }
      } catch (e: any) {
        logger.warn(`Caption URL failed: ${e?.message || e}`);
      }
    }

    const elapsed = Date.now() - startTime;
    logger.warn(`Watch-page: All caption formats failed for ${videoId} after ${elapsed}ms`);
    return [];
  } catch (e: any) {
    const elapsed = Date.now() - startTime;
    logger.warn(`Watch-page failed for ${videoId} after ${elapsed}ms: ${e?.message || e}`);
    return [];
  }
}

// Helper function to parse VTT format
function parseVTT(vttData: string): FallbackTranscriptSegment[] {
  const lines = vttData.split(/\r?\n/);
  const segments: FallbackTranscriptSegment[] = [];
  
  for (let i = 0; i < lines.length; i++) {
    const timeMatch = lines[i].match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (timeMatch && lines[i + 1]) {
      const toSec = (hhmmss: string) => {
        const [h, mn, rest] = hhmmss.split(':');
        const [sec, ms] = rest.split('.');
        return Number(h) * 3600 + Number(mn) * 60 + Number(sec) + Number(ms) / 1000;
      };
      
      const start = Math.floor(toSec(timeMatch[1]));
      const end = Math.floor(toSec(timeMatch[2]));
      let text = lines[i + 1].trim();
      
      // Remove VTT tags and clean text
      text = text.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
      
      if (text && !text.match(/^(WEBVTT|Kind:|Language:)/i)) {
        segments.push({ text, start, duration: Math.max(1, end - start) });
      }
    }
  }
  
  return segments;
}

// Helper function to parse XML transcript format (YouTube's native format)
function parseXMLTranscript(xmlData: string): FallbackTranscriptSegment[] {
  const segments: FallbackTranscriptSegment[] = [];
  
  // Match <text start="X" dur="Y">content</text> patterns
  const textPattern = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([^<]*)<\/text>/g;
  let match;
  
  while ((match = textPattern.exec(xmlData)) !== null) {
    const start = parseFloat(match[1]) || 0;
    const duration = parseFloat(match[2]) || 1;
    let text = match[3] || '';
    
    // Decode HTML entities
    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/\n/g, ' ')
      .trim();
    
    if (text) {
      segments.push({
        text,
        start: Math.floor(start),
        duration: Math.max(1, Math.floor(duration))
      });
    }
  }
  
  return segments;
}

