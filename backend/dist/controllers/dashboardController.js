"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dashboardController = exports.DashboardController = void 0;
const userProgressRepository_1 = require("../repositories/userProgressRepository");
const logger_1 = require("../utils/logger");
class DashboardController {
    /**
     * Get user dashboard statistics
     */
    async getStats(req, res) {
        try {
            // Get userId from query param (frontend will pass it)
            // TODO: Replace with JWT token extraction when auth middleware is ready
            const userId = parseInt(req.query.userId);
            if (!userId || isNaN(userId)) {
                res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
                return;
            }
            // Get dashboard stats
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
                message: 'Failed to fetch dashboard statistics'
            });
        }
    }
    /**
     * Extract user ID from JWT token (temporary until auth middleware is fully set up)
     */
    extractUserIdFromToken(req) {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return null;
            }
            // For now, try to get from localStorage via frontend
            // In production, decode JWT properly
            return null; // Will be handled by frontend passing userId
        }
        catch {
            return null;
        }
    }
}
exports.DashboardController = DashboardController;
exports.dashboardController = new DashboardController();
//# sourceMappingURL=dashboardController.js.map