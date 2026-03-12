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
     * CACHING STRATEGY:
     * 1. Check PostgreSQL (permanent cache - shared across all users)
     * 2. If not found, generate with LLM and save to PostgreSQL
     * 3. Redis used only for short-term session cache
     */
    generateSummary(req: Request, res: Response): Promise<void>;
    /**
     * Generate glossary from transcript
     * CACHING STRATEGY:
     * 1. Check PostgreSQL (permanent cache - shared across all users)
     * 2. If not found, generate with LLM and save to PostgreSQL
     */
    generateGlossary(req: Request, res: Response): Promise<void>;
    /**
     * Generate flashcards from transcript
     */
    generateFlashcards(req: Request, res: Response): Promise<void>;
    /**
     * Generate quiz from transcript with PostgreSQL caching
     * CACHING STRATEGY:
     * 1. Check PostgreSQL (permanent cache - shared across all users)
     * 2. If not found, generate with LLM and save to PostgreSQL
     */
    generateQuiz(req: Request, res: Response): Promise<void>;
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
}
export declare const transcriptController: TranscriptController;
//# sourceMappingURL=transcriptController.d.ts.map