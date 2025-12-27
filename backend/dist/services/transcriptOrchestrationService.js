"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transcriptOrchestrationService = exports.TranscriptOrchestrationService = void 0;
const logger_1 = require("../utils/logger");
const transcriptFallbackService_1 = require("./transcriptFallbackService");
const ytdlpTranscriptService_1 = require("./ytdlpTranscriptService");
const audioTranscriptService_1 = require("./audioTranscriptService");
const videoRepository_1 = require("../repositories/videoRepository");
const qdrantService_1 = require("./qdrantService");
const transcriptRetrievalService_1 = require("./transcriptRetrievalService");
const redis_1 = require("../config/redis");
class TranscriptOrchestrationService {
    constructor() {
        this.processingQueue = new Map();
        // 🚀 NEW: Track readiness status per video
        this.readinessStatus = new Map();
    }
    static getInstance() {
        if (!TranscriptOrchestrationService.instance) {
            TranscriptOrchestrationService.instance = new TranscriptOrchestrationService();
        }
        return TranscriptOrchestrationService.instance;
    }
    // 🚀 NEW: Get readiness status for frontend polling
    getReadinessStatus(videoId) {
        return this.readinessStatus.get(videoId) || { ready: false, message: 'Not started' };
    }
    async preloadTranscript(videoId) {
        if (this.processingQueue.has(videoId)) {
            logger_1.logger.info(`Transcript already processing for ${videoId}`);
            return;
        }
        const promise = this.fetchAndCacheTranscript(videoId);
        this.processingQueue.set(videoId, promise);
        try {
            await promise;
        }
        finally {
            this.processingQueue.delete(videoId);
        }
    }
    async getHighQualityTranscript(videoId) {
        if (this.processingQueue.has(videoId)) {
            logger_1.logger.info(`Waiting for in-progress transcript: ${videoId}`);
            return this.processingQueue.get(videoId);
        }
        const cached = await this.getCachedTranscript(videoId);
        if (cached)
            return cached;
        const promise = this.fetchAndCacheTranscript(videoId);
        this.processingQueue.set(videoId, promise);
        try {
            return await promise;
        }
        finally {
            this.processingQueue.delete(videoId);
        }
    }
    async getCachedTranscript(videoId) {
        try {
            // Check Redis first (fastest)
            const redisClient = (0, redis_1.getRedisClient)();
            if (redisClient) {
                const cached = await redisClient.get(`transcript:quality:${videoId}`);
                if (cached) {
                    logger_1.logger.info(`✅ Redis cache hit for transcript: ${videoId}`);
                    this.readinessStatus.set(videoId, { ready: true, message: 'Ready (cached)' });
                    return JSON.parse(cached);
                }
            }
            // 🚀 OPTIMIZATION: Check Qdrant FIRST (if chunks exist, we can answer questions)
            try {
                const chunkCount = await qdrantService_1.qdrantService.getChunkCount(videoId);
                if (chunkCount > 0) {
                    logger_1.logger.info(`✅ Qdrant has ${chunkCount} chunks for ${videoId} - chatbot ready!`);
                    this.readinessStatus.set(videoId, { ready: true, message: 'Ready (Qdrant indexed)' });
                    // Try to get transcript from DB for full context, but don't block
                    const transcript = await videoRepository_1.videoRepository.getTranscriptByVideoId(videoId);
                    if (transcript.length > 0) {
                        const quality = {
                            segments: transcript,
                            source: 'db',
                            confidence: 'high',
                            processingTime: 0,
                            wordCount: transcript.reduce((count, seg) => count + seg.text.split(' ').length, 0),
                            isReady: true
                        };
                        return quality;
                    }
                    // Qdrant has chunks but DB doesn't have transcript - still ready for RAG!
                    return {
                        segments: [],
                        source: 'qdrant-only',
                        confidence: 'medium',
                        processingTime: 0,
                        wordCount: 0,
                        isReady: true // Can still answer via RAG
                    };
                }
            }
            catch (qdrantError) {
                logger_1.logger.warn(`Qdrant check failed:`, qdrantError);
            }
            // Check PostgreSQL
            try {
                const transcript = await videoRepository_1.videoRepository.getTranscriptByVideoId(videoId);
                if (transcript.length > 0) {
                    logger_1.logger.info(`✅ PostgreSQL cache hit for transcript: ${videoId}`);
                    const quality = {
                        segments: transcript,
                        source: 'db',
                        confidence: 'high',
                        processingTime: 0,
                        wordCount: transcript.reduce((count, seg) => count + seg.text.split(' ').length, 0),
                        isReady: true
                    };
                    // Index in Qdrant in background (for next time)
                    this.indexInQdrantBackground(videoId, transcript);
                    if (redisClient) {
                        await redisClient.setEx(`transcript:quality:${videoId}`, 86400, JSON.stringify(quality));
                    }
                    this.readinessStatus.set(videoId, { ready: true, message: 'Ready (from database)' });
                    return quality;
                }
            }
            catch (dbError) {
                logger_1.logger.warn(`PostgreSQL query failed, will fetch from YouTube:`, dbError);
            }
        }
        catch (error) {
            logger_1.logger.warn(`Cache check failed for ${videoId}, will fetch fresh:`, error);
        }
        return null;
    }
    // 🚀 NEW: Background Qdrant indexing (non-blocking)
    async indexInQdrantBackground(videoId, segments) {
        try {
            const chunks = (0, transcriptRetrievalService_1.chunkTranscript)(segments);
            await qdrantService_1.qdrantService.upsertChunks(videoId, chunks);
            logger_1.logger.info(`✅ Background Qdrant indexing complete for ${videoId}`);
        }
        catch (error) {
            logger_1.logger.warn(`Background Qdrant indexing failed (non-critical):`, error);
        }
    }
    async fetchAndCacheTranscript(videoId) {
        const startTime = Date.now();
        logger_1.logger.info(`Starting transcript fetch for: ${videoId}`);
        this.readinessStatus.set(videoId, { ready: false, message: 'Fetching transcript...' });
        let segments = [];
        let source = 'yt-dlp';
        let confidence = 'high';
        // 1) Primary: yt-dlp (most robust, supports all languages when configured)
        try {
            this.readinessStatus.set(videoId, { ready: false, message: 'Extracting captions (yt-dlp)...' });
            logger_1.logger.info(`Fetching transcript with yt-dlp for ${videoId}`);
            segments = await (0, ytdlpTranscriptService_1.fetchTranscriptWithYtDlp)(videoId);
            if (segments.length > 0) {
                source = 'yt-dlp';
                confidence = 'high';
                logger_1.logger.info(`✅ yt-dlp success: ${segments.length} segments`);
            }
            else {
                logger_1.logger.warn(`⚠️ yt-dlp returned 0 segments for ${videoId}`);
            }
        }
        catch (error) {
            logger_1.logger.error(`❌ yt-dlp failed for ${videoId}:`, error);
        }
        // 2) Fast watch-page fallback
        if (segments.length === 0) {
            try {
                this.readinessStatus.set(videoId, { ready: false, message: 'Trying watch-page fallback...' });
                const rawLangs = process.env.WATCHPAGE_FALLBACK_LANGS || 'en,en-US,en-GB,ur,ur-IN,hi,hi-IN';
                const preferredLangs = rawLangs.split(',').map(l => l.trim()).filter(Boolean);
                logger_1.logger.info(`Attempting watch-page caption fallback for ${videoId}`);
                const wpSegments = await (0, transcriptFallbackService_1.fetchTranscriptViaWatchPage)(videoId, preferredLangs);
                if (wpSegments.length > 0) {
                    segments = wpSegments;
                    source = 'watch-page';
                    confidence = 'medium';
                    logger_1.logger.info(`✅ Watch-page fallback success: ${wpSegments.length} segments`);
                }
            }
            catch (wpError) {
                logger_1.logger.warn(`Watch-page fallback failed for ${videoId}:`, wpError);
            }
        }
        // 3) Optional: ASR fallback
        const asrFallbackEnabled = String(process.env.ENABLE_ASR_FALLBACK || 'false').toLowerCase() === 'true';
        if (segments.length === 0 && asrFallbackEnabled) {
            try {
                this.readinessStatus.set(videoId, { ready: false, message: 'Transcribing audio (ASR)...' });
                const asrSegs = await (0, audioTranscriptService_1.transcribeFullAudioWithWhisper)(videoId);
                if (asrSegs.length > 0) {
                    segments = asrSegs;
                    source = 'whisper';
                    confidence = 'medium';
                    logger_1.logger.info(`✅ ASR transcription success: ${asrSegs.length} segments`);
                }
            }
            catch (asrError) {
                logger_1.logger.error(`❌ ASR transcription failed for ${videoId}:`, asrError);
            }
        }
        const processingTime = Date.now() - startTime;
        const wordCount = segments.reduce((count, seg) => count + seg.text.split(' ').length, 0);
        const quality = {
            segments,
            source,
            confidence,
            processingTime,
            wordCount,
            isReady: segments.length > 0
        };
        if (segments.length > 0) {
            // 🚀 OPTIMIZATION: Use PROGRESSIVE indexing for sub-60-second AI readiness
            // Index first 30 chunks immediately, then continue in background
            this.readinessStatus.set(videoId, { ready: false, message: 'Indexing for AI search...' });
            try {
                const chunks = (0, transcriptRetrievalService_1.chunkTranscript)(segments);
                // Use progressive indexing - marks ready after first 30 chunks
                await qdrantService_1.qdrantService.upsertChunksProgressive(videoId, chunks, () => {
                    // Callback when initial chunks are indexed - AI is ready!
                    this.readinessStatus.set(videoId, { ready: true, message: 'Ready for questions!' });
                    quality.isReady = true;
                    logger_1.logger.info(`⚡ AI ready for ${videoId} after initial chunks indexed!`);
                });
                // Ensure status is set even if callback wasn't called
                if (!this.readinessStatus.get(videoId)?.ready) {
                    this.readinessStatus.set(videoId, { ready: true, message: 'Ready for questions!' });
                    quality.isReady = true;
                }
                logger_1.logger.info(`✅ Transcript chunks indexed in Qdrant for ${videoId}`);
            }
            catch (qdrantError) {
                logger_1.logger.warn(`Failed to index chunks in Qdrant:`, qdrantError);
            }
            // Save to PostgreSQL and Redis in BACKGROUND (non-blocking)
            // This doesn't affect chatbot readiness
            this.saveToStorageBackground(videoId, segments, quality);
            logger_1.logger.info(`✅ Transcript ready for ${videoId}: ${wordCount} words, ${processingTime}ms`);
        }
        else {
            logger_1.logger.error(`❌ All transcript methods failed for ${videoId}`);
            this.readinessStatus.set(videoId, { ready: false, message: 'No transcript available' });
        }
        return quality;
    }
    // 🚀 NEW: Save to PostgreSQL and Redis in background (non-blocking)
    saveToStorageBackground(videoId, segments, quality) {
        // Fire and forget - don't await
        (async () => {
            try {
                await videoRepository_1.videoRepository.saveTranscript(videoId, segments);
                logger_1.logger.info(`💾 Transcript saved to PostgreSQL for ${videoId}`);
            }
            catch (dbError) {
                logger_1.logger.warn(`⚠️ PostgreSQL save failed: ${dbError.message}`);
            }
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                if (redisClient) {
                    await redisClient.setEx(`transcript:quality:${videoId}`, 86400, JSON.stringify(quality));
                    logger_1.logger.info(`✅ Transcript cached in Redis for ${videoId}`);
                }
            }
            catch (redisError) {
                logger_1.logger.warn(`Redis cache failed:`, redisError);
            }
        })();
    }
    async warmupTranscripts(videoIds) {
        logger_1.logger.info(`Warming up transcripts for ${videoIds.length} videos`);
        const promises = videoIds.map(id => this.preloadTranscript(id).catch(err => logger_1.logger.error(`Warmup failed for ${id}:`, err)));
        await Promise.all(promises);
    }
}
exports.TranscriptOrchestrationService = TranscriptOrchestrationService;
exports.transcriptOrchestrationService = TranscriptOrchestrationService.getInstance();
//# sourceMappingURL=transcriptOrchestrationService.js.map