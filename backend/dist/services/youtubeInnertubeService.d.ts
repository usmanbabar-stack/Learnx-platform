export interface InnertubeTranscriptSegment {
    text: string;
    start: number;
    duration: number;
}
export declare function resetInnertubeClient(): void;
export declare function fetchTranscriptViaInnertube(videoId: string, preferredLangs?: string[]): Promise<InnertubeTranscriptSegment[]>;
//# sourceMappingURL=youtubeInnertubeService.d.ts.map