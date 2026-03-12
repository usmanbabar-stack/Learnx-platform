export interface TranscriptSegment {
    text: string;
    start: number;
    duration: number;
}
export interface TranscriptQuality {
    segments: TranscriptSegment[];
    source: 'db' | 'watch-page' | 'yt-dlp' | 'whisper' | 'qdrant-only';
    confidence: 'high' | 'medium' | 'low';
    processingTime: number;
    wordCount: number;
    isReady: boolean;
}
export declare class TranscriptOrchestrationService {
    private static instance;
    private processingQueue;
    private readinessStatus;
    private constructor();
    static getInstance(): TranscriptOrchestrationService;
    getReadinessStatus(videoId: string): {
        ready: boolean;
        message: string;
    };
    preloadTranscript(videoId: string): Promise<void>;
    getHighQualityTranscript(videoId: string): Promise<TranscriptQuality>;
    private getCachedTranscript;
    private indexInQdrantBackground;
    private fetchAndCacheTranscript;
    private saveToStorageBackground;
    warmupTranscripts(videoIds: string[]): Promise<void>;
}
export declare const transcriptOrchestrationService: TranscriptOrchestrationService;
//# sourceMappingURL=transcriptOrchestrationService.d.ts.map