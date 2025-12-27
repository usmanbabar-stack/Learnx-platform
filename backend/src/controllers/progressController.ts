import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { userProgressRepository } from '../repositories/userProgressRepository';
import { logger } from '../utils/logger';

export class ProgressController {
  /**
   * Get user's dashboard statistics
   */
  async getDashboardStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.query.userId as string);
      
      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required'
        });
        return;
      }

      const stats = await userProgressRepository.getDashboardStats(userId);
      
      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get progress for a specific video (for resume functionality)
   */
  async getVideoProgress(req: Request, res: Response): Promise<void> {
    try {
      const { videoId } = req.params;
      const userId = parseInt(req.query.userId as string);

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required'
        });
        return;
      }

      const progress = await userProgressRepository.getProgress(userId, videoId);
      
      res.json({
        success: true,
        data: {
          progress,
          resumeTime: progress?.progressTime || 0,
          completed: progress?.completed || false
        }
      });
    } catch (error) {
      logger.error('Error getting video progress:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Update video progress (called periodically during playback)
   */
  async updateProgress(req: Request, res: Response): Promise<void> {
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
      const progress = await userProgressRepository.updateProgress(
        parseInt(userId),
        videoId,
        parseFloat(progressTime) || 0,
        parseFloat(totalDuration) || 0,
        false,
        videoTitle,
        videoThumbnail,
        videoChannel
      );

      // Record watch history event if action provided (non-blocking)
      if (action) {
        userProgressRepository.recordWatchHistory(parseInt(userId), videoId, parseFloat(progressTime) || 0, action)
          .catch(e => logger.warn('Watch history record failed (non-critical):', e));
      }

      res.json({
        success: true,
        data: {
          progress,
          message: 'Progress updated successfully'
        }
      });
    } catch (error) {
      logger.error('Error updating progress:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update progress'
      });
    }
  }

  /**
   * Get in-progress videos for resume functionality
   */
  async getInProgressVideos(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.query.userId as string);
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required'
        });
        return;
      }

      const videos = await userProgressRepository.getInProgressVideos(userId, limit);
      
      res.json({
        success: true,
        data: {
          videos,
          count: videos.length
        }
      });
    } catch (error) {
      logger.error('Error getting in-progress videos:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get recently watched videos
   */
  async getRecentlyWatched(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.query.userId as string);
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required'
        });
        return;
      }

      const videos = await userProgressRepository.getRecentlyWatched(userId, limit);
      
      res.json({
        success: true,
        data: {
          videos,
          count: videos.length
        }
      });
    } catch (error) {
      logger.error('Error getting recently watched:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get completed videos
   */
  async getCompletedVideos(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.query.userId as string);
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required'
        });
        return;
      }

      const videos = await userProgressRepository.getCompletedVideos(userId, limit);
      
      res.json({
        success: true,
        data: {
          videos,
          count: videos.length
        }
      });
    } catch (error) {
      logger.error('Error getting completed videos:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Mark a video as completed
   */
  async markCompleted(req: Request, res: Response): Promise<void> {
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

      await userProgressRepository.markCompleted(userId, videoId);
      
      res.json({
        success: true,
        message: 'Video marked as completed'
      });
    } catch (error) {
      logger.error('Error marking video as completed:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get weekly learning stats (hours per day for past 7 days)
   */
  async getWeeklyStats(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.query.userId as string);

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required'
        });
        return;
      }

      const weeklyData = await userProgressRepository.getWeeklyStats(userId);
      
      res.json({
        success: true,
        data: weeklyData
      });
    } catch (error) {
      logger.error('Error getting weekly stats:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get learning patterns (time-of-day distribution)
   */
  async getLearningPatterns(req: Request, res: Response): Promise<void> {
    try {
      const userId = parseInt(req.query.userId as string);

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'Valid userId is required'
        });
        return;
      }

      const patterns = await userProgressRepository.getLearningPatterns(userId);
      
      res.json({
        success: true,
        data: patterns
      });
    } catch (error) {
      logger.error('Error getting learning patterns:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }
}

export const progressController = new ProgressController();
