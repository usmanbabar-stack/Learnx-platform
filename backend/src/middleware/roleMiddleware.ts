import { Response, NextFunction } from 'express';
import { AuthRequest } from './authMiddleware';
import { logger } from '../utils/logger';

/**
 * Role-based authorization middleware
 * Requires the user to have one of the specified roles
 * Must be used AFTER authenticate middleware
 */
export function requireRole(...allowedRoles: Array<'student' | 'teacher' | 'admin'>) {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    // Check if user was authenticated
    if (!req.userId || !req.userRole) {
      res.status(401).json({
        success: false,
        message: 'Authentication required. Please login to continue.'
      });
      return;
    }

    // Check if user has required role
    if (!allowedRoles.includes(req.userRole)) {
      logger.warn(
        `Access denied: User ${req.userId} (${req.userRole}) attempted to access ${req.method} ${req.path} ` +
        `(requires: ${allowedRoles.join(' or ')})`
      );
      
      res.status(403).json({
        success: false,
        message: `Access denied. This endpoint requires ${allowedRoles.join(' or ')} role.`,
        requiredRole: allowedRoles,
        yourRole: req.userRole
      });
      return;
    }

    logger.debug(`Role authorization passed: User ${req.userId} (${req.userRole}) accessing ${req.path}`);
    next();
  };
}

/**
 * Convenience middleware for teacher-only routes
 */
export const requireTeacher = requireRole('teacher', 'admin');

/**
 * Convenience middleware for admin-only routes
 */
export const requireAdmin = requireRole('admin');

/**
 * Convenience middleware for authenticated students only
 */
export const requireStudent = requireRole('student', 'teacher', 'admin');
