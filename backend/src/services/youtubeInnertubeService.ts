import { Innertube, UniversalCache } from 'youtubei.js';
import { logger } from '../utils/logger';
import axios from 'axios';

export interface InnertubeTranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

let innertubeClient: Innertube | null = null;
let clientInitPromise: Promise<Innertube> | null = null;

const LANGUAGE_PRIORITY = ['en', 'en-US', 'en-GB', 'en-IN', 'hi', 'hi-IN', 'ur'];

(function suppressParserWarnings() {
  const origWarn = console.warn;
  const origErr = console.error;
  const filter = (method: typeof console.warn) => (...args: any[]) => {
    const msg = args.join(' ');
    if (msg.includes('[YOUTUBEJS]') || msg.includes('ParsingError') || msg.includes('Type mismatch'))
      return;
    method.apply(console, args);
  };
  console.warn = filter(origWarn);
  console.error = filter(origErr);
})();

async function getClient(): Promise<Innertube> {
  if (innertubeClient) return innertubeClient;
  if (clientInitPromise) return clientInitPromise;

  clientInitPromise = (async () => {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const client = await Innertube.create({
          lang: 'en',
          location: 'US',
          retrieve_player: true,
          cache: new UniversalCache(false),
          generate_session_locally: true,
        });
        logger.info(`Innertube client initialized (attempt ${attempt})`);
        return client;
      } catch (error: any) {
        lastError = error;
        logger.warn(`Innertube init failed (attempt ${attempt}/${maxRetries}): ${error?.message}`);
        if (attempt < maxRetries) await new Promise(r => setTimeout(r, 1000 * attempt));
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

export function resetInnertubeClient(): void {
  innertubeClient = null;
  clientInitPromise = null;
}

/**
 * Parse YouTube timedtext XML into segments.
 * Format: <text start="1.23" dur="4.56">caption text</text>
 */
function parseTimedTextXml(xml: string): InnertubeTranscriptSegment[] {
  const segments: InnertubeTranscriptSegment[] = [];
  const pattern = /<text\s+start="([^"]+)"(?:\s+dur="([^"]+)")?[^>]*>([^<]*)<\/text>/g;
  let match;

  while ((match = pattern.exec(xml)) !== null) {
    const start = parseFloat(match[1]) || 0;
    const duration = parseFloat(match[2]) || 1;
    let text = match[3] || '';

    text = text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/\n/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text) {
      segments.push({ text, start: Math.floor(start), duration: Math.max(1, Math.floor(duration)) });
    }
  }
  return segments;
}

/**
 * Parse JSON3 caption format (events array with segs)
 */
function parseJson3(data: any): InnertubeTranscriptSegment[] {
  const events: any[] = data?.events || [];
  const segments: InnertubeTranscriptSegment[] = [];

  for (const ev of events) {
    const startMs = ev?.tStartMs;
    const durMs = ev?.dDurationMs || 0;
    const parts = ev?.segs || [];
    if (typeof startMs !== 'number') continue;

    let text = '';
    if (Array.isArray(parts)) {
      text = parts.map((p: any) => p?.utf8 || p?.text || '').join('').trim();
    }
    text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    segments.push({
      text,
      start: Math.max(0, Math.floor(startMs / 1000)),
      duration: Math.max(1, Math.floor((durMs || 1000) / 1000)),
    });
  }
  return segments;
}

/**
 * Strategy 1: Use Innertube getBasicInfo → caption_tracks → fetch timedtext XML
 * This bypasses the blocked /get_transcript endpoint.
 */
async function fetchViaCaptionTracks(client: Innertube, videoId: string): Promise<InnertubeTranscriptSegment[]> {
  const info = await client.getInfo(videoId);
  const captionTracks: any[] = (info as any).captions?.caption_tracks || [];

  if (captionTracks.length === 0) {
    logger.info(`No caption tracks for ${videoId}`);
    return [];
  }

  const langCodes = captionTracks.map((t: any) => `${t.language_code}${t.kind === 'asr' ? '(auto)' : ''}`).join(', ');
  logger.info(`Caption tracks for ${videoId}: ${langCodes}`);

  // Prefer manual captions over auto-generated, prefer English
  let chosen: any = null;
  for (const lang of LANGUAGE_PRIORITY) {
    chosen = captionTracks.find((t: any) => t.language_code === lang && t.kind !== 'asr');
    if (chosen) break;
  }
  if (!chosen) {
    for (const lang of LANGUAGE_PRIORITY) {
      chosen = captionTracks.find((t: any) => t.language_code === lang);
      if (chosen) break;
    }
  }
  if (!chosen) chosen = captionTracks[0];

  if (!chosen?.base_url) {
    logger.warn(`No base_url on chosen caption track for ${videoId}`);
    return [];
  }

  logger.info(`Fetching caption track: lang=${chosen.language_code}, kind=${chosen.kind || 'manual'}`);

  // Try JSON3 format first (richer), then raw XML
  const urls = [
    `${chosen.base_url}&fmt=json3`,
    chosen.base_url,
  ];

  for (const url of urls) {
    try {
      const { data } = await axios.get(url, {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        responseType: 'text',
      });

      if (!data) continue;

      // Try JSON3 parse
      if (typeof data === 'string' && data.trim().startsWith('{')) {
        try {
          const json = JSON.parse(data);
          const segs = parseJson3(json);
          if (segs.length > 0) return segs;
        } catch {}
      }

      // Try XML parse
      if (typeof data === 'string' && (data.includes('<text ') || data.includes('<?xml'))) {
        const segs = parseTimedTextXml(data);
        if (segs.length > 0) return segs;
      }
    } catch (e: any) {
      logger.debug(`Caption URL failed for ${videoId}: ${e?.message}`);
    }
  }

  return [];
}

/**
 * Strategy 2 (legacy): Use getTranscript() — may fail with 400 on newer YouTube API
 */
async function fetchViaGetTranscript(client: Innertube, videoId: string): Promise<InnertubeTranscriptSegment[]> {
  const info = await client.getInfo(videoId);
  if (!info) return [];

  const transcriptInfo = await info.getTranscript();
  if (!transcriptInfo) return [];

  const transcript = transcriptInfo.transcript;
  if (!transcript) return [];

  // Try multiple extraction paths
  const body = transcript?.content?.body as any;
  const rawSegments =
    body?.initial_segments ||
    body?.cues ||
    (Array.isArray((transcript as any)?.segments) ? (transcript as any).segments : null);

  if (!rawSegments) return [];

  const segments: InnertubeTranscriptSegment[] = [];
  for (const seg of rawSegments) {
    try {
      const startMs = Number(seg.start_ms || seg.startMs || (seg.start ? seg.start * 1000 : 0));
      const endMs = Number(seg.end_ms || seg.endMs || (seg.end ? seg.end * 1000 : startMs + 1000));
      let text = '';
      if (seg.snippet?.text) text = seg.snippet.text;
      else if (seg.snippet?.runs) text = seg.snippet.runs.map((r: any) => r.text || '').join('');
      else if (seg.text) text = seg.text;
      text = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      if (text) {
        segments.push({ text, start: Math.floor(startMs / 1000), duration: Math.max(1, Math.floor((endMs - startMs) / 1000)) });
      }
    } catch {}
  }
  return segments;
}

/**
 * Main entry point. Tries caption-track approach first (reliable), then legacy getTranscript.
 */
export async function fetchTranscriptViaInnertube(
  videoId: string,
  preferredLangs: string[] = LANGUAGE_PRIORITY
): Promise<InnertubeTranscriptSegment[]> {
  const startTime = Date.now();
  const maxRetries = 2;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 1) {
        resetInnertubeClient();
        await new Promise(r => setTimeout(r, 500 * attempt));
      }

      const client = await getClient();

      // Strategy 1: caption_tracks + timedtext (works even when /get_transcript is blocked)
      try {
        const segs = await fetchViaCaptionTracks(client, videoId);
        if (segs.length > 0) {
          logger.info(`✅ Innertube (caption tracks) ${segs.length} segs in ${Date.now() - startTime}ms for ${videoId}`);
          return segs;
        }
      } catch (e: any) {
        logger.warn(`Innertube caption-tracks failed for ${videoId}: ${e?.message}`);
      }

      // Strategy 2: legacy getTranscript (may 400, but try anyway)
      try {
        const segs = await fetchViaGetTranscript(client, videoId);
        if (segs.length > 0) {
          logger.info(`✅ Innertube (getTranscript) ${segs.length} segs in ${Date.now() - startTime}ms for ${videoId}`);
          return segs;
        }
      } catch (e: any) {
        const msg = e?.message || '';
        if (msg.includes('400') || msg.includes('403')) {
          logger.info(`Innertube getTranscript blocked (${msg.slice(0, 80)}) for ${videoId}`);
        } else if (attempt < maxRetries) {
          logger.warn(`Innertube getTranscript error, retrying: ${msg.slice(0, 120)}`);
          continue;
        }
      }

      // Both strategies returned 0 segments — no captions on this video
      logger.info(`Innertube: no captions found for ${videoId} after ${Date.now() - startTime}ms`);
      return [];

    } catch (error: any) {
      logger.warn(`Innertube attempt ${attempt} failed for ${videoId}: ${error?.message}`);
      if (attempt < maxRetries) {
        resetInnertubeClient();
      }
    }
  }

  return [];
}
