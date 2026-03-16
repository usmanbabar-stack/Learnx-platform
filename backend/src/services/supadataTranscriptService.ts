import axios from 'axios';
import { logger } from '../utils/logger';

export interface SupadataTranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

const SUPADATA_BASE = 'https://api.supadata.ai/v1';

function getApiKey(): string | null {
  return process.env.SUPADATA_API_KEY || null;
}

/**
 * Fetch transcript via Supadata API (free tier: 200 credits/month).
 * Returns timed segments compatible with the rest of the pipeline.
 *
 * API: GET /v1/transcript?url={youtubeUrl}&lang=en
 * Auth: x-api-key header
 * Response: { content: [{ text, offset, duration, lang }], lang, availableLangs }
 *
 * For large videos the API may return HTTP 202 with a jobId — we poll until complete.
 */
export async function fetchTranscriptViaSupadata(videoId: string): Promise<SupadataTranscriptSegment[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    logger.warn('Supadata skipped: SUPADATA_API_KEY not set (set in Render env vars for transcript extraction)');
    return [];
  }

  const startTime = Date.now();
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    const { data, status } = await axios.get(`${SUPADATA_BASE}/transcript`, {
      params: { url, lang: 'en' },
      headers: { 'x-api-key': apiKey },
      timeout: 15000,
      validateStatus: (s) => s < 500,
    });

    // 202 = async job, poll for result
    if (status === 202 && data?.jobId) {
      return await pollJob(data.jobId, apiKey, videoId, startTime);
    }

    if (status === 404 || status === 422) {
      logger.info(`Supadata: no transcript available for ${videoId} (${status})`);
      return [];
    }

    if (status !== 200 || !data?.content) {
      logger.warn(`Supadata unexpected response for ${videoId}: status=${status}`);
      return [];
    }

    return parseResponse(data, videoId, startTime);
  } catch (e: any) {
    const msg = e?.message || '';
    if (msg.includes('timeout')) {
      logger.warn(`Supadata timeout for ${videoId} after ${Date.now() - startTime}ms`);
    } else {
      logger.warn(`Supadata failed for ${videoId}: ${msg.slice(0, 150)}`);
    }
    return [];
  }
}

async function pollJob(jobId: string, apiKey: string, videoId: string, startTime: number): Promise<SupadataTranscriptSegment[]> {
  const maxPolls = 10;
  const pollInterval = 3000;

  for (let i = 0; i < maxPolls; i++) {
    await new Promise(r => setTimeout(r, pollInterval));
    try {
      const { data, status } = await axios.get(`${SUPADATA_BASE}/transcript/result`, {
        params: { jobId },
        headers: { 'x-api-key': apiKey },
        timeout: 10000,
      });

      if (status === 200 && data?.content) {
        return parseResponse(data, videoId, startTime);
      }
      if (status === 202) continue; // still processing
      break; // unexpected status
    } catch {
      break;
    }
  }

  logger.warn(`Supadata job ${jobId} did not complete for ${videoId}`);
  return [];
}

function parseResponse(data: any, videoId: string, startTime: number): SupadataTranscriptSegment[] {
  const raw: any[] = Array.isArray(data.content) ? data.content : [];
  if (raw.length === 0) return [];

  // If content is a plain string (text=true mode), split into sentences
  if (typeof data.content === 'string') {
    const text = data.content as string;
    if (!text.trim()) return [];
    const sentences = text.match(/[^.!?]+[.!?]*/g) || [text];
    return sentences.map((s, i) => ({ text: s.trim(), start: i * 5, duration: 5 })).filter(s => s.text);
  }

  const segments: SupadataTranscriptSegment[] = [];
  for (const item of raw) {
    const text = (item.text || '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) continue;

    // offset & duration are in milliseconds
    const offsetMs = typeof item.offset === 'number' ? item.offset : 0;
    const durationMs = typeof item.duration === 'number' ? item.duration : 1000;

    segments.push({
      text,
      start: Math.max(0, Math.floor(offsetMs / 1000)),
      duration: Math.max(1, Math.floor(durationMs / 1000)),
    });
  }

  const elapsed = Date.now() - startTime;
  logger.info(`✅ Supadata: ${segments.length} segments in ${elapsed}ms for ${videoId}`);
  return segments;
}
