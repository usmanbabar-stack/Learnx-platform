import { Request, Response } from 'express';
export declare class AnalyticsController {
    /**
     * Get analytics overview
     */
    getOverview(req: Request, res: Response): Promise<void>;
    /**
     * Get popular videos analytics
     */
    getPopularVideos(req: Request, res: Response): Promise<void>;
    /**
     * Get search trends
     */
    getSearchTrends(req: Request, res: Response): Promise<void>;
    /**
     * Get subject analytics
     */
    getSubjectAnalytics(req: Request, res: Response): Promise<void>;
    /**
     * Get individual video analytics
     */
    getVideoAnalytics(req: Request, res: Response): Promise<void>;
}
export declare const analyticsController: AnalyticsController;
//# sourceMappingURL=analyticsController.d.ts.map