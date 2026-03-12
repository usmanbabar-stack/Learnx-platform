import { Request, Response } from 'express';
export declare class ProgressController {
    /**
     * Get user's dashboard statistics
     */
    getDashboardStats(req: Request, res: Response): Promise<void>;
    /**
     * Get progress for a specific video (for resume functionality)
     */
    getVideoProgress(req: Request, res: Response): Promise<void>;
    /**
     * Update video progress (called periodically during playback)
     */
    updateProgress(req: Request, res: Response): Promise<void>;
    /**
     * Get in-progress videos for resume functionality
     */
    getInProgressVideos(req: Request, res: Response): Promise<void>;
    /**
     * Get recently watched videos
     */
    getRecentlyWatched(req: Request, res: Response): Promise<void>;
    /**
     * Get completed videos
     */
    getCompletedVideos(req: Request, res: Response): Promise<void>;
    /**
     * Mark a video as completed
     */
    markCompleted(req: Request, res: Response): Promise<void>;
    /**
     * Get weekly learning stats (hours per day for past 7 days)
     */
    getWeeklyStats(req: Request, res: Response): Promise<void>;
    /**
     * Get learning patterns (time-of-day distribution)
     */
    getLearningPatterns(req: Request, res: Response): Promise<void>;
}
export declare const progressController: ProgressController;
//# sourceMappingURL=progressController.d.ts.map