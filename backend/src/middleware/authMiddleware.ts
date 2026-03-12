import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { logger } from '../utils/logger';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here';

// Extend Express Request to include user info
export interface AuthRequest extends Request {
  userId?: number;
  userEmail?: string;
  userRole?: 'student' | 'teacher' | 'admin';
}

/**
 * Authentication middleware - Verifies JWT token and extracts user info
 * Adds userId, userEmail, and userRole to the request object
 */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  try {
    // Extract token from Authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'No token provided. Please login to continue.'
      });
      return;
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix

    try {
      // Verify token
      const decoded = jwt.verify(token, JWT_SECRET) as {
        userId: number;
        email: string;
        role: 'student' | 'teacher' | 'admin';
        iat?: number;
        exp?: number;
      };

      // Attach user info to request
      req.userId = decoded.userId;
      req.userEmail = decoded.email;
      req.userRole = decoded.role;

      logger.debug(`Authenticated user ${decoded.userId} (${decoded.role})`);
      
      next();
    } catch (jwtError: any) {
      if (jwtError.name === 'TokenExpiredError') {
        res.status(401).json({
          success: false,
          message: 'Token has expired. Please login again.'
        });
      } else if (jwtError.name === 'JsonWebTokenError') {
        res.status(401).json({
          success: false,
          message: 'Invalid token. Please login again.'
        });
      } else {
        logger.error('JWT verification error:', jwtError);
        res.status(401).json({
          success: false,
          message: 'Authentication failed.'
        });
      }
      return;
    }
  } catch (error) {
    logger.error('Authentication middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Internal server error during authentication.'
    });
    return;
  }
}

/**
 * Optional authentication middleware - Verifies JWT token if present, but doesn't require it
 * Useful for endpoints that behave differently for authenticated vs anonymous users
 */
export function optionalAuthenticate(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    // No token provided, continue without authentication
    next();
    return;
  }

  // Token provided, try to authenticate
  authenticate(req, res, next);
}
