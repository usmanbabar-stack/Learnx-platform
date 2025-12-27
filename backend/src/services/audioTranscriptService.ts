import ffmpeg from 'fluent-ffmpeg';
import ffmpegPath from 'ffmpeg-static';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { logger } from '../utils/logger';
import OpenAI from 'openai';
import axios from 'axios';
import FormData from 'form-data';
import YTDlpWrap from 'yt-dlp-wrap';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

if (ffmpegPath) {
  try { ffmpeg.setFfmpegPath(ffmpegPath as string); } catch {}
}

async function extractAudioSnippetToFile(videoId: string, startSec: number, durationSec: number): Promise<string> {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `learnx_snippet_${videoId}_${Date.now()}.wav`);

  return new Promise<string>((resolve, reject) => {
    try {
      const streamUrl = url;
      const cmd = ffmpeg(streamUrl)
        .inputOptions(['-reconnect 1', '-reconnect_streamed 1', '-reconnect_delay_max 2'])
        .audioCodec('pcm_s16le')
        .format('wav');

      if (startSec > 0) cmd.seekInput(startSec);
      if (durationSec > 0) cmd.duration(durationSec);

      cmd
        .on('error', (err: unknown) => reject(err as Error))
        .on('end', () => resolve(tmpPath))
        .save(tmpPath);
    } catch (e) {
      reject(e);
    }
  });
}

export async function transcribeSnippetWithWhisper(
  videoId: string,
  currentTimeSec: number,
  windowSec: number = 90
): Promise<TranscriptSegment[]> {
  const enabled = String(process.env.WHISPER_ENABLED || 'false').toLowerCase() === 'true';
  if (!enabled) return [];

  const half = Math.floor(windowSec / 2);
  const startSec = Math.max(0, Math.floor(currentTimeSec - half));
  const durationSec = Math.max(10, Math.min(windowSec, 180));

  let tmpPath: string | null = null;
  try {
    tmpPath = await extractAudioSnippetToFile(videoId, startSec, durationSec);

    const provider = (process.env.ASR_PROVIDER || 'openai').toLowerCase();
    let resp: any;
    if (provider === 'local') {
      const asrUrl = process.env.ASR_SERVER_URL || 'http://localhost:8000/transcribe';
      const fd = new FormData();
      fd.append('file', fs.createReadStream(tmpPath));
      fd.append('response_format', 'verbose_json');
      fd.append('language', 'en');
      const { data } = await axios.post(asrUrl, fd, { headers: fd.getHeaders(), timeout: 15000 });
      resp = data;
    } else {
      const apiKey = process.env.OPENAI_API_KEY || '';
      if (!apiKey) {
        logger.warn('Whisper fallback requested but OPENAI_API_KEY is not set');
        return [];
      }
      const openai = new OpenAI({ apiKey });
      const fileStream = fs.createReadStream(tmpPath);
      const model = process.env.WHISPER_MODEL || 'whisper-1';
      // @ts-ignore - SDK types accept stream
      resp = await openai.audio.transcriptions.create({
        file: fileStream,
        model,
        response_format: 'verbose_json',
        temperature: 0,
        language: 'en'
      });
    }

    const segments: TranscriptSegment[] = [];
    if (Array.isArray(resp?.segments) && resp.segments.length) {
      for (const s of resp.segments) {
        if (typeof s?.start === 'number' && typeof s?.end === 'number' && s?.text) {
          segments.push({
            text: String(s.text).trim(),
            start: startSec + Math.max(0, Math.floor(s.start)),
            duration: Math.max(0, Math.floor(s.end - s.start))
          });
        }
      }
    } else if (typeof resp?.text === 'string' && resp.text.trim()) {
      segments.push({ text: String(resp.text).trim(), start: startSec, duration: durationSec });
    }

    return segments;
  } catch (e) {
    logger.warn('Whisper snippet transcription failed for %s: %o', videoId, e);
    return [];
  } finally {
    if (tmpPath) {
      try { fs.unlinkSync(tmpPath); } catch {}
    }
  }
}

// Generic full‑audio ASR helper.
// Supports either:
// - provider=openai  -> Whisper API (paid)
// - provider=local   -> local ASR server (e.g. Vosk) at ASR_SERVER_URL
export async function transcribeFullAudioWithWhisper(
  videoId: string
): Promise<TranscriptSegment[]> {
  const asrEnabled = String(
    process.env.ASR_ENABLED || process.env.WHISPER_ENABLED || 'false',
  ).toLowerCase() === 'true';
  const fullEnabled = String(
    process.env.FULL_AUDIO_TRANSCRIBE || 'false',
  ).toLowerCase() === 'true';
  if (!asrEnabled || !fullEnabled) return [];

  const provider = (process.env.ASR_PROVIDER || 'openai').toLowerCase();
  const apiKey = process.env.OPENAI_API_KEY || '';

  // Download full audio to temp file using ytdl + ffmpeg
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, `learnx_full_${videoId}_${Date.now()}.mp3`);

  const maxMinutes = Number(process.env.FULL_AUDIO_MAX_MINUTES || 20);
  const maxSeconds = Math.max(60, maxMinutes * 60);

  // Use yt-dlp instead of ytdl-core to avoid signature/JS extraction issues.
  // IMPORTANT: We do NOT rely on yt-dlp's ffmpeg post-processing, because
  // that requires a system ffmpeg binary. Instead we download the bestaudio
  // stream as-is, then use our own ffmpeg-static to transcode to MP3.
  const ytDlp = new YTDlpWrap();
  const audioTmpDir = path.join(os.tmpdir(), `learnx_ytdlp_audio_${videoId}_${Date.now()}`);
  if (!fs.existsSync(audioTmpDir)) {
    fs.mkdirSync(audioTmpDir, { recursive: true });
  }
  const outTemplate = path.join(audioTmpDir, `${videoId}.%(ext)s`);

  await ytDlp.execPromise([
    url,
    '--quiet',
    '--no-warnings',
    '--no-playlist',
    '-f',
    'bestaudio',
    '-o',
    outTemplate,
  ]);

  // Find the downloaded audio file
  const files = fs.readdirSync(audioTmpDir);
  const audioFile = files.find(f => f.startsWith(videoId + '.'));
  if (!audioFile) {
    throw new Error('yt-dlp did not produce an audio file for ASR');
  }
  const audioPath = path.join(audioTmpDir, audioFile);

  // Transcode to MP3 using ffmpeg-static
  await new Promise<void>((resolve, reject) => {
    try {
      ffmpeg(audioPath)
        .audioCodec('libmp3lame')
        .format('mp3')
        .duration(maxSeconds)
        .on('error', (err: unknown) => reject(err as Error))
        .on('end', () => resolve())
        .save(tmpPath);
    } catch (e) {
      reject(e as Error);
    }
  });

  try {
    if (provider === 'local') {
      // Local ASR (e.g. Vosk) HTTP server.
      // Expected API: POST /transcribe with multipart form-data:
      //   file: audio file
      //   response_format: "verbose_json"
      //   language: ISO language code (e.g. "en", "ur", "hi")
      const asrUrl = process.env.ASR_SERVER_URL || 'http://localhost:8000/transcribe';
      const fd = new FormData();
      fd.append('file', fs.createReadStream(tmpPath));
      fd.append('response_format', 'verbose_json');
      // Let the ASR engine auto-detect language by default. If you explicitly
      // set ASR_LANGUAGE in env (e.g. "ur" or "hi"), that will be sent instead.
      fd.append('language', process.env.ASR_LANGUAGE || 'auto');
      const { data } = await axios.post(asrUrl, fd, {
        headers: fd.getHeaders(),
        timeout: 60000,
      });
      const segs = Array.isArray(data?.segments) ? data.segments : [];
      return segs.map((s: any) => ({
        text: String(s.text || '').trim(),
        start: Math.max(0, Math.floor(s.start || 0)),
        duration: Math.max(
          0,
          Math.floor((s.end || 0) - (s.start || 0)),
        ),
      }));
    }

    if (!apiKey) {
      logger.warn('Full audio transcription requested but OPENAI_API_KEY not set');
      return [];
    }
    const openai = new OpenAI({ apiKey });
    const fileStream = fs.createReadStream(tmpPath);
    const model = process.env.WHISPER_MODEL || 'whisper-1';
    // @ts-ignore
    const resp: any = await openai.audio.transcriptions.create({
      file: fileStream,
      model,
      response_format: 'verbose_json',
      temperature: 0,
      language: 'en',
    });
    if (Array.isArray(resp?.segments)) {
      return resp.segments.map((s: any) => ({
        text: String(s.text || '').trim(),
        start: Math.max(0, Math.floor(s.start || 0)),
        duration: Math.max(
          0,
          Math.floor((s.end || 0) - (s.start || 0)),
        ),
      }));
    }
    if (typeof resp?.text === 'string' && resp.text.trim()) {
      return [{ text: String(resp.text).trim(), start: 0, duration: maxSeconds }];
    }
    return [];
  } catch (e) {
    logger.warn('Full audio transcription failed for %s: %o', videoId, e);
    return [];
  } finally {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}


