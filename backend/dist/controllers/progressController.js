"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.progressController = exports.ProgressController = void 0;
const userProgressRepository_1 = require("../repositories/userProgressRepository");
const logger_1 = require("../utils/logger");
class ProgressController {
    /**
     * Get user's dashboard statistics
     */
    async getDashboardStats(req, res) {
        try {
            const userId = parseInt(req.query.userId);
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            const stats = await userProgressRepository_1.userProgressRepository.getDashboardStats(userId);
            res.json({
                success: true,
                data: stats
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting dashboard stats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get progress for a specific video (for resume functionality)
     */
    async getVideoProgress(req, res) {
        try {
            const { videoId } = req.params;
            const userId = parseInt(req.query.userId);
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            const progress = await userProgressRepository_1.userProgressRepository.getProgress(userId, videoId);
            res.json({
                success: true,
                data: {
                    progress,
                    resumeTime: progress?.progressTime || 0,
                    completed: progress?.completed || false
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting video progress:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Update video progress (called periodically during playback)
     */
    async updateProgress(req, res) {
        try {
            const { userId, videoId, progressTime, totalDuration, action, videoTitle, videoThumbnail, videoChannel } = req.body;
            // Validate required fields
            if (!userId || !videoId) {
                res.status(400).json({
                    success: false,
                    message: 'userId and videoId are required'
                });
                return;
            }
            // Update progress with optional video metadata
            const progress = await userProgressRepository_1.userProgressRepository.updateProgress(parseInt(userId), videoId, parseFloat(progressTime) || 0, parseFloat(totalDuration) || 0, false, videoTitle, videoThumbnail, videoChannel);
            // Record watch history event if action provided (non-blocking)
            if (action) {
                userProgressRepository_1.userProgressRepository.recordWatchHistory(parseInt(userId), videoId, parseFloat(progressTime) || 0, action)
                    .catch(e => logger_1.logger.warn('Watch history record failed (non-critical):', e));
            }
            res.json({
                success: true,
                data: {
                    progress,
                    message: 'Progress updated successfully'
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error updating progress:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to update progress'
            });
        }
    }
    /**
     * Get in-progress videos for resume functionality
     */
    async getInProgressVideos(req, res) {
        try {
            const userId = parseInt(req.query.userId);
            const limit = parseInt(req.query.limit) || 10;
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            const videos = await userProgressRepository_1.userProgressRepository.getInProgressVideos(userId, limit);
            res.json({
                success: true,
                data: {
                    videos,
                    count: videos.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting in-progress videos:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get recently watched videos
     */
    async getRecentlyWatched(req, res) {
        try {
            const userId = parseInt(req.query.userId);
            const limit = parseInt(req.query.limit) || 10;
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            const videos = await userProgressRepository_1.userProgressRepository.getRecentlyWatched(userId, limit);
            res.json({
                success: true,
                data: {
                    videos,
                    count: videos.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting recently watched:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get completed videos
     */
    async getCompletedVideos(req, res) {
        try {
            const userId = parseInt(req.query.userId);
            const limit = parseInt(req.query.limit) || 50;
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            const videos = await userProgressRepository_1.userProgressRepository.getCompletedVideos(userId, limit);
            res.json({
                success: true,
                data: {
                    videos,
                    count: videos.length
                }
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting completed videos:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Mark a video as completed
     */
    async markCompleted(req, res) {
        try {
            const { videoId } = req.params;
            const userId = parseInt(req.body.userId);
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            await userProgressRepository_1.userProgressRepository.markCompleted(userId, videoId);
            res.json({
                success: true,
                message: 'Video marked as completed'
            });
        }
        catch (error) {
            logger_1.logger.error('Error marking video as completed:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get weekly learning stats (hours per day for past 7 days)
     */
    async getWeeklyStats(req, res) {
        try {
            const userId = parseInt(req.query.userId);
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            const weeklyData = await userProgressRepository_1.userProgressRepository.getWeeklyStats(userId);
            res.json({
                success: true,
                data: weeklyData
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting weekly stats:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
    /**
     * Get learning patterns (time-of-day distribution)
     */
    async getLearningPatterns(req, res) {
        try {
            const userId = parseInt(req.query.userId);
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'Valid userId is required'
                });
                return;
            }
            const patterns = await userProgressRepository_1.userProgressRepository.getLearningPatterns(userId);
            res.json({
                success: true,
                data: patterns
            });
        }
        catch (error) {
            logger_1.logger.error('Error getting learning patterns:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    }
}
exports.ProgressController = ProgressController;
exports.progressController = new ProgressController();
//# sourceMappingURL=progressController.js.map