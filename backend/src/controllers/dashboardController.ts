import { Request, Response } from 'express';
import { userProgressRepository } from '../repositories/userProgressRepository';
import { userRepository } from '../repositories/userRepository';
import { logger } from '../utils/logger';

// Extend Request to include userId from auth middleware
interface AuthRequest extends Request {
  userId?: number;
}

export class DashboardController {
  /**
   * Get user dashboard statistics
   */
  async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      // Get userId from query param (frontend will pass it)
      // TODO: Replace with JWT token extraction when auth middleware is ready
      const userId = parseInt(req.query.userId as string);

      if (!userId || isNaN(userId)) {
        res.status(400).json({
          success: false,
          message: 'User ID is required'
        });
        return;
      }

      // Get dashboard stats
      const stats = await userProgressRepository.getDashboardStats(userId);

      res.json({
        success: true,
        data: stats
      });
    } catch (error) {
      logger.error('Error getting dashboard stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch dashboard statistics'
      });
    }
  }

  /**
   * Extract user ID from JWT token (temporary until auth middleware is fully set up)
   */
  private extractUserIdFromToken(req: Request): number | null {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return null;
      }

      // For now, try to get from localStorage via frontend
      // In production, decode JWT properly
      return null; // Will be handled by frontend passing userId
    } catch {
      return null;
    }
  }
}

export const dashboardController = new DashboardController();

