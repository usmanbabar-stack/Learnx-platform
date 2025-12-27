import { Request, Response } from 'express';
interface AuthRequest extends Request {
    userId?: number;
}
export declare class DashboardController {
    /**
     * Get user dashboard statistics
     */
    getStats(req: AuthRequest, res: Response): Promise<void>;
    /**
     * Extract user ID from JWT token (temporary until auth middleware is fully set up)
     */
    private extractUserIdFromToken;
}
export declare const dashboardController: DashboardController;
export {};
//# sourceMappingURL=dashboardController.d.ts.map