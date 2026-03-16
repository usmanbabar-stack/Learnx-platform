import { logger } from '../utils/logger';
import { youtubeScraperService } from './youtubeScraperService';
import { fetchTranscriptViaWatchPage } from './transcriptFallbackService';
import { fetchTranscriptViaInnertube } from './youtubeInnertubeService';
import { fetchTranscriptWithYtDlp } from './ytdlpTranscriptService';
import { transcribeFullAudioWithWhisper } from './audioTranscriptService';
import { fetchTranscriptViaSupadata } from './supadataTranscriptService';
import { videoRepository } from '../repositories/videoRepository';
import { qdrantService } from './qdrantService';
import { chunkTranscript } from './transcriptRetrievalService';
import { getRedisClient } from '../config/redis';

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptQuality {
  segments: TranscriptSegment[];
  source: 'db' | 'supadata' | 'watch-page' | 'yt-dlp' | 'whisper' | 'qdrant-only';
  confidence: 'high' | 'medium' | 'low';
  processingTime: number;
  wordCount: number;
  isReady: boolean; // 🚀 NEW: Indicates if chatbot is ready to answer
}

export class TranscriptOrchestrationService {
  private static instance: TranscriptOrchestrationService;
  private processingQueue: Map<string, Promise<TranscriptQuality>> = new Map();
  // 🚀 NEW: Track readiness status per video
  private readinessStatus: Map<string, { ready: boolean; message: string }> = new Map();

  private constructor() {}

  static getInstance(): TranscriptOrchestrationService {
    if (!TranscriptOrchestrationService.instance) {
      TranscriptOrchestrationService.instance = new TranscriptOrchestrationService();
    }
    return TranscriptOrchestrationService.instance;
  }

  // 🚀 NEW: Get readiness status for frontend polling
  getReadinessStatus(videoId: string): { ready: boolean; message: string } {
    return this.readinessStatus.get(videoId) || { ready: false, message: 'Not started' };
  }

  async preloadTranscript(videoId: string): Promise<void> {
    if (this.processingQueue.has(videoId)) {
      return; // Silent return - no logging spam
    }

    // ⚡ OPTIMIZATION 1: Fast Redis boolean check before DB query
    const redisClient = getRedisClient();
    if (redisClient) {
      const hasTranscript = await redisClient.get(`transcript:exists:${videoId}`);
      if (hasTranscript === 'true') {
        this.readinessStatus.set(videoId, { ready: true, message: 'Ready (cached)' });
        return;
      }
    }

    // ⚡ OPTIMIZATION 2: Fast database check before expensive operations
    const dbTranscript = await videoRepository.getTranscriptByVideoId(videoId);
    if (dbTranscript && dbTranscript.length > 0) {
      this.readinessStatus.set(videoId, { ready: true, message: 'Ready (database)' });
      
      // Cache the existence flag in Redis for faster future checks
      if (redisClient) {
        await redisClient.setEx(`transcript:exists:${videoId}`, 3600, 'true'); // 1 hour cache
      }
      
      return;
    }

    // 🐛 FIX: Check cache BEFORE fetching - avoid redundant yt-dlp calls!
    const cached = await this.getCachedTranscript(videoId);
    if (cached) {
      return;
    }

    // Start transcript extraction in background
    logger.info(`🚀 Starting background transcript extraction: ${videoId}`);
    const promise = this.fetchAndCacheTranscript(videoId);
    this.processingQueue.set(videoId, promise);

    try {
      await promise;
      logger.info(`✅ Transcript ready: ${videoId}`);
    } catch (error) {
      logger.error(`❌ Transcript extraction failed for ${videoId}:`, error);
    } finally {
      this.processingQueue.delete(videoId);
    }
  }

