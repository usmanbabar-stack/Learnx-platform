import { TranscriptSegment } from './transcriptOrchestrationService';
export interface VideoSummary {
    overview: string;
    keyPoints: string[];
    mainTopics: string[];
    keyTimestamps: Array<{
        time: string;
        description: string;
    }>;
    targetAudience: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedWatchTime: string;
}
export declare class SummaryService {
    private static instance;
    private constructor();
    static getInstance(): SummaryService;
    generateComprehensiveSummary(transcript: TranscriptSegment[], videoTitle: string, videoChannel?: string): Promise<VideoSummary>;
    private prepareTranscriptForSummary;
    private validateDifficulty;
    private calculateWatchTime;
    generateQuickSummary(transcript: TranscriptSegment[]): Promise<string>;
    private sampleTranscript;
}
export declare const summaryService: SummaryService;
//# sourceMappingURL=summaryService.d.ts.map