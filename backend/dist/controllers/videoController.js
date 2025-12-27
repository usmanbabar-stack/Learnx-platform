"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoController = exports.VideoController = void 0;
const videoRepository_1 = require("../repositories/videoRepository");
const youtubeScraperService_1 = require("../services/youtubeScraperService");
const transcriptOrchestrationService_1 = require("../services/transcriptOrchestrationService");
const qdrantService_1 = require("../services/qdrantService");
const transcriptRetrievalService_1 = require("../services/transcriptRetrievalService");
const logger_1 = require("../utils/logger");
const express_validator_1 = require("express-validator");
class VideoController {
    /**
     * Search for videos based on query
     */
    async searchVideos(req, res) {
        try {
            const errors = (0, express_validator_1.validationResult)(req);
            if (!errors.isEmpty()) {
                res.status(400).json({
                    success: false,
                    message: 'Validation errors',
                    errors: errors.array()
                });
                return;
            }
            const { query, limit = 20, subject, difficulty, language, sortBy } = req.query;
            if (!query || typeof query !== 'string') {
                res.status(400).json({
                    success: false,
                    message: 'Search query is required'
                });
                return;
            }
            const filters = {
                subject: subject,
                difficulty: difficulty,
                language: language,
                sortBy: sortBy
            };
            // First, search in our database
            const dbResults = await videoRepository_1.videoRepository.searchVideos(query, filters, Number(limit));
            // If we have enough results from DB, return them
            if (dbResults.length >= Number(limit)) {
                res.json({
                    success: true,
                    data: {
                        videos: dbResults,
                        source: 'database',
                        total: dbResults.length
                    }
                });
                return;
            }
            // Otherwise, scrape new videos and store them
            const scrapedVideos = await youtubeScraperService_1.youtubeScraperService.searchEducationalVideos(query);
            const newVideos = [];
            // Process scraped videos
            for (const scrapedVideo of scrapedVideos.slice(0, Number(limit) - dbResults.length)) {
                try {
                    // Check if video already exists
                    const existingVideo = await videoRepository_1.videoRepository.findByVideoId(scrapedVideo.videoId);
                    if (existingVideo)
                        continue;
                    // Get detailed metadata and transcript
                    const [metadata, transcript] = await Promise.all([
                        youtubeScraperService_1.youtubeScraperService.getVideoMetadata(scrapedVideo.videoId),
                        youtubeScraperService_1.youtubeScraperService.getVideoTranscript(scrapedVideo.videoId).catch(() => [])
                    ]);
                    // Determine subject and quality based on content
                    const subject = this.determineSubject(metadata.title, metadata.description);
                    const qualityScore = this.calculateQualityScore(metadata, transcript);
                    const videoDoc = {
                        videoId: scrapedVideo.videoId,
                        metadata: {
                            ...metadata,
                            scrapedAt: new Date()
                        },
                        transcript,
                        searchKeywords: [],
                        subject,
                        difficulty: this.determineDifficulty(metadata.title, metadata.description),
                        language: 'en',
                        isEducational: qualityScore >= 5,
                        qualityScore,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    const saved = await videoRepository_1.videoRepository.create(videoDoc);
                    // Index chunks in Qdrant for fast RAG retrieval
                    if (transcript.length > 0) {
                        const chunks = (0, transcriptRetrievalService_1.chunkTranscript)(transcript);
                        qdrantService_1.qdrantService.upsertChunks(scrapedVideo.videoId, chunks).catch(err => logger_1.logger.warn(`Failed to index chunks in Qdrant for ${scrapedVideo.videoId}:`, err));
                    }
                    newVideos.push(saved);
                }
                catch (error) {
                    logger_1.logger.error(`Error processing video ${scrapedVideo.videoId}:`, error);
                }
            }
            // Combine database and new results
            const allResults = [...dbResults, ...newVideos];
            res.json({
                success: true,
                data: {
                    videos: allResults,
                    source: 'mixed',
                    total: allResults.length,
                    newVideosProcessed: newVideos.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in searchVideos:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error',
                error: process.env.NODE_ENV === 'development' ? error : undefined
            });
        }
    }
    /**
     * Get video by ID
     */
    async getVideoById(req, res) {
        try {
            const { videoId } = req.params;
            if (!videoId) {
                res.status(400).json({
                    success: false,
                    message: 'Video ID is required'
                });
                return;
            }
            let video = await videoRepository_1.videoRepository.findByVideoId(videoId);
            // If not in database, scrape it
            if (!video) {
                try {
                    const metadata = await youtubeScraperService_1.youtubeScraperService.getVideoMetadata(videoId);
                    const transcript = [];
                    const subject = this.determineSubject(metadata.title, metadata.description);
                    const qualityScore = this.calculateQualityScore(metadata, transcript);
                    const videoDoc = {
                        videoId,
                        metadata: {
                            ...metadata,
                            scrapedAt: new Date()
                        },
                        transcript,
                        searchKeywords: [],
                        subject,
                        difficulty: this.determineDifficulty(metadata.title, metadata.description),
                        language: 'en',
                        isEducational: qualityScore >= 5,
                        qualityScore,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    video = await videoRepository_1.videoRepository.create(videoDoc);
                    logger_1.logger.info(`New video saved: ${videoId}`);
                }
                catch (error) {
                    logger_1.logger.error(`Error scraping video ${videoId}:`, error);
                    res.status(404).json({
                        success: false,
                        message: 'Video not found or could not be processed'
                    });
                    return;
                }
            }
            // Kick off transcript preload in the background so that the chatbot
            // is ready by the time the user asks their first question.
            try {
                transcriptOrchestrationService_1.transcriptOrchestrationService
                    .preloadTranscript(videoId)
                    .catch(err => logger_1.logger.error(`Background transcript preload from getVideoById failed for ${videoId}:`, err));
            }
            catch (preloadErr) {
                logger_1.logger.warn(`Could not start background transcript preload for ${videoId} (non-critical):`, preloadErr);
            }
            res.json({
                success: true,
                data: { video }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getVideoById:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get videos by subject
     */
    async getVideosBySubject(req, res) {
        try {
            const { subject } = req.params;
            const { limit = 20 } = req.query;
            const videos = await videoRepository_1.videoRepository.findBySubject(subject, Number(limit));
            res.json({
                success: true,
                data: {
                    videos,
                    subject,
                    total: videos.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getVideosBySubject:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get video transcript
     */
    async getVideoTranscript(req, res) {
        try {
            const { videoId } = req.params;
            const transcript = await videoRepository_1.videoRepository.getTranscriptByVideoId(videoId);
            if (transcript.length === 0) {
                res.status(404).json({
                    success: false,
                    message: 'Transcript not found'
                });
                return;
            }
            res.json({
                success: true,
                data: {
                    transcript,
                    videoId
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getVideoTranscript:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Batch process videos
     */
    async batchProcessVideos(req, res) {
        try {
            const { videoIds } = req.body;
            if (!Array.isArray(videoIds) || videoIds.length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'Video IDs array is required'
                });
                return;
            }
            if (videoIds.length > 10) {
                res.status(400).json({
                    success: false,
                    message: 'Maximum 10 videos can be processed at once'
                });
                return;
            }
            const results = await youtubeScraperService_1.youtubeScraperService.batchProcessVideos(videoIds);
            const savedVideos = [];
            // Save processed videos to database
            for (const metadata of results.metadata) {
                try {
                    const existingVideo = await videoRepository_1.videoRepository.findByVideoId(metadata.videoId);
                    if (existingVideo)
                        continue;
                    const transcript = results.transcripts[metadata.videoId] || [];
                    const subject = this.determineSubject(metadata.title, metadata.description);
                    const qualityScore = this.calculateQualityScore(metadata, transcript);
                    const videoDoc = {
                        videoId: metadata.videoId,
                        metadata: {
                            ...metadata,
                            scrapedAt: new Date()
                        },
                        transcript,
                        searchKeywords: [],
                        subject,
                        difficulty: this.determineDifficulty(metadata.title, metadata.description),
                        language: 'en',
                        isEducational: qualityScore >= 5,
                        qualityScore,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    const saved = await videoRepository_1.videoRepository.create(videoDoc);
                    // Index chunks in Qdrant
                    if (transcript.length > 0) {
                        const chunks = (0, transcriptRetrievalService_1.chunkTranscript)(transcript);
                        qdrantService_1.qdrantService.upsertChunks(metadata.videoId, chunks).catch(err => logger_1.logger.warn(`Failed to index chunks for ${metadata.videoId}:`, err));
                    }
                    savedVideos.push(saved);
                }
                catch (error) {
                    logger_1.logger.error(`Error saving video ${metadata.videoId}:`, error);
                }
            }
            res.json({
                success: true,
                data: {
                    processed: results.metadata.length,
                    saved: savedVideos.length,
                    errors: results.errors,
                    videos: savedVideos
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in batchProcessVideos:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Preload multiple videos' transcripts in the background
     */
    async preloadVideosBatch(req, res) {
        try {
            const { videoIds } = req.body;
            if (!Array.isArray(videoIds) || videoIds.length === 0) {
                res.status(400).json({
                    success: false,
                    message: 'videoIds array is required'
                });
                return;
            }
            const limitedIds = videoIds.slice(0, 20);
            logger_1.logger.info(`Preloading transcripts for ${limitedIds.length} videos (batch): ${limitedIds.join(', ')}`);
            transcriptOrchestrationService_1.transcriptOrchestrationService
                .warmupTranscripts(limitedIds)
                .catch(err => logger_1.logger.error('Batch preload failed:', err));
            res.status(202).json({
                success: true,
                message: 'Batch preload initiated',
                data: {
                    requested: videoIds.length,
                    processing: limitedIds.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in preloadVideosBatch:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Preload video data for instant chatbot readiness
     */
    async preloadVideo(req, res) {
        try {
            const { videoId } = req.params;
            logger_1.logger.info(`Preloading video data for instant chatbot: ${videoId}`);
            transcriptOrchestrationService_1.transcriptOrchestrationService.preloadTranscript(videoId).catch(err => logger_1.logger.error(`Background transcript preload failed for ${videoId}:`, err));
            res.status(202).json({
                success: true,
                message: 'Video preload initiated',
                data: {
                    videoId,
                    status: 'processing'
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in preloadVideo:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * 🚀 OPTIMIZATION: Check if transcript is ready for instant response
     * Frontend can poll this to show loading status
     */
    async getTranscriptStatus(req, res) {
        try {
            const { videoId } = req.params;
            // 🚀 NEW: Get real-time readiness status from orchestration service
            const orchestrationStatus = transcriptOrchestrationService_1.transcriptOrchestrationService.getReadinessStatus(videoId);
            // Check Qdrant for indexed chunks (primary indicator of readiness)
            let qdrantReady = false;
            let chunkCount = 0;
            try {
                chunkCount = await qdrantService_1.qdrantService.getChunkCount(videoId);
                qdrantReady = chunkCount > 0;
            }
            catch { }
            // Check PostgreSQL for transcript
            let dbReady = false;
            let wordCount = 0;
            try {
                const transcript = await videoRepository_1.videoRepository.getTranscriptByVideoId(videoId);
                dbReady = transcript.length > 0;
                wordCount = transcript.reduce((count, seg) => count + seg.text.split(' ').length, 0);
            }
            catch { }
            // 🚀 CRITICAL: Ready if Qdrant is indexed (don't wait for DB)
            const ready = qdrantReady || orchestrationStatus.ready;
            res.json({
                success: true,
                data: {
                    ready,
                    qdrantReady,
                    dbReady,
                    chunkCount,
                    wordCount,
                    status: orchestrationStatus.message,
                    message: ready
                        ? 'Transcript ready - chatbot is optimized for instant responses'
                        : orchestrationStatus.message || 'Transcript still processing...'
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getTranscriptStatus:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get trending educational videos
     */
    async getTrendingVideos(req, res) {
        try {
            const { limit = 20, subject } = req.query;
            const filters = {
                minQualityScore: 7,
                subject: subject
            };
            const videos = await videoRepository_1.videoRepository.searchVideos('', filters, Number(limit));
            res.json({
                success: true,
                data: {
                    videos,
                    total: videos.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getTrendingVideos:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Determine subject based on title and description
     */
    determineSubject(title, description) {
        const content = `${title} ${description}`.toLowerCase();
        const subjects = {
            'Computer Science': ['programming', 'coding', 'software', 'algorithm', 'data structure', 'javascript', 'python', 'java', 'react', 'nodejs', 'web development', 'machine learning', 'ai', 'artificial intelligence'],
            'Mathematics': ['math', 'calculus', 'algebra', 'geometry', 'statistics', 'probability', 'equation', 'formula'],
            'Physics': ['physics', 'quantum', 'mechanics', 'thermodynamics', 'electricity', 'magnetism', 'relativity'],
            'Chemistry': ['chemistry', 'chemical', 'molecule', 'atom', 'reaction', 'organic', 'inorganic'],
            'Biology': ['biology', 'cell', 'dna', 'genetics', 'evolution', 'anatomy', 'physiology'],
            'Engineering': ['engineering', 'mechanical', 'electrical', 'civil', 'design', 'construction'],
            'Business': ['business', 'marketing', 'finance', 'management', 'entrepreneur', 'startup'],
            'Economics': ['economics', 'economy', 'market', 'trade', 'investment', 'gdp'],
            'Psychology': ['psychology', 'behavior', 'cognitive', 'mental health', 'therapy'],
            'History': ['history', 'historical', 'ancient', 'medieval', 'war', 'civilization'],
            'Language Learning': ['language', 'english', 'spanish', 'french', 'grammar', 'vocabulary'],
        };
        for (const [subject, keywords] of Object.entries(subjects)) {
            if (keywords.some(keyword => content.includes(keyword))) {
                return subject;
            }
        }
        return 'Other';
    }
    /**
     * Determine difficulty level
     */
    determineDifficulty(title, description) {
        const content = `${title} ${description}`.toLowerCase();
        if (content.includes('beginner') || content.includes('intro') || content.includes('basic') || content.includes('fundamentals')) {
            return 'beginner';
        }
        if (content.includes('advanced') || content.includes('expert') || content.includes('master') || content.includes('professional')) {
            return 'advanced';
        }
        return 'intermediate';
    }
    /**
     * Calculate quality score based on various factors
     */
    calculateQualityScore(metadata, transcript) {
        let score = 5; // Base score
        // Title quality (clear, descriptive)
        if (metadata.title.length > 20 && metadata.title.length < 100)
            score += 1;
        if (metadata.title.includes('tutorial') || metadata.title.includes('course') || metadata.title.includes('lesson'))
            score += 1;
        // Description quality
        if (metadata.description.length > 100)
            score += 1;
        // Transcript availability
        if (transcript.length > 0)
            score += 2;
        // Duration (prefer 5-60 minutes for educational content)
        const duration = this.parseDuration(metadata.duration);
        if (duration >= 300 && duration <= 3600)
            score += 1; // 5-60 minutes
        // Views (popular content is often higher quality)
        const views = parseInt(metadata.views.replace(/[^\d]/g, '')) || 0;
        if (views > 10000)
            score += 1;
        if (views > 100000)
            score += 1;
        return Math.min(10, Math.max(0, score));
    }
    /**
     * Parse duration string to seconds
     */
    parseDuration(duration) {
        const parts = duration.split(':').map(Number);
        if (parts.length === 2) {
            return parts[0] * 60 + parts[1]; // MM:SS
        }
        else if (parts.length === 3) {
            return parts[0] * 3600 + parts[1] * 60 + parts[2]; // HH:MM:SS
        }
        return 0;
    }
}
exports.VideoController = VideoController;
exports.videoController = new VideoController();
//# sourceMappingURL=videoController.js.map