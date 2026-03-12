"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoController = exports.VideoController = void 0;
const videoRepository_1 = require("../repositories/videoRepository");
const youtubeScraperService_1 = require("../services/youtubeScraperService");
const transcriptOrchestrationService_1 = require("../services/transcriptOrchestrationService");
const qdrantService_1 = require("../services/qdrantService");
const transcriptRetrievalService_1 = require("../services/transcriptRetrievalService");
const logger_1 = require("../utils/logger");
const express_validator_1 = require("express-validator");
// ============================================
// STRICT EDUCATIONAL FILTER
// ============================================
// Educational keywords that MUST be present in title (at least one)
const EDUCATIONAL_KEYWORDS = [
    'tutorial', 'explained', 'lecture', 'course', 'lesson', 'learn',
    'introduction', 'guide', 'how to', 'what is', 'understanding',
    'beginner', 'advanced', 'complete', 'full course', 'crash course',
    'algorithm', 'programming', 'coding', 'development', 'engineering',
    'data structure', 'computer science', 'in hindi', 'in urdu', 'in english',
    'step by step', 'example', 'practice', 'solution', 'interview',
    'gate', 'exam', 'mcq', 'question', 'basics', 'fundamentals',
    'network', 'security', 'database', 'web', 'machine learning',
    'part 1', 'part 2', 'part-1', 'part-2', 'chapter', 'module',
    'encryption', 'decryption', 'cryptography', 'protocol',
];
// Non-educational patterns - strictly block these
const BLOCKED_PATTERNS = [
    /\b(official\s*(music\s*)?video|lyric\s*video|audio\s*song)\b/i,
    /\b(full\s*movie|official\s*trailer|teaser|promo)\b/i,
    /\bvevo\b/i,
    /\b(feat\.|ft\.|starring)\b/i,
    /\b(remix|cover|live\s*performance|concert|unplugged)\b/i,
    /\b(episode\s*\d+|s\d+\s*e\d+|ep\s*\d+)\b/i, // TV shows
    /\b(movie|film|drama|series|season)\b/i,
    /\b(song|album|music|singer|artist|band)\b/i,
    /\b(trailer|teaser|behind\s*the\s*scenes)\b/i,
];
/**
 * STRICT filter - only allows educational content
 */
function filterEducationalResults(results) {
    return results.filter(result => {
        const title = result.title.toLowerCase();
        const channel = result.channel.toLowerCase();
        // Check for blocked patterns
        for (const pattern of BLOCKED_PATTERNS) {
            if (pattern.test(title) || pattern.test(channel)) {
                return false;
            }
        }
        // MUST have at least one educational keyword
        const hasEducationalKeyword = EDUCATIONAL_KEYWORDS.some(kw => title.includes(kw));
        return hasEducationalKeyword;
    });
}
// ============================================
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
            // Apply fast educational filter (removes music, movies, etc.)
            const filteredVideos = filterEducationalResults(scrapedVideos);
            logger_1.logger.info(`Filtered ${scrapedVideos.length} -> ${filteredVideos.length} educational videos`);
            const newVideos = [];
            // Process scraped videos
            const videosToProcess = filteredVideos.slice(0, Number(limit) - dbResults.length);
            const savedVideos = [];
            // Step 1: Save all videos to database first (fast operation)
            for (const scrapedVideo of videosToProcess) {
                try {
                    // Check if video already exists
                    const existingVideo = await videoRepository_1.videoRepository.findByVideoId(scrapedVideo.videoId);
                    if (existingVideo) {
                        savedVideos.push(existingVideo);
                        continue;
                    }
                    // Get detailed metadata (skip transcript fetch here - we'll preload it)
                    const metadata = await youtubeScraperService_1.youtubeScraperService.getVideoMetadata(scrapedVideo.videoId);
                    // Determine subject and quality based on content
                    const subject = this.determineSubject(metadata.title, metadata.description);
                    const qualityScore = this.calculateQualityScore(metadata, []);
                    const videoDoc = {
                        videoId: scrapedVideo.videoId,
                        metadata: {
                            ...metadata,
                            scrapedAt: new Date()
                        },
                        transcript: [], // Will be filled by background preload
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
                    savedVideos.push(saved);
                    newVideos.push(saved);
                }
                catch (error) {
                    logger_1.logger.error(`Error processing video ${scrapedVideo.videoId}:`, error);
                }
            }
            // Step 2: ⚡ AGGRESSIVE PARALLEL PRELOAD - Start transcript extraction for ALL videos immediately
            logger_1.logger.info(`🚀 Starting parallel transcript preload for ${savedVideos.length} videos`);
            const preloadPromises = savedVideos.map(video => transcriptOrchestrationService_1.transcriptOrchestrationService.preloadTranscript(video.videoId)
                .catch(err => logger_1.logger.warn(`Preload failed for ${video.videoId}:`, err)));
            // Don't wait for preloads - let them run in background
            Promise.all(preloadPromises).then(() => {
                logger_1.logger.info(`✅ Completed parallel preload for ${savedVideos.length} videos`);
            });
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
                    // ⚡ OPTIMIZATION 2: Auto-preload transcript in background for instant readiness
                    if (transcript.length === 0) {
                        // No transcript yet - trigger background preload for fast future access
                        Promise.resolve().then(() => __importStar(require('../services/transcriptOrchestrationService'))).then(({ transcriptOrchestrationService }) => {
                            transcriptOrchestrationService.preloadTranscript(metadata.videoId).catch(err => logger_1.logger.warn(`Background preload failed for ${metadata.videoId}:`, err));
                        });
                    }
                    else {
                        // Has transcript - index chunks in Qdrant
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