export interface TranscriptSegment {
    text: string;
    start: number;
    duration: number;
}
export declare function fetchTranscriptWithYtDlp(videoId: string, retryCount?: number): Promise<TranscriptSegment[]>;
//# sourceMappingURL=ytdlpTranscriptService.d.ts.map