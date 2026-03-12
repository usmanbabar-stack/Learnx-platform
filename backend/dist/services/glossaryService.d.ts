import { TranscriptSegment } from './transcriptOrchestrationService';
export interface GlossaryTerm {
    id: string;
    term: string;
    definition: string;
    category: string;
    relatedTerms: string[];
    videoTimestamp?: number;
    timestampFormatted?: string;
}
export interface VideoGlossary {
    terms: GlossaryTerm[];
    categories: string[];
    totalTerms: number;
    videoId: string;
    generatedAt: string;
}
export declare class GlossaryService {
    private static instance;
    private cache;
    private inFlightRequests;
    private constructor();
    static getInstance(): GlossaryService;
    generateGlossary(transcript: TranscriptSegment[], videoId: string, videoTitle: string): Promise<VideoGlossary>;
    private doGenerateGlossary;
    private prepareTranscriptWithTimestamps;
    private formatTimestamp;
    private getFallbackGlossary;
    clearCache(videoId: string): void;
    clearAllCache(): void;
}
export declare const glossaryService: GlossaryService;
//# sourceMappingURL=glossaryService.d.ts.map