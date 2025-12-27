import { Request, Response } from 'express';
export declare class TranscriptController {
    /**
     * Get video transcript
     */
    getTranscript(req: Request, res: Response): Promise<void>;
    /**
     * Search within video transcript
     */
    searchTranscript(req: Request, res: Response): Promise<void>;
    /**
     * Generate transcript summary
     */
    generateSummary(req: Request, res: Response): Promise<void>;
    /**
     * Convert transcript to SRT format
     */
    private convertToSRT;
    /**
     * Format timestamp for SRT
     */
    private formatSRTTimestamp;
    /**
     * Format timestamp for display
     */
    private formatTimestamp;
    /**
     * Calculate relevance score for search
     */
    private calculateRelevanceScore;
    /**
     * Generate text summary (simple extractive summarization)
     */
    private generateTextSummary;
    /**
     * Calculate word frequency
     */
    private calculateWordFrequency;
    /**
     * Score sentence for summary
     */
    private scoreSentence;
    /**
     * Extract key topics from text
     */
    private extractKeyTopics;
    /**
     * Find key moments in transcript
     */
    private findKeyMoments;
    /**
     * Helper methods (similar to other controllers)
     */
    private determineSubject;
    private determineDifficulty;
    private calculateQualityScore;
}
export declare const transcriptController: TranscriptController;
//# sourceMappingURL=transcriptController.d.ts.map