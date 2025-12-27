import { Request, Response, NextFunction } from 'express';
export interface CustomError extends Error {
    statusCode?: number;
    isOperational?: boolean;
    code?: string | number;
}
/**
 * Not found middleware
 */
export declare const notFound: (req: Request, res: Response, next: NextFunction) => void;
/**
 * 🛡️ Global error handler middleware - handles all error types robustly
 */
export declare const errorHandler: (err: CustomError, req: Request, res: Response, next: NextFunction) => void;
/**
 * 🛡️ Async error wrapper - catches all async errors
 */
export declare const asyncHandler: (fn: Function) => (req: Request, res: Response, next: NextFunction) => void;
/**
 * 🛡️ Uncaught exception handler - prevents server crash
 */
export declare const setupGlobalErrorHandlers: () => void;
//# sourceMappingURL=errorMiddleware.d.ts.map