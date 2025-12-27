export interface TranscriptSegment {
    text: string;
    start: number;
    duration: number;
}
export interface TranscriptChunk {
    text: string;
    start: number;
    end: number;
    index: number;
}
interface ChunkOptions {
    segmentsPerChunk?: number;
    overlapSegments?: number;
}
interface RetrieveOptions {
    k?: number;
    useEmbeddings?: boolean;
    useQdrant?: boolean;
    currentTime?: number;
    videoId?: string;
}
export declare function chunkTranscript(transcript: TranscriptSegment[], options?: ChunkOptions): TranscriptChunk[];
export declare function retrieveRelevantChunks(transcript: TranscriptSegment[], query: string, opts?: RetrieveOptions): Promise<{
    contextText: string;
    topChunks: TranscriptChunk[];
}>;
export {};
//# sourceMappingURL=transcriptRetrievalService.d.ts.map