import { Request, Response } from 'express';
export declare class SearchController {
    private static memoryCache;
    private static readonly CACHE_TTL;
    /**
     * Main search endpoint
     */
    search(req: Request, res: Response): Promise<void>;
    /**
     * Get search suggestions
     */
    getSuggestions(req: Request, res: Response): Promise<void>;
    /**
     * Get trending topics
     */
    getTrendingTopics(req: Request, res: Response): Promise<void>;
    /**
     * Get available subjects
     */
    getSubjects(req: Request, res: Response): Promise<void>;
    /**
     * Search in database
     */
    private searchInDatabase;
    /**
     * Process YouTube search results
     */
    private processYouTubeResults;
    /**
     * Get subject statistics
     */
    private getSubjectStats;
    /**
     * Helper methods (similar to VideoController)
     */
    private determineSubject;
    private determineDifficulty;
    private calculateQualityScore;
}
export declare const searchController: SearchController;
//# sourceMappingURL=searchController.d.ts.map