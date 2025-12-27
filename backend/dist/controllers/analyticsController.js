"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.analyticsController = exports.AnalyticsController = void 0;
const Video_1 = require("../models/Video");
const logger_1 = require("../utils/logger");
const express_validator_1 = require("express-validator");
const redis_1 = require("../config/redis");
class AnalyticsController {
    /**
     * Get analytics overview
     */
    async getOverview(req, res) {
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
            const { startDate, endDate } = req.query;
            const cacheKey = `analytics:overview:${startDate || 'all'}:${endDate || 'all'}`;
            // Check cache
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                const cachedData = await redisClient?.get(cacheKey);
                if (cachedData) {
                    res.json({
                        success: true,
                        data: JSON.parse(cachedData),
                        cached: true
                    });
                    return;
                }
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache error:', cacheError);
            }
            // Build date filter
            const dateFilter = {};
            if (startDate)
                dateFilter.$gte = new Date(startDate);
            if (endDate)
                dateFilter.$lte = new Date(endDate);
            const matchStage = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
            // Get overview statistics
            const [totalVideos, totalSubjects, qualityStats, difficultyStats, languageStats, recentVideos] = await Promise.all([
                Video_1.Video.countDocuments({ isEducational: true, ...matchStage }),
                Video_1.Video.distinct('subject', { isEducational: true, ...matchStage }).then(subjects => subjects.length),
                Video_1.Video.aggregate([
                    { $match: { isEducational: true, ...matchStage } },
                    {
                        $group: {
                            _id: null,
                            avgQuality: { $avg: '$qualityScore' },
                            minQuality: { $min: '$qualityScore' },
                            maxQuality: { $max: '$qualityScore' },
                            highQualityCount: {
                                $sum: { $cond: [{ $gte: ['$qualityScore', 7] }, 1, 0] }
                            }
                        }
                    }
                ]),
                Video_1.Video.aggregate([
                    { $match: { isEducational: true, ...matchStage } },
                    {
                        $group: {
                            _id: '$difficulty',
                            count: { $sum: 1 }
                        }
                    }
                ]),
                Video_1.Video.aggregate([
                    { $match: { isEducational: true, ...matchStage } },
                    {
                        $group: {
                            _id: '$language',
                            count: { $sum: 1 }
                        }
                    }
                ]),
                Video_1.Video.find({ isEducational: true, ...matchStage })
                    .sort({ createdAt: -1 })
                    .limit(10)
                    .select('videoId metadata.title metadata.channel createdAt qualityScore')
            ]);
            const overview = {
                totalVideos,
                totalSubjects,
                qualityStats: qualityStats[0] || {
                    avgQuality: 0,
                    minQuality: 0,
                    maxQuality: 0,
                    highQualityCount: 0
                },
                difficultyDistribution: difficultyStats.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                languageDistribution: languageStats.reduce((acc, item) => {
                    acc[item._id] = item.count;
                    return acc;
                }, {}),
                recentVideos,
                generatedAt: new Date()
            };
            // Cache for 30 minutes
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                await redisClient?.setEx(cacheKey, 1800, JSON.stringify(overview));
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache set error:', cacheError);
            }
            res.json({
                success: true,
                data: overview
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getOverview:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get popular videos analytics
     */
    async getPopularVideos(req, res) {
        try {
            const { startDate, endDate, limit = 20 } = req.query;
            const dateFilter = {};
            if (startDate)
                dateFilter.$gte = new Date(startDate);
            if (endDate)
                dateFilter.$lte = new Date(endDate);
            const matchStage = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
            const popularVideos = await Video_1.Video.find({
                isEducational: true,
                qualityScore: { $gte: 6 },
                ...matchStage
            })
                .sort({ qualityScore: -1, 'metadata.views': -1 })
                .limit(Number(limit))
                .select('videoId metadata subject difficulty qualityScore createdAt');
            res.json({
                success: true,
                data: {
                    videos: popularVideos,
                    total: popularVideos.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getPopularVideos:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get search trends
     */
    async getSearchTrends(req, res) {
        try {
            const { startDate, endDate } = req.query;
            const cacheKey = `analytics:search-trends:${startDate || 'all'}:${endDate || 'all'}`;
            // Check cache
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                const cachedData = await redisClient?.get(cacheKey);
                if (cachedData) {
                    res.json({
                        success: true,
                        data: JSON.parse(cachedData),
                        cached: true
                    });
                    return;
                }
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache error:', cacheError);
            }
            const dateFilter = {};
            if (startDate)
                dateFilter.$gte = new Date(startDate);
            if (endDate)
                dateFilter.$lte = new Date(endDate);
            const matchStage = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
            // Get trending keywords
            const trendingKeywords = await Video_1.Video.aggregate([
                { $match: { isEducational: true, ...matchStage } },
                { $unwind: '$searchKeywords' },
                {
                    $group: {
                        _id: '$searchKeywords',
                        count: { $sum: 1 },
                        avgQuality: { $avg: '$qualityScore' },
                        subjects: { $addToSet: '$subject' }
                    }
                },
                { $match: { count: { $gte: 2 } } },
                { $sort: { count: -1, avgQuality: -1 } },
                { $limit: 30 }
            ]);
            // Get trending subjects
            const trendingSubjects = await Video_1.Video.aggregate([
                { $match: { isEducational: true, ...matchStage } },
                {
                    $group: {
                        _id: '$subject',
                        count: { $sum: 1 },
                        avgQuality: { $avg: '$qualityScore' },
                        difficulties: { $addToSet: '$difficulty' }
                    }
                },
                { $sort: { count: -1 } }
            ]);
            const trends = {
                keywords: trendingKeywords.map(item => ({
                    keyword: item._id,
                    frequency: item.count,
                    averageQuality: Math.round(item.avgQuality * 10) / 10,
                    subjects: item.subjects
                })),
                subjects: trendingSubjects.map(item => ({
                    subject: item._id,
                    videoCount: item.count,
                    averageQuality: Math.round(item.avgQuality * 10) / 10,
                    difficulties: item.difficulties
                })),
                generatedAt: new Date()
            };
            // Cache for 1 hour
            try {
                const redisClient = (0, redis_1.getRedisClient)();
                await redisClient?.setEx(cacheKey, 3600, JSON.stringify(trends));
            }
            catch (cacheError) {
                logger_1.logger.warn('Redis cache set error:', cacheError);
            }
            res.json({
                success: true,
                data: trends
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getSearchTrends:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get subject analytics
     */
    async getSubjectAnalytics(req, res) {
        try {
            const { startDate, endDate } = req.query;
            const dateFilter = {};
            if (startDate)
                dateFilter.$gte = new Date(startDate);
            if (endDate)
                dateFilter.$lte = new Date(endDate);
            const matchStage = Object.keys(dateFilter).length > 0 ? { createdAt: dateFilter } : {};
            const subjectAnalytics = await Video_1.Video.aggregate([
                { $match: { isEducational: true, ...matchStage } },
                {
                    $group: {
                        _id: '$subject',
                        totalVideos: { $sum: 1 },
                        avgQuality: { $avg: '$qualityScore' },
                        highQualityCount: {
                            $sum: { $cond: [{ $gte: ['$qualityScore', 7] }, 1, 0] }
                        },
                        difficultyBreakdown: {
                            $push: '$difficulty'
                        },
                        languageBreakdown: {
                            $push: '$language'
                        },
                        recentVideo: { $last: '$metadata.title' },
                        lastUpdated: { $max: '$createdAt' }
                    }
                },
                {
                    $project: {
                        subject: '$_id',
                        totalVideos: 1,
                        avgQuality: { $round: ['$avgQuality', 1] },
                        highQualityCount: 1,
                        qualityPercentage: {
                            $round: [
                                { $multiply: [{ $divide: ['$highQualityCount', '$totalVideos'] }, 100] },
                                1
                            ]
                        },
                        difficultyStats: {
                            beginner: {
                                $size: {
                                    $filter: {
                                        input: '$difficultyBreakdown',
                                        cond: { $eq: ['$$this', 'beginner'] }
                                    }
                                }
                            },
                            intermediate: {
                                $size: {
                                    $filter: {
                                        input: '$difficultyBreakdown',
                                        cond: { $eq: ['$$this', 'intermediate'] }
                                    }
                                }
                            },
                            advanced: {
                                $size: {
                                    $filter: {
                                        input: '$difficultyBreakdown',
                                        cond: { $eq: ['$$this', 'advanced'] }
                                    }
                                }
                            }
                        },
                        recentVideo: 1,
                        lastUpdated: 1,
                        _id: 0
                    }
                },
                { $sort: { totalVideos: -1 } }
            ]);
            res.json({
                success: true,
                data: {
                    subjects: subjectAnalytics,
                    totalSubjects: subjectAnalytics.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getSubjectAnalytics:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get individual video analytics
     */
    async getVideoAnalytics(req, res) {
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
            const { videoId } = req.params;
            const video = await Video_1.Video.findOne({ videoId });
            if (!video) {
                res.status(404).json({
                    success: false,
                    message: 'Video not found'
                });
                return;
            }
            // Calculate analytics
            const transcriptStats = {
                totalSegments: video.transcript.length,
                totalWords: video.transcript.reduce((count, segment) => count + segment.text.split(' ').length, 0),
                avgSegmentLength: video.transcript.length > 0
                    ? video.transcript.reduce((sum, segment) => sum + segment.duration, 0) / video.transcript.length
                    : 0,
                totalDuration: video.transcript.length > 0
                    ? video.transcript[video.transcript.length - 1].start + video.transcript[video.transcript.length - 1].duration
                    : 0
            };
            const keywordAnalysis = {
                totalKeywords: video.searchKeywords.length,
                topKeywords: video.searchKeywords.slice(0, 10)
            };
            // Find similar videos
            const similarVideos = await Video_1.Video.find({
                videoId: { $ne: videoId },
                subject: video.subject,
                difficulty: video.difficulty,
                isEducational: true
            })
                .sort({ qualityScore: -1 })
                .limit(5)
                .select('videoId metadata.title qualityScore');
            const analytics = {
                video: {
                    videoId: video.videoId,
                    title: video.metadata.title,
                    channel: video.metadata.channel,
                    subject: video.subject,
                    difficulty: video.difficulty,
                    qualityScore: video.qualityScore,
                    createdAt: video.createdAt
                },
                transcriptStats,
                keywordAnalysis,
                similarVideos,
                performance: {
                    isHighQuality: video.qualityScore >= 7,
                    hasTranscript: video.transcript.length > 0,
                    isEducational: video.isEducational
                }
            };
            res.json({
                success: true,
                data: analytics
            });
        }
        catch (error) {
            logger_1.logger.error('Error in getVideoAnalytics:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
}
exports.AnalyticsController = AnalyticsController;
exports.analyticsController = new AnalyticsController();
//# sourceMappingURL=analyticsController.js.map