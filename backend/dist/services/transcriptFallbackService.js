"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchTranscriptViaWatchPage = fetchTranscriptViaWatchPage;
const axios_1 = __importDefault(require("axios"));
const logger_1 = require("../utils/logger");
function extractPlayerResponse(html) {
    // Try ytInitialPlayerResponse assignment
    const re = /ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/;
    const m = html.match(re);
    if (m && m[1]) {
        try {
            return JSON.parse(m[1]);
        }
        catch { }
    }
    // Fallback: look for "playerResponse" in ytcfg
    const re2 = /\"playerResponse\":(\{[\s\S]*?\})\s*,\"responseContext\"/;
    const m2 = html.match(re2);
    if (m2 && m2[1]) {
        try {
            return JSON.parse(m2[1]);
        }
        catch { }
    }
    return null;
}
async function fetchTranscriptViaWatchPage(videoId, preferredLangs = ['en', 'en-US', 'en-GB']) {
    try {
        const url = `https://www.youtube.com/watch?v=${videoId}`;
        const { data: html } = await axios_1.default.get(url, {
            timeout: 5000,
            headers: {
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        const pr = extractPlayerResponse(html);
        const tracks = pr?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
        if (!tracks.length) {
            logger_1.logger.info(`No caption tracks found in playerResponse for video: ${videoId}`);
            return [];
        }
        logger_1.logger.info(`Found ${tracks.length} caption track(s) for video: ${videoId}`);
        tracks.forEach((t, i) => logger_1.logger.debug(`Track ${i}: ${t.languageCode || 'unknown'}`));
        // Choose best track
        let chosen = tracks.find(t => preferredLangs.includes(t.languageCode)) || tracks[0];
        if (!chosen?.baseUrl)
            return [];
        // Try multiple formats sequentially for robustness
        const candidates = [];
        const base = chosen.baseUrl;
        if (base.includes('fmt='))
            candidates.push(base);
        candidates.push(`${base}&fmt=json3`);
        candidates.push(`${base}&fmt=srv3`);
        candidates.push(`${base}&fmt=vtt`);
        for (const urlCandidate of candidates) {
            try {
                const { data } = await axios_1.default.get(urlCandidate, {
                    timeout: 5000,
                    headers: {
                        'Accept-Language': 'en-US,en;q=0.9',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    }
                });
                // VTT text format
                if (typeof data === 'string') {
                    const lines = String(data).split(/\r?\n/);
                    const segs = [];
                    for (let i = 0; i < lines.length; i++) {
                        const m = lines[i].match(/(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})/);
                        if (m && lines[i + 1]) {
                            const toSec = (hhmmss) => {
                                const [h, mn, rs] = hhmmss.split(':');
                                const [sec, ms] = rs.split('.');
                                return Number(h) * 3600 + Number(mn) * 60 + Number(sec) + Number(ms) / 1000;
                            };
                            const start = Math.floor(toSec(m[1]));
                            const end = Math.floor(toSec(m[2]));
                            let text = lines[i + 1].trim();
                            // Remove VTT tags like <c>, <i>, etc.
                            text = text.replace(/<[^>]+>/g, '').trim();
                            const dur = Math.max(0, end - start);
                            if (text && text.length > 0 && !text.match(/^WEBVTT/i)) {
                                segs.push({ text, start, duration: dur });
                            }
                        }
                    }
                    if (segs.length) {
                        logger_1.logger.info(`Watch page fallback extracted ${segs.length} VTT segments for video: ${videoId}`);
                        return segs;
                    }
                    continue;
                }
                // JSON format (json3 or srv3)
                const events = data?.events || [];
                const segments = [];
                for (const ev of events) {
                    const startMs = ev?.tStartMs;
                    const durMs = ev?.dDurationMs || 0;
                    const parts = ev?.segs || ev?.segments || [];
                    if (typeof startMs !== 'number' || !Array.isArray(parts))
                        continue;
                    const text = parts.map((p) => p?.utf8 || p?.text || '').join('').trim();
                    if (!text)
                        continue;
                    segments.push({ text, start: Math.max(0, Math.floor(startMs / 1000)), duration: Math.max(0, Math.floor((durMs || 0) / 1000)) });
                }
                if (segments.length) {
                    logger_1.logger.info(`Watch page fallback extracted ${segments.length} JSON segments for video: ${videoId}`);
                    return segments;
                }
            }
            catch (e) {
                logger_1.logger.debug(`Failed to fetch caption from URL format, trying next: ${e instanceof Error ? e.message : String(e)}`);
            }
        }
        return [];
    }
    catch (e) {
        logger_1.logger.warn('Watch-page transcript fallback failed for %s: %o', videoId, e);
        return [];
    }
}
//# sourceMappingURL=transcriptFallbackService.js.map