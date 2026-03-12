import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { mockInterviewService } from '../services/mockInterviewService';
import { mockInterviewRepository } from '../repositories/mockInterviewRepository';
import { logger } from '../utils/logger';

export class MockInterviewController {
  /**
   * Generate a new mock interview based on user's field
   * POST /api/mock-interview/generate
   */
  async generateInterview(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array(),
        });
        return;
      }

      const { field, difficulty = 'medium', questionCount = 5, userId } = req.body;

      if (!userId) {
        res.status(400).json({
          success: false,
          message: 'User ID is required',
        });
        return;
      }

      logger.info(`Generating mock interview for field: ${field}, difficulty: ${difficulty}`);

      // Generate interview using AI
      const interview = await mockInterviewService.generateInterview(field, difficulty, questionCount);

      // Save session to database
      await mockInterviewRepository.createSession({
        sessionId: interview.sessionId,
        userId: parseInt(userId),
        field: interview.field,
        difficulty: interview.difficulty,
        questions: interview.questions,
        totalQuestions: interview.totalQuestions,
      });

      res.json({
        success: true,
        message: 'Mock interview generated successfully',
        data: interview,
      });
    } catch (error) {
      logger.error('Error generating mock interview:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate mock interview',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Evaluate user's answer to an interview question
   * POST /api/mock-interview/evaluate
   */
  async evaluateAnswer(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array(),
        });
        return;
      }

      const { sessionId, questionId, question, userAnswer, expectedKeyPoints, field } = req.body;

      logger.info(`Evaluating answer for question ${questionId} in session ${sessionId}`);

      // Evaluate answer using AI
      const feedback = await mockInterviewService.evaluateAnswer(
        question,
        userAnswer,
        expectedKeyPoints,
        field
      );

      // Save response to database
      await mockInterviewRepository.saveResponse({
        sessionId,
        questionId,
        questionText: question,
        userAnswer,
        feedback,
        score: feedback.score,
      });

      res.json({
        success: true,
        message: 'Answer evaluated successfully',
        data: feedback,
      });
    } catch (error) {
      logger.error('Error evaluating answer:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to evaluate answer',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get user's mock interview history
   * GET /api/mock-interview/sessions/:userId
   */
  async getUserSessions(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const limit = parseInt(req.query.limit as string) || 10;

      if (!userId || isNaN(parseInt(userId))) {
        res.status(400).json({
          success: false,
          message: 'Valid user ID is required',
        });
        return;
      }

      const sessions = await mockInterviewRepository.getUserSessions(parseInt(userId), limit);

      res.json({
        success: true,
        data: sessions,
      });
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve sessions',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get details of a specific interview session
   * GET /api/mock-interview/session/:sessionId
   */
  async getSessionDetails(req: Request, res: Response): Promise<void> {
    try {
      const { sessionId } = req.params;

      if (!sessionId) {
        res.status(400).json({
          success: false,
          message: 'Session ID is required',
        });
        return;
      }

      const session = await mockInterviewRepository.getSessionById(sessionId);
      if (!session) {
        res.status(404).json({
          success: false,
          message: 'Session not found',
        });
        return;
      }

      const responses = await mockInterviewRepository.getSessionResponses(sessionId);

      res.json({
        success: true,
        data: {
          session,
          responses,
        },
      });
    } catch (error) {
      logger.error('Error getting session details:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve session details',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Mark an interview session as complete
   * POST /api/mock-interview/complete
   */
  async completeSession(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array(),
        });
        return;
      }

      const { sessionId } = req.body;

      // Get all responses for the session to calculate overall score
      const responses = await mockInterviewRepository.getSessionResponses(sessionId);
      
      if (responses.length === 0) {
        res.status(400).json({
          success: false,
          message: 'No answers found for this session',
        });
        return;
      }

      const overallScore = Math.round(
        responses.reduce((sum, r) => sum + r.score, 0) / responses.length
      );

      await mockInterviewRepository.completeSession(sessionId, overallScore);

      res.json({
        success: true,
        message: 'Session completed successfully',
        data: { overallScore },
      });
    } catch (error) {
      logger.error('Error completing session:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to complete session',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get user statistics for mock interviews
   * GET /api/mock-interview/stats/:userId
   */
  async getUserStats(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;

      if (!userId || isNaN(parseInt(userId))) {
        res.status(400).json({
          success: false,
          message: 'Valid user ID is required',
        });
        return;
      }

      const stats = await mockInterviewRepository.getUserStats(parseInt(userId));

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Error getting user stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve statistics',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Clear cached interviews for a specific field
   * POST /api/mock-interview/clear-cache
   */
  async clearCache(req: Request, res: Response): Promise<void> {
    try {
      const { field } = req.body;

      mockInterviewService.clearCache(field);

      res.json({
        success: true,
        message: field ? `Cache cleared for field: ${field}` : 'All cache cleared',
      });
    } catch (error) {
      logger.error('Error clearing cache:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to clear cache',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}

export const mockInterviewController = new MockInterviewController();
