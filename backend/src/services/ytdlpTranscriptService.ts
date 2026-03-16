import YTDlpWrap from 'yt-dlp-wrap';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { logger } from '../utils/logger';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

class RateLimiter {
  private lastRequestTime: number = 0;
  private cooldownUntil: number = 0;
  private consecutiveErrors: number = 0;
  // ⚡ OPTIMIZED: Reduced from 2000ms to 500ms for faster single requests
  // Rate limiting still kicks in for consecutive errors
  private readonly minDelay = 500;
  private readonly cooldownDuration = 60000;
  private readonly maxConsecutiveErrors = 3;

  async waitIfNeeded(): Promise<boolean> {
    const now = Date.now();
    
    if (now < this.cooldownUntil) {
      const waitTime = Math.ceil((this.cooldownUntil - now) / 1000);
      logger.warn(`yt-dlp in cooldown mode, ${waitTime}s remaining. Skipping request.`);
      return false;
    }
    
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.minDelay) {
      const delay = this.minDelay - timeSinceLastRequest;
      logger.debug(`Rate limiting yt-dlp: waiting ${delay}ms`);
      await sleep(delay);
    }
    
    this.lastRequestTime = Date.now();
    return true;
  }

  onSuccess(): void {
    this.consecutiveErrors = 0;
  }

  onRateLimit(): void {
    this.consecutiveErrors++;
    if (this.consecutiveErrors >= this.maxConsecutiveErrors) {
      this.cooldownUntil = Date.now() + this.cooldownDuration;
      logger.warn(`yt-dlp hit ${this.consecutiveErrors} consecutive rate limits. Entering cooldown for ${this.cooldownDuration/1000}s`);
    }
  }
}

const rateLimiter = new RateLimiter();

function parseVttTimestamp(timeStr: string): number {
  const parts = timeStr.replace(',', '.').split(':');
  const hours = parseFloat(parts[0]);
  const minutes = parseFloat(parts[1]);
  const seconds = parseFloat(parts[2]);
  return hours * 3600 + minutes * 60 + seconds;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function fetchTranscriptWithYtDlp(videoId: string, retryCount: number = 0): Promise<TranscriptSegment[]> {
  const enabled = String(process.env.YTDLP_ENABLED || 'true').toLowerCase() === 'true';
  if (!enabled) return [];

  const canProceed = await rateLimiter.waitIfNeeded();
  if (!canProceed) {
    return [];
  }

  const maxRetries = 2;
  const tmpDir = path.join(os.tmpdir(), `learnx_ytdlp_${videoId}_${Date.now()}`);
  
  try {
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const ytDlp = new YTDlpWrap();
    const url = `https://www.youtube.com/watch?v=${videoId}`;

    // Allow configuring which subtitle languages to download.
    // Previously this was hard-coded to English only (`en.*,en`), which breaks
    // for videos in other languages (like Urdu/Hindi). Now we default to `all`
    // so yt-dlp will download any available subtitle track, and we parse it
    // regardless of language.
    const subLangs = process.env.YTDLP_SUB_LANGS || 'all';

    await ytDlp.execPromise([
      url,
      '--skip-download',
      '--write-subs',
      '--write-auto-subs',
      '--sub-format', 'vtt',
      '--sub-langs', subLangs,
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      '--sleep-requests', '0.5',
      '--retries', '2',
      '--fragment-retries', '2',
      '--no-warnings',
      '--no-check-certificate',
      '--ignore-errors',
      '-o', path.join(tmpDir, `${videoId}.%(ext)s`),
    ]);

    // Find VTT file
    const files = fs.readdirSync(tmpDir);
    const vttFile = files.find(f => f.endsWith('.vtt'));
    
    if (!vttFile) {
      logger.warn(`No VTT subtitle file found for video: ${videoId}`);
      return [];
    }

    const vttPath = path.join(tmpDir, vttFile);
    const vttContent = fs.readFileSync(vttPath, 'utf-8');
    
    // Parse VTT
    const lines = vttContent.split(/\r?\n/);
    const segments: TranscriptSegment[] = [];
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.includes('-->')) {
        const [startStr, endStr] = line.split('-->').map(s => s.trim());
        const start = parseVttTimestamp(startStr);
        const end = parseVttTimestamp(endStr);
        const duration = Math.max(0, end - start);
        
        // Get text from next line(s)
        let text = '';
        let j = i + 1;
        while (j < lines.length && lines[j].trim() && !lines[j].includes('-->')) {
          text += (text ? ' ' : '') + lines[j].trim();
          j++;
        }
        
        if (text && !text.startsWith('WEBVTT') && !text.match(/^\d+$/)) {
          // Remove VTT formatting tags
          text = text.replace(/<[^>]+>/g, '').trim();
          if (text) {
            segments.push({ text, start: Math.floor(start), duration: Math.floor(duration) });
          }
        }
        
        i = j - 1;
      }
    }

    if (segments.length > 0) {
      rateLimiter.onSuccess();
      logger.info(`yt-dlp extracted ${segments.length} subtitle segments for video: ${videoId}`);
    }
    return segments;
    
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    
    if (errorMsg.includes('429') || errorMsg.includes('Too Many Requests')) {
      rateLimiter.onRateLimit();
      
      if (retryCount < maxRetries) {
        const delay = Math.pow(2, retryCount + 1) * 1500;
        logger.warn(`Rate limited (429) for ${videoId}, retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
        
        try {
          if (fs.existsSync(tmpDir)) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
          }
        } catch {}
        
        await sleep(delay);
        return fetchTranscriptWithYtDlp(videoId, retryCount + 1);
      } else {
        logger.error(`Rate limit exceeded for ${videoId} after ${maxRetries} retries`);
      }
    } else if (!errorMsg.includes('No subtitles') && !errorMsg.includes('Requested format') && !errorMsg.includes('Unable to download')) {
      logger.warn(`yt-dlp subtitle extraction failed for ${videoId}: ${errorMsg.slice(0, 200)}`);
    }
    
    return [];
  } finally {
    // Cleanup temp directory
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    } catch (e) {
      logger.warn(`Failed to cleanup temp directory: ${tmpDir}`);
    }
  }
}