  async getHighQualityTranscript(videoId: string): Promise<TranscriptQuality> {
    if (this.processingQueue.has(videoId)) {
      logger.info(`Waiting for in-progress transcript: ${videoId}`);
      return this.processingQueue.get(videoId)!;
    }

    const cached = await this.getCachedTranscript(videoId);
    if (cached) return cached;

    const promise = this.fetchAndCacheTranscript(videoId);
    this.processingQueue.set(videoId, promise);

    try {
      return await promise;
    } finally {
      this.processingQueue.delete(videoId);
    }
  }

  private async getCachedTranscript(videoId: string): Promise<TranscriptQuality | null> {
    try {
      // Check Redis first (fastest)
      const redisClient = getRedisClient();
      if (redisClient) {
        const cached = await redisClient.get(`transcript:quality:${videoId}`);
        if (cached) {
          logger.info(`✅ Redis cache hit for transcript: ${videoId}`);
          this.readinessStatus.set(videoId, { ready: true, message: 'Ready (cached)' });
          return JSON.parse(cached);
        }
      }

      // 🚀 OPTIMIZATION: Check Qdrant FIRST (if chunks exist, we can answer questions)
      try {
        const chunkCount = await qdrantService.getChunkCount(videoId);
        if (chunkCount > 0) {
          logger.info(`✅ Qdrant has ${chunkCount} chunks for ${videoId} - chatbot ready!`);
          this.readinessStatus.set(videoId, { ready: true, message: 'Ready (Qdrant indexed)' });
          
          // Try to get transcript from DB for full context, but don't block
          const transcript = await videoRepository.getTranscriptByVideoId(videoId);
          if (transcript.length > 0) {
            const quality: TranscriptQuality = {
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
      } catch (qdrantError) {
        logger.warn(`Qdrant check failed:`, qdrantError);
      }

      // Check PostgreSQL
      try {
        const transcript = await videoRepository.getTranscriptByVideoId(videoId);
        if (transcript.length > 0) {
          logger.info(`✅ PostgreSQL cache hit for transcript: ${videoId}`);
          const quality: TranscriptQuality = {
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
      } catch (dbError) {
        logger.warn(`PostgreSQL query failed, will fetch from YouTube:`, dbError);
      }
    } catch (error) {
      logger.warn(`Cache check failed for ${videoId}, will fetch fresh:`, error);
    }

    return null;
  }

  // 🚀 NEW: Background Qdrant indexing (non-blocking)
  private async indexInQdrantBackground(videoId: string, segments: TranscriptSegment[]): Promise<void> {
    try {
      const chunks = chunkTranscript(segments);
      await qdrantService.upsertChunks(videoId, chunks);
      logger.info(`✅ Background Qdrant indexing complete for ${videoId}`);
    } catch (error) {
      logger.warn(`Background Qdrant indexing failed (non-critical):`, error);
    }
  }

  private async fetchAndCacheTranscript(videoId: string): Promise<TranscriptQuality> {
    const startTime = Date.now();
    logger.info(`⏱️ Starting transcript fetch for: ${videoId} at ${new Date().toISOString()}`);
    this.readinessStatus.set(videoId, { ready: false, message: 'Fetching transcript...' });

    let segments: TranscriptSegment[] = [];
    let source: TranscriptQuality['source'] = 'yt-dlp';
    let confidence: TranscriptQuality['confidence'] = 'high';

    // 0) ⚡ SUPADATA API — fastest & most reliable from cloud (1-3 seconds)
    try {
      this.readinessStatus.set(videoId, { ready: false, message: 'Fetching captions (Supadata)...' });
      const sdStart = Date.now();
      const sdSegments = await fetchTranscriptViaSupadata(videoId);
      const sdTime = Date.now() - sdStart;
      if (sdSegments.length > 0) {
        segments = sdSegments as any;
        source = 'supadata';
        confidence = 'high';
        logger.info(`⚡ Supadata: ${sdSegments.length} segments (${sdTime}ms) for ${videoId}`);
      } else {
        logger.warn(`⚠️ Supadata returned 0 segments for ${videoId} (${sdTime}ms)`);
      }
    } catch (error: any) {
      logger.error(`❌ Supadata failed for ${videoId}: ${error?.message || error}`);
    }

    // 1) FALLBACK A: Innertube (youtubei.js)
    if (segments.length === 0) {
      try {
        this.readinessStatus.set(videoId, { ready: false, message: 'Fetching captions (Innertube)...' });
        const fastStart = Date.now();
        const innertubeSegments = await fetchTranscriptViaInnertube(videoId);
        const fastTime = Date.now() - fastStart;
        
        if (innertubeSegments.length > 0) {
          segments = innertubeSegments as any;
          source = 'watch-page';
          confidence = 'high';
          logger.info(`⚡ Innertube: ${innertubeSegments.length} segments (${fastTime}ms) for ${videoId}`);
        } else {
          logger.warn(`⚠️ Innertube returned 0 segments for ${videoId} (${fastTime}ms)`);
        }
      } catch (error: any) {
        logger.error(`❌ Innertube failed for ${videoId}: ${error?.message || error}`);
      }
    }

    // 2) FALLBACK A: Watch-page scrape (lightweight HTTP, no binary deps)
    if (segments.length === 0) {
      try {
        this.readinessStatus.set(videoId, { ready: false, message: 'Fetching captions (watch-page)...' });
        const wpStart = Date.now();
        const wpSegments = await fetchTranscriptViaWatchPage(videoId);
        const wpTime = Date.now() - wpStart;
        if (wpSegments.length > 0) {
          segments = wpSegments as any;
          source = 'watch-page';
          confidence = 'high';
          logger.info(`✅ Watch-page: ${wpSegments.length} segments (${wpTime}ms) for ${videoId}`);
        } else {
          logger.warn(`⚠️ Watch-page returned 0 segments for ${videoId} (${wpTime}ms)`);
        }
      } catch (error: any) {
        logger.error(`❌ Watch-page failed for ${videoId}: ${error?.message || error}`);
      }
    }

    // 3) FALLBACK B: yt-dlp (60-90 seconds but most reliable for auto-subs)
    if (segments.length === 0) {
      try {
        this.readinessStatus.set(videoId, { ready: false, message: 'Extracting captions (yt-dlp)...' });
        const ytdlpStart = Date.now();
        segments = await fetchTranscriptWithYtDlp(videoId) as any;
        const ytdlpTime = Date.now() - ytdlpStart;
        if (segments.length > 0) {
          source = 'yt-dlp';
          confidence = 'high';
          logger.info(`✅ yt-dlp: ${segments.length} segments (${(ytdlpTime/1000).toFixed(1)}s) for ${videoId}`);
        } else {
          logger.warn(`⚠️ yt-dlp returned 0 segments for ${videoId} (${(ytdlpTime/1000).toFixed(1)}s)`);
        }
      } catch (error: any) {
        logger.error(`❌ yt-dlp failed for ${videoId}: ${error?.message || error}`);
      }
    }

    // 4) FALLBACK C: ASR (Vosk/Whisper) - Only if explicitly enabled
    const asrFallbackEnabled = String(process.env.ENABLE_ASR_FALLBACK || 'false').toLowerCase() === 'true';
    if (segments.length === 0 && asrFallbackEnabled) {
      try {
        this.readinessStatus.set(videoId, { ready: false, message: 'Audio transcription (ASR)...' });
        const asrStart = Date.now();
        const asrSegs = await transcribeFullAudioWithWhisper(videoId) as any;
        const asrTime = Date.now() - asrStart;
        if (asrSegs.length > 0) {
          segments = asrSegs;
          source = 'whisper';
          confidence = 'medium';
          logger.info(`✅ ASR: ${asrSegs.length} segments (${(asrTime/1000).toFixed(1)}s) for ${videoId}`);
        } else {
          logger.warn(`⚠️ ASR returned 0 segments for ${videoId} (${(asrTime/1000).toFixed(1)}s)`);
        }
      } catch (asrError: any) {
        logger.error(`❌ ASR failed for ${videoId}: ${asrError?.message || asrError}`);
      }
    }

    const processingTime = Date.now() - startTime;
    const wordCount = segments.reduce((count, seg) => count + seg.text.split(' ').length, 0);

    const quality: TranscriptQuality = {
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
        const chunks = chunkTranscript(segments);
        const indexingStart = Date.now();
        
        // Use progressive indexing - marks ready after first 30 chunks
        await qdrantService.upsertChunksProgressive(videoId, chunks, () => {
          // Callback when initial chunks are indexed - AI is ready!
          const aiReadyTime = Date.now() - startTime;
          this.readinessStatus.set(videoId, { ready: true, message: 'Ready for questions!' });
          quality.isReady = true;
          logger.info(`⚡ AI READY in ${aiReadyTime}ms for ${videoId} (target: <60000ms)`);
        });
        
        const indexingTime = Date.now() - indexingStart;
        
        // Ensure status is set even if callback wasn't called
        if (!this.readinessStatus.get(videoId)?.ready) {
          const aiReadyTime = Date.now() - startTime;
          this.readinessStatus.set(videoId, { ready: true, message: 'Ready for questions!' });
          quality.isReady = true;
          logger.info(`⚡ AI READY in ${aiReadyTime}ms for ${videoId} (target: <60000ms)`);
        }
        
        logger.info(`✅ Qdrant indexing completed in ${indexingTime}ms for ${videoId}`);
        
      } catch (qdrantError) {
        logger.warn(`Failed to index chunks in Qdrant:`, qdrantError);
      }

      // Save to PostgreSQL and Redis in BACKGROUND (non-blocking)
      // This doesn't affect chatbot readiness
      this.saveToStorageBackground(videoId, segments, quality);
      
      const totalTime = Date.now() - startTime;
      logger.info(`✅ Transcript ready for ${videoId}: ${wordCount} words, ${totalTime}ms total`);
    } else {
      logger.error(`❌ All transcript methods failed for ${videoId}`);
      // ⚡ IMPORTANT: Still mark as "ready" because chatbot can answer using general knowledge
      // This prevents the UI from waiting forever for a transcript that won't arrive
      this.readinessStatus.set(videoId, { 
        ready: true, 
        message: 'Ready (no captions available - using AI knowledge)' 
      });
      quality.isReady = true; // Can still answer questions!
    }

    return quality;
  }

  // 🚀 NEW: Save to PostgreSQL and Redis in background (non-blocking)
  private saveToStorageBackground(videoId: string, segments: TranscriptSegment[], quality: TranscriptQuality): void {
    // Fire and forget - don't await
    (async () => {
      try {
        await videoRepository.saveTranscript(videoId, segments);
        logger.info(`💾 Transcript saved to PostgreSQL for ${videoId}`);
      } catch (dbError: any) {
        logger.warn(`⚠️ PostgreSQL save failed: ${dbError.message}`);
      }

      try {
        const redisClient = getRedisClient();
        if (redisClient) {
          await redisClient.setEx(`transcript:quality:${videoId}`, 86400, JSON.stringify(quality));
          logger.info(`✅ Transcript cached in Redis for ${videoId}`);
        }
      } catch (redisError) {
        logger.warn(`Redis cache failed:`, redisError);
      }
    })();
  }

  async warmupTranscripts(videoIds: string[]): Promise<void> {
    logger.info(`Warming up transcripts for ${videoIds.length} videos`);
    const promises = videoIds.map(id => this.preloadTranscript(id).catch(err => 
      logger.error(`Warmup failed for ${id}:`, err)
    ));
    await Promise.all(promises);
  }
}

export const transcriptOrchestrationService = TranscriptOrchestrationService.getInstance();

