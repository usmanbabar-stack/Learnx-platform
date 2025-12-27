import { Innertube, UniversalCache } from 'youtubei.js';
import { logger } from '../utils/logger';

export interface InnertubeTranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

let innertubeClient: Innertube | null = null;
let clientInitPromise: Promise<Innertube> | null = null;

// Suppress youtubei.js parser warnings for unknown YouTube API classes
// These are non-fatal - the library handles them by JIT-generating classes
function suppressParserWarnings(): void {
  try {
    // Override the parser's error handler to suppress non-fatal warnings
    const originalConsoleWarn = console.warn;
    const originalConsoleError = console.error;
    
    // Filter out youtubei.js parser warnings
    const filterYoutubeJsWarnings = (method: typeof console.warn) => (...args: any[]) => {
      const message = args.join(' ');
      // Suppress known non-fatal parser warnings
      if (message.includes('[YOUTUBEJS][Parser]') || 
          message.includes('not found!') ||
          message.includes('Type mismatch') ||
          message.includes('CourseProgressView') ||
          message.includes('Introspected and JIT generated')) {
        // Log at debug level instead of polluting console
        logger.debug(`Suppressed youtubei.js warning: ${message.slice(0, 200)}`);
        return;
      }
      method.apply(console, args);
    };
    
    console.warn = filterYoutubeJsWarnings(originalConsoleWarn);
    console.error = filterYoutubeJsWarnings(originalConsoleError);
  } catch (e) {
    // Ignore if we can't suppress warnings
  }
}

// Initialize warning suppression
suppressParserWarnings();

