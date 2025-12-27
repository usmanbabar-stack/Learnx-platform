export interface TranscriptSegment {
    text: string;
    start: number;
    duration: number;
}
export declare function transcribeSnippetWithWhisper(videoId: string, currentTimeSec: number, windowSec?: number): Promise<TranscriptSegment[]>;
export declare function transcribeFullAudioWithWhisper(videoId: string): Promise<TranscriptSegment[]>;
//# sourceMappingURL=audioTranscriptService.d.ts.map