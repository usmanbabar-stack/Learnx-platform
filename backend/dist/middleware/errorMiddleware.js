"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setupGlobalErrorHandlers = exports.asyncHandler = exports.errorHandler = exports.notFound = void 0;
const logger_1 = require("../utils/logger");
/**
 * Not found middleware
 */
const notFound = (req, res, next) => {
    const error = new Error(`Not found - ${req.originalUrl}`);
    error.statusCode = 404;
    next(error);
};
exports.notFound = notFound;
/**
 * 🛡️ Global error handler middleware - handles all error types robustly
 */
const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Internal Server Error';
    let isOperational = err.isOperational ?? true;
    // Log error with context
    logger_1.logger.error('Error:', {
        message: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        statusCode
    });
    // 🛡️ Database connection errors
    if (err.code === 'ECONNREFUSED' || err.message?.includes('ECONNREFUSED')) {
        statusCode = 503;
        message = 'Database connection unavailable. Please try again later.';
        isOperational = true;
    }
    // 🛡️ PostgreSQL specific errors
    if (err.code === '23505') {
        // Unique violation
        statusCode = 409;
        message = 'A record with this value already exists.';
    }
    else if (err.code === '23503') {
        // Foreign key violation
        statusCode = 400;
        message = 'Referenced resource does not exist.';
    }
    else if (err.code === '42P01') {
        // Undefined table
        statusCode = 500;
        message = 'Database schema error. Please contact support.';
        logger_1.logger.error('CRITICAL: Missing database table', { error: err.message });
    }
    else if (err.code === '28P01') {
        // Invalid password
        statusCode = 503;
        message = 'Database authentication failed.';
        logger_1.logger.error('CRITICAL: Database auth failed');
    }
    // 🛡️ Qdrant/Vector DB errors
    if (err.message?.includes('Qdrant') || err.message?.includes('vector')) {
        statusCode = 503;
        message = 'Vector search temporarily unavailable. Basic search still works.';
        isOperational = true;
    }
    // 🛡️ Redis errors
    if (err.message?.includes('Redis') || err.message?.includes('REDIS')) {
        statusCode = 503;
        message = 'Cache service temporarily unavailable.';
        isOperational = true;
    }
    // 🛡️ Mongoose/MongoDB errors (if any legacy code)
    if (err.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid resource identifier.';
    }
    if (err.name === 'MongoError' && err.code === 11000) {
        statusCode = 409;
        message = 'Duplicate entry. This resource already exists.';
    }
    if (err.name === 'ValidationError') {
        statusCode = 400;
        const messages = Object.values(err.errors || {})
            .map((val) => val.message)
            .join(', ');
        message = messages || 'Validation failed.';
    }
    // 🛡️ JWT errors
    if (err.name === 'JsonWebTokenError') {
        statusCode = 401;
        message = 'Invalid authentication token. Please login again.';
    }
    if (err.name === 'TokenExpiredError') {
        statusCode = 401;
        message = 'Session expired. Please login again.';
    }
    // 🛡️ Network/Timeout errors
    if (err.code === 'ETIMEDOUT' || err.code === 'ESOCKETTIMEDOUT') {
        statusCode = 504;
        message = 'Request timed out. Please try again.';
    }
    if (err.code === 'ENOTFOUND') {
        statusCode = 503;
        message = 'External service unavailable.';
    }
    // 🛡️ Rate limiting (should not hit here, but just in case)
    if (err.message?.includes('Too many requests')) {
        statusCode = 429;
        message = 'Too many requests. Please wait a moment before trying again.';
    }
    // 🛡️ File/Memory errors
    if (err.message?.includes('ENOMEM') || err.message?.includes('out of memory')) {
        statusCode = 503;
        message = 'Server temporarily overloaded. Please try again.';
        logger_1.logger.error('CRITICAL: Out of memory error');
    }
    // 🛡️ JSON parsing errors
    if (err instanceof SyntaxError && err.message?.includes('JSON')) {
        statusCode = 400;
        message = 'Invalid request format. Please check your input.';
    }
    // Send response
    res.status(statusCode).json({
        success: false,
        message,
        ...(process.env.NODE_ENV === 'development' && {
            stack: err.stack,
            code: err.code
        })
    });
};
exports.errorHandler = errorHandler;
/**
 * 🛡️ Async error wrapper - catches all async errors
 */
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
        // Ensure error has proper structure
        if (!(error instanceof Error)) {
            const wrappedError = new Error(String(error));
            wrappedError.isOperational = true;
            next(wrappedError);
        }
        else {
            next(error);
        }
    });
};
exports.asyncHandler = asyncHandler;
/**
 * 🛡️ Uncaught exception handler - prevents server crash
 */
const setupGlobalErrorHandlers = () => {
    process.on('uncaughtException', (error) => {
        logger_1.logger.error('UNCAUGHT EXCEPTION:', {
            message: error.message,
            stack: error.stack
        });
        // Give time to log before exiting
        setTimeout(() => process.exit(1), 1000);
    });
    process.on('unhandledRejection', (reason, promise) => {
        logger_1.logger.error('UNHANDLED REJECTION:', {
            reason: reason?.message || reason,
            stack: reason?.stack
        });
        // Don't exit - just log
    });
};
exports.setupGlobalErrorHandlers = setupGlobalErrorHandlers;
//# sourceMappingURL=errorMiddleware.js.map