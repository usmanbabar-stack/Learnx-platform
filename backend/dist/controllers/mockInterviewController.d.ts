import { Request, Response } from 'express';
export declare class MockInterviewController {
    /**
     * Generate a new mock interview based on user's field
     * POST /api/mock-interview/generate
     */
    generateInterview(req: Request, res: Response): Promise<void>;
    /**
     * Evaluate user's answer to an interview question
     * POST /api/mock-interview/evaluate
     */
    evaluateAnswer(req: Request, res: Response): Promise<void>;
    /**
     * Get user's mock interview history
     * GET /api/mock-interview/sessions/:userId
     */
    getUserSessions(req: Request, res: Response): Promise<void>;
    /**
     * Get details of a specific interview session
     * GET /api/mock-interview/session/:sessionId
     */
    getSessionDetails(req: Request, res: Response): Promise<void>;
    /**
     * Mark an interview session as complete
     * POST /api/mock-interview/complete
     */
    completeSession(req: Request, res: Response): Promise<void>;
    /**
     * Get user statistics for mock interviews
     * GET /api/mock-interview/stats/:userId
     */
    getUserStats(req: Request, res: Response): Promise<void>;
    /**
     * Clear cached interviews for a specific field
     * POST /api/mock-interview/clear-cache
     */
    clearCache(req: Request, res: Response): Promise<void>;
}
export declare const mockInterviewController: MockInterviewController;
//# sourceMappingURL=mockInterviewController.d.ts.map