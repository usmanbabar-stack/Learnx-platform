export interface TranscriptChunk {
    text: string;
    start: number;
    end: number;
    index: number;
}
export interface QdrantPoint {
    id: string;
    vector: number[];
    payload: {
        videoId: string;
        text: string;
        start: number;
        end: number;
        chunkIndex: number;
    };
}
export declare class QdrantService {
    private client;
    private collectionName;
    /**
     * ⚡ OPTIMIZED: Progressive indexing for sub-60-second AI readiness
     * Returns immediately after first 30 chunks are indexed
     * Continues indexing remaining chunks in background
     */
    upsertChunksProgressive(videoId: string, chunks: TranscriptChunk[], onInitialReady?: () => void): Promise<void>;
    /**
     * Background indexing for remaining chunks (non-blocking)
     */
    private indexRemainingChunks;
    upsertChunks(videoId: string, chunks: TranscriptChunk[]): Promise<void>;
    searchChunks(videoId: string, query: string, limit?: number, scoreThreshold?: number): Promise<Array<{
        chunk: TranscriptChunk;
        score: number;
    }>>;
    deleteChunksByVideoId(videoId: string): Promise<void>;
    getChunkCount(videoId: string): Promise<number>;
}
export declare const qdrantService: QdrantService;
//# sourceMappingURL=qdrantService.d.ts.map