// Initialize or get cached client with retry logic
async function getClient(): Promise<Innertube> {
  if (innertubeClient) {
    return innertubeClient;
  }
  
  if (clientInitPromise) {
    return clientInitPromise;
  }
  
  clientInitPromise = (async () => {
    const maxRetries = 3;
    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = await Innertube.create({
          lang: 'en',
          location: 'US',
          retrieve_player: false,
          // Enable caching to improve performance
          cache: new UniversalCache(false),
          // Generate session data for better compatibility
          generate_session_locally: true,
        });
        
        logger.info(`Innertube client initialized successfully (attempt ${attempt})`);
        return client;
      } catch (error: any) {
        lastError = error;
        logger.warn(`Innertube client init failed (attempt ${attempt}/${maxRetries}): ${error?.message}`);
        
        if (attempt < maxRetries) {
          // Wait before retry with exponential backoff
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    throw lastError || new Error('Failed to initialize Innertube client');
  })();
  
  try {
    innertubeClient = await clientInitPromise;
  } finally {
    clientInitPromise = null;
  }
  
  return innertubeClient;
}

// Reset client (useful if client becomes stale)
export function resetInnertubeClient(): void {
  innertubeClient = null;
  clientInitPromise = null;
  logger.info('Innertube client reset');
}

// Priority order for languages (English first, then Hindi, then others)
const LANGUAGE_PRIORITY = ['en', 'en-US', 'en-GB', 'en-IN', 'hi', 'hi-IN', 'ur'];

// Safe wrapper to handle parser errors gracefully
async function safeGetInfo(client: Innertube, videoId: string): Promise<any> {
  try {
    // Temporarily suppress stderr for this operation
    const info = await client.getInfo(videoId);
    return info;
  } catch (error: any) {
    // Check if it's a parser error (non-fatal for our use case)
    if (error?.message?.includes('not found') || 
        error?.message?.includes('Type mismatch') ||
        error?.info) {
      // Parser warnings are non-fatal, the info object may still be usable
      logger.debug(`Parser warning during getInfo for ${videoId}: ${error?.message}`);
      throw error; // Re-throw to be handled by retry logic
    }
    throw error;
  }
}

// Safe wrapper to get transcript with fallback methods
async function safeGetTranscript(info: any, videoId: string): Promise<any> {
  try {
    const transcriptInfo = await info.getTranscript();
    return transcriptInfo;
  } catch (error: any) {
    // Some video types (shorts, live streams) may not have transcripts
    if (error?.message?.includes('Transcript') || 
        error?.message?.includes('not available')) {
      logger.info(`Transcript not available for ${videoId}: ${error?.message}`);
      return null;
    }
    throw error;
  }
}

export async function fetchTranscriptViaInnertube(
  videoId: string,
  preferredLangs: string[] = LANGUAGE_PRIORITY
): Promise<InnertubeTranscriptSegment[]> {
  const startTime = Date.now();
  const maxRetries = 3;
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Reset client on retry attempts for fresh session
      if (attempt > 1) {
        resetInnertubeClient();
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
      }
      
      const client = await getClient();
      
      // Get video info with error handling for parser warnings
      let info: any;
      try {
        info = await client.getInfo(videoId);
      } catch (infoError: any) {
        const errorMsg = infoError?.message || String(infoError);
        // If client seems stale or 400 error, reset and retry
        if (attempt < maxRetries && (
            errorMsg.includes('session') || 
            errorMsg.includes('token') ||
            errorMsg.includes('400') ||
            errorMsg.includes('403'))) {
          logger.info(`Resetting Innertube client (attempt ${attempt}): ${errorMsg}`);
          continue;
        }
        throw infoError;
      }
      
      if (!info) {
        logger.warn(`No video info returned for ${videoId}`);
        return [];
      }
      
      // Check if video has captions before requesting transcript
      const hasCaptions = info.captions || info.has_captions;
      if (hasCaptions === false) {
        logger.info(`Video ${videoId} has no captions available`);
        return [];
      }

      // Get transcript info - this contains available languages
      let transcriptInfo: any;
      try {
        transcriptInfo = await info.getTranscript();
      } catch (transcriptError: any) {
        // Handle videos without transcripts gracefully
        const errorMsg = transcriptError?.message || String(transcriptError);
        
        // 400 errors usually mean no captions available for this video
        if (errorMsg.includes('400') || errorMsg.includes('status code 400')) {
          logger.info(`Video ${videoId} has no captions (400 response)`);
          return [];
        }
        
        if (errorMsg.includes('Transcript') || 
            errorMsg.includes('not available') ||
            errorMsg.includes('disabled')) {
          logger.info(`No transcript available via Innertube for ${videoId}: ${errorMsg}`);
          return [];
        }
        
        // For other errors, retry with fresh client
        if (attempt < maxRetries) {
          logger.warn(`Transcript fetch failed (attempt ${attempt}), retrying: ${errorMsg}`);
          continue;
        }
        throw transcriptError;
      }
      
      if (!transcriptInfo) {
        logger.info(`No transcript available via Innertube for ${videoId}`);
        return [];
      }
      
      // Log available languages
      const languages = transcriptInfo.languages || [];
      if (languages.length > 0) {
        const availableLangs = languages.map((l: any) => (l as any).language_code || (l as any).id || String(l)).join(', ');
        logger.info(`Available transcript languages for ${videoId}: ${availableLangs}`);
        
        // Try to select preferred language (English first)
        for (const prefLang of preferredLangs) {
          const match = languages.find((l: any) => {
            const langCode = (l as any).language_code || (l as any).id || String(l);
            return langCode.toLowerCase().startsWith(prefLang.toLowerCase());
          });
          if (match) {
            try {
              const langCode = (match as any).language_code || (match as any).id || String(match);
              logger.info(`Selecting transcript language: ${langCode}`);
              await transcriptInfo.selectLanguage(langCode);
              break;
            } catch (e) {
              logger.debug(`Could not select language ${prefLang}: ${e}`);
            }
          }
        }
      }
      
      // Get the transcript content with multiple fallback paths
      const transcript = transcriptInfo.transcript;
      let segments: InnertubeTranscriptSegment[] = [];
      
      // Try primary path: transcript.content.body.initial_segments
      if (transcript?.content?.body?.initial_segments) {
        const selectedLang = (transcript.content?.body as any)?.language_code || 'unknown';
        logger.info(`Extracting transcript in language: ${selectedLang}`);
        
        segments = extractSegmentsFromBody(transcript.content.body.initial_segments);
      }
      // Fallback path 1: transcript.content.body.cues
      else if (transcript?.content?.body?.cues) {
        logger.info(`Using fallback cues extraction for ${videoId}`);
        segments = extractSegmentsFromCues(transcript.content.body.cues);
      }
      // Fallback path 2: direct segments array
      else if (Array.isArray(transcript?.segments)) {
        logger.info(`Using direct segments extraction for ${videoId}`);
        segments = extractSegmentsFromBody(transcript.segments);
      }
      
      const elapsed = Date.now() - startTime;
      
      if (segments.length > 0) {
        logger.info(`✅ Innertube extracted ${segments.length} segments for ${videoId} in ${elapsed}ms`);
        return segments;
      }
      
      logger.info(`Innertube returned 0 segments for ${videoId} after ${elapsed}ms`);
      return [];
      
    } catch (error: any) {
      lastError = error;
      const elapsed = Date.now() - startTime;
      
      // Check if error is recoverable
      const errorMsg = error?.message || String(error);
      const isRecoverable = errorMsg.includes('network') || 
                           errorMsg.includes('timeout') ||
                           errorMsg.includes('ECONNRESET') ||
                           errorMsg.includes('session');
      
      if (attempt < maxRetries && isRecoverable) {
        logger.warn(`Innertube attempt ${attempt} failed for ${videoId}, retrying: ${errorMsg}`);
        resetInnertubeClient();
        await new Promise(resolve => setTimeout(resolve, 500 * attempt));
        continue;
      }
      
      logger.warn(`Innertube failed for ${videoId} after ${elapsed}ms: ${errorMsg}`);
    }
  }
  
  return [];
}

// Extract segments from initial_segments or similar structure
function extractSegmentsFromBody(rawSegments: any[]): InnertubeTranscriptSegment[] {
  const segments: InnertubeTranscriptSegment[] = [];
  
  for (const segment of rawSegments) {
    try {
      // Each segment has start_ms, end_ms, and snippet with text
      const startMs = segment.start_ms ? Number(segment.start_ms) : 
                      segment.startMs ? Number(segment.startMs) :
                      segment.start ? Number(segment.start) * 1000 : 0;
      const endMs = segment.end_ms ? Number(segment.end_ms) : 
                    segment.endMs ? Number(segment.endMs) :
                    segment.end ? Number(segment.end) * 1000 : startMs + 1000;
      
      let text = '';
      if (segment.snippet?.text) {
        text = segment.snippet.text;
      } else if (segment.snippet?.runs) {
        text = segment.snippet.runs.map((r: any) => r.text || '').join('');
      } else if (segment.text) {
        text = segment.text;
      } else if (typeof segment === 'string') {
        text = segment;
      }
      
      text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      
      if (text) {
        segments.push({
          text,
          start: Math.floor(startMs / 1000),
          duration: Math.max(1, Math.floor((endMs - startMs) / 1000))
        });
      }
    } catch (e) {
      // Skip malformed segments
      logger.debug(`Skipping malformed segment: ${e}`);
    }
  }
  
  return segments;
}

// Extract segments from cues format
function extractSegmentsFromCues(cues: any[]): InnertubeTranscriptSegment[] {
  const segments: InnertubeTranscriptSegment[] = [];
  
  for (const cue of cues) {
    try {
      const startMs = cue.start_time_ms ? Number(cue.start_time_ms) : 
                      cue.startTime ? Number(cue.startTime) * 1000 : 0;
      const endMs = cue.end_time_ms ? Number(cue.end_time_ms) :
                    cue.endTime ? Number(cue.endTime) * 1000 : startMs + 1000;
      
      let text = cue.text || cue.content || '';
      if (cue.runs) {
        text = cue.runs.map((r: any) => r.text || '').join('');
      }
      
      text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      
      if (text) {
        segments.push({
          text,
          start: Math.floor(startMs / 1000),
          duration: Math.max(1, Math.floor((endMs - startMs) / 1000))
        });
      }
    } catch (e) {
      logger.debug(`Skipping malformed cue: ${e}`);
    }
  }
  
  return segments;
}
