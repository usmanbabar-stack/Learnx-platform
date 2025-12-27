import { Request, Response } from 'express';
export declare class VideoController {
    /**
     * Search for videos based on query
     */
    searchVideos(req: Request, res: Response): Promise<void>;
    /**
     * Get video by ID
     */
    getVideoById(req: Request, res: Response): Promise<void>;
    /**
     * Get videos by subject
     */
    getVideosBySubject(req: Request, res: Response): Promise<void>;
    /**
     * Get video transcript
     */
    getVideoTranscript(req: Request, res: Response): Promise<void>;
    /**
     * Batch process videos
     */
    batchProcessVideos(req: Request, res: Response): Promise<void>;
    /**
     * Preload multiple videos' transcripts in the background
     */
    preloadVideosBatch(req: Request, res: Response): Promise<void>;
    /**
     * Preload video data for instant chatbot readiness
     */
    preloadVideo(req: Request, res: Response): Promise<void>;
    /**
     * 🚀 OPTIMIZATION: Check if transcript is ready for instant response
     * Frontend can poll this to show loading status
     */
    getTranscriptStatus(req: Request, res: Response): Promise<void>;
    /**
     * Get trending educational videos
     */
    getTrendingVideos(req: Request, res: Response): Promise<void>;
    /**
     * Determine subject based on title and description
     */
    private determineSubject;
    /**
     * Determine difficulty level
     */
    private determineDifficulty;
    /**
     * Calculate quality score based on various factors
     */
    private calculateQualityScore;
    /**
     * Parse duration string to seconds
     */
    private parseDuration;
}
export declare const videoController: VideoController;
//# sourceMappingURL=videoController.d.ts.map