"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcribeSnippetWithWhisper = transcribeSnippetWithWhisper;
exports.transcribeFullAudioWithWhisper = transcribeFullAudioWithWhisper;
const fluent_ffmpeg_1 = __importDefault(require("fluent-ffmpeg"));
const ffmpeg_static_1 = __importDefault(require("ffmpeg-static"));
const fs_1 = __importDefault(require("fs"));
const os_1 = __importDefault(require("os"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../utils/logger");
const openai_1 = __importDefault(require("openai"));
const axios_1 = __importDefault(require("axios"));
const form_data_1 = __importDefault(require("form-data"));
const yt_dlp_wrap_1 = __importDefault(require("yt-dlp-wrap"));
if (ffmpeg_static_1.default) {
    try {
        fluent_ffmpeg_1.default.setFfmpegPath(ffmpeg_static_1.default);
    }
    catch { }
}
async function extractAudioSnippetToFile(videoId, startSec, durationSec) {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const tmpDir = os_1.default.tmpdir();
    const tmpPath = path_1.default.join(tmpDir, `learnx_snippet_${videoId}_${Date.now()}.wav`);
    return new Promise((resolve, reject) => {
        try {
            const streamUrl = url;
            const cmd = (0, fluent_ffmpeg_1.default)(streamUrl)
                .inputOptions(['-reconnect 1', '-reconnect_streamed 1', '-reconnect_delay_max 2'])
                .audioCodec('pcm_s16le')
                .format('wav');
            if (startSec > 0)
                cmd.seekInput(startSec);
            if (durationSec > 0)
                cmd.duration(durationSec);
            cmd
                .on('error', (err) => reject(err))
                .on('end', () => resolve(tmpPath))
                .save(tmpPath);
        }
        catch (e) {
            reject(e);
        }
    });
}
async function transcribeSnippetWithWhisper(videoId, currentTimeSec, windowSec = 90) {
    const enabled = String(process.env.WHISPER_ENABLED || 'false').toLowerCase() === 'true';
    if (!enabled)
        return [];
    const half = Math.floor(windowSec / 2);
    const startSec = Math.max(0, Math.floor(currentTimeSec - half));
    const durationSec = Math.max(10, Math.min(windowSec, 180));
    let tmpPath = null;
    try {
        tmpPath = await extractAudioSnippetToFile(videoId, startSec, durationSec);
        const provider = (process.env.ASR_PROVIDER || 'openai').toLowerCase();
        let resp;
        if (provider === 'local') {
            const asrUrl = process.env.ASR_SERVER_URL || 'http://localhost:8000/transcribe';
            const fd = new form_data_1.default();
            fd.append('file', fs_1.default.createReadStream(tmpPath));
            fd.append('response_format', 'verbose_json');
            fd.append('language', 'en');
            const { data } = await axios_1.default.post(asrUrl, fd, { headers: fd.getHeaders(), timeout: 15000 });
            resp = data;
        }
        else {
            const apiKey = process.env.OPENAI_API_KEY || '';
            if (!apiKey) {
                logger_1.logger.warn('Whisper fallback requested but OPENAI_API_KEY is not set');
                return [];
            }
            const openai = new openai_1.default({ apiKey });
            const fileStream = fs_1.default.createReadStream(tmpPath);
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
        const segments = [];
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
        }
        else if (typeof resp?.text === 'string' && resp.text.trim()) {
            segments.push({ text: String(resp.text).trim(), start: startSec, duration: durationSec });
        }
        return segments;
    }
    catch (e) {
        logger_1.logger.warn('Whisper snippet transcription failed for %s: %o', videoId, e);
        return [];
    }
    finally {
        if (tmpPath) {
            try {
                fs_1.default.unlinkSync(tmpPath);
            }
            catch { }
        }
    }
}
// Generic full‑audio ASR helper.
// Supports either:
// - provider=openai  -> Whisper API (paid)
// - provider=local   -> local ASR server (e.g. Vosk) at ASR_SERVER_URL
async function transcribeFullAudioWithWhisper(videoId) {
    const asrEnabled = String(process.env.ASR_ENABLED || process.env.WHISPER_ENABLED || 'false').toLowerCase() === 'true';
    const fullEnabled = String(process.env.FULL_AUDIO_TRANSCRIBE || 'false').toLowerCase() === 'true';
    if (!asrEnabled || !fullEnabled)
        return [];
    const provider = (process.env.ASR_PROVIDER || 'openai').toLowerCase();
    const apiKey = process.env.OPENAI_API_KEY || '';
    // Download full audio to temp file using ytdl + ffmpeg
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    const tmpDir = os_1.default.tmpdir();
    const tmpPath = path_1.default.join(tmpDir, `learnx_full_${videoId}_${Date.now()}.mp3`);
    const maxMinutes = Number(process.env.FULL_AUDIO_MAX_MINUTES || 20);
    const maxSeconds = Math.max(60, maxMinutes * 60);
    // Use yt-dlp instead of ytdl-core to avoid signature/JS extraction issues.
    // IMPORTANT: We do NOT rely on yt-dlp's ffmpeg post-processing, because
    // that requires a system ffmpeg binary. Instead we download the bestaudio
    // stream as-is, then use our own ffmpeg-static to transcode to MP3.
    const ytDlp = new yt_dlp_wrap_1.default();
    const audioTmpDir = path_1.default.join(os_1.default.tmpdir(), `learnx_ytdlp_audio_${videoId}_${Date.now()}`);
    if (!fs_1.default.existsSync(audioTmpDir)) {
        fs_1.default.mkdirSync(audioTmpDir, { recursive: true });
    }
    const outTemplate = path_1.default.join(audioTmpDir, `${videoId}.%(ext)s`);
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
    const files = fs_1.default.readdirSync(audioTmpDir);
    const audioFile = files.find(f => f.startsWith(videoId + '.'));
    if (!audioFile) {
        throw new Error('yt-dlp did not produce an audio file for ASR');
    }
    const audioPath = path_1.default.join(audioTmpDir, audioFile);
    // Transcode to MP3 using ffmpeg-static
    await new Promise((resolve, reject) => {
        try {
            (0, fluent_ffmpeg_1.default)(audioPath)
                .audioCodec('libmp3lame')
                .format('mp3')
                .duration(maxSeconds)
                .on('error', (err) => reject(err))
                .on('end', () => resolve())
                .save(tmpPath);
        }
        catch (e) {
            reject(e);
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
            const fd = new form_data_1.default();
            fd.append('file', fs_1.default.createReadStream(tmpPath));
            fd.append('response_format', 'verbose_json');
            // Let the ASR engine auto-detect language by default. If you explicitly
            // set ASR_LANGUAGE in env (e.g. "ur" or "hi"), that will be sent instead.
            fd.append('language', process.env.ASR_LANGUAGE || 'auto');
            const { data } = await axios_1.default.post(asrUrl, fd, {
                headers: fd.getHeaders(),
                timeout: 60000,
            });
            const segs = Array.isArray(data?.segments) ? data.segments : [];
            return segs.map((s) => ({
                text: String(s.text || '').trim(),
                start: Math.max(0, Math.floor(s.start || 0)),
                duration: Math.max(0, Math.floor((s.end || 0) - (s.start || 0))),
            }));
        }
        if (!apiKey) {
            logger_1.logger.warn('Full audio transcription requested but OPENAI_API_KEY not set');
            return [];
        }
        const openai = new openai_1.default({ apiKey });
        const fileStream = fs_1.default.createReadStream(tmpPath);
        const model = process.env.WHISPER_MODEL || 'whisper-1';
        // @ts-ignore
        const resp = await openai.audio.transcriptions.create({
            file: fileStream,
            model,
            response_format: 'verbose_json',
            temperature: 0,
            language: 'en',
        });
        if (Array.isArray(resp?.segments)) {
            return resp.segments.map((s) => ({
                text: String(s.text || '').trim(),
                start: Math.max(0, Math.floor(s.start || 0)),
                duration: Math.max(0, Math.floor((s.end || 0) - (s.start || 0))),
            }));
        }
        if (typeof resp?.text === 'string' && resp.text.trim()) {
            return [{ text: String(resp.text).trim(), start: 0, duration: maxSeconds }];
        }
        return [];
    }
    catch (e) {
        logger_1.logger.warn('Full audio transcription failed for %s: %o', videoId, e);
        return [];
    }
    finally {
        try {
            fs_1.default.unlinkSync(tmpPath);
        }
        catch { }
    }
}
//# sourceMappingURL=audioTranscriptService.js.map