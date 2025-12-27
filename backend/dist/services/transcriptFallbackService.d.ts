export interface FallbackTranscriptSegment {
    text: string;
    start: number;
    duration: number;
}
export declare function fetchTranscriptViaWatchPage(videoId: string, preferredLangs?: string[]): Promise<FallbackTranscriptSegment[]>;
//# sourceMappingURL=transcriptFallbackService.d.ts.map