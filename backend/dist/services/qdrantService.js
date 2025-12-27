"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.qdrantService = exports.QdrantService = void 0;
const qdrant_1 = require("../config/qdrant");
const logger_1 = require("../utils/logger");
const geminiService_1 = require("./geminiService");
const uuid_1 = require("uuid");
// ⚡ OPTIMIZATION: Number of chunks to index immediately for fast AI readiness
const INITIAL_CHUNKS_COUNT = 30;
class QdrantService {
    constructor() {
        this.client = (0, qdrant_1.getQdrantClient)();
        this.collectionName = (0, qdrant_1.getCollectionName)();
    }
    /**
     * ⚡ OPTIMIZED: Progressive indexing for sub-60-second AI readiness
     * Returns immediately after first 30 chunks are indexed
     * Continues indexing remaining chunks in background
     */
    async upsertChunksProgressive(videoId, chunks, onInitialReady) {
        if (chunks.length === 0)
            return;
        try {
            // Delete existing chunks first
            await this.deleteChunksByVideoId(videoId);
            // Split into initial batch (fast) and remaining (background)
            const initialChunks = chunks.slice(0, INITIAL_CHUNKS_COUNT);
            const remainingChunks = chunks.slice(INITIAL_CHUNKS_COUNT);
            logger_1.logger.info(`⚡ Progressive indexing: ${initialChunks.length} initial + ${remainingChunks.length} background for ${videoId}`);
            // Index initial chunks immediately
            const initialTexts = initialChunks.map(c => c.text);
            const initialEmbeddings = await (0, geminiService_1.getEmbeddings)(initialTexts, process.env.EMBEDDING_MODEL || 'text-embedding-004');
            if (initialEmbeddings.length === initialChunks.length) {
                const initialPoints = initialChunks.map((chunk, idx) => ({
                    id: (0, uuid_1.v4)(),
                    vector: initialEmbeddings[idx],
                    payload: {
                        videoId,
                        text: chunk.text,
                        start: chunk.start,
                        end: chunk.end,
                        chunkIndex: chunk.index
                    }
                }));
                await this.client.upsert(this.collectionName, {
                    wait: true,
                    points: initialPoints
                });
                logger_1.logger.info(`✅ Initial ${initialChunks.length} chunks indexed for ${videoId} - AI READY!`);
                // Notify caller that initial indexing is complete
                if (onInitialReady) {
                    onInitialReady();
                }
            }
            // Index remaining chunks in background (non-blocking)
            if (remainingChunks.length > 0) {
                this.indexRemainingChunks(videoId, remainingChunks).catch(err => {
                    logger_1.logger.warn(`Background indexing failed for ${videoId}: ${err}`);
                });
            }
        }
        catch (error) {
            logger_1.logger.error(`Failed progressive upsert for ${videoId}:`, error);
            throw error;
        }
    }
    /**
     * Background indexing for remaining chunks (non-blocking)
     */
    async indexRemainingChunks(videoId, chunks) {
        try {
            const texts = chunks.map(c => c.text);
            const embeddings = await (0, geminiService_1.getEmbeddings)(texts, process.env.EMBEDDING_MODEL || 'text-embedding-004');
            if (embeddings.length !== chunks.length) {
                logger_1.logger.warn(`Background embedding mismatch: ${embeddings.length} vs ${chunks.length}`);
                return;
            }
            const points = chunks.map((chunk, idx) => ({
                id: (0, uuid_1.v4)(),
                vector: embeddings[idx],
                payload: {
                    videoId,
                    text: chunk.text,
                    start: chunk.start,
                    end: chunk.end,
                    chunkIndex: chunk.index
                }
            }));
            // Batch upsert remaining
            const batchSize = 100;
            for (let i = 0; i < points.length; i += batchSize) {
                const batch = points.slice(i, i + batchSize);
                await this.client.upsert(this.collectionName, {
                    wait: true,
                    points: batch
                });
            }
            logger_1.logger.info(`✅ Background indexed ${chunks.length} additional chunks for ${videoId}`);
        }
        catch (error) {
            logger_1.logger.error(`Background indexing error for ${videoId}:`, error);
        }
    }
    async upsertChunks(videoId, chunks) {
        if (chunks.length === 0)
            return;
        try {
            // Generate embeddings for all chunks in batch
            const texts = chunks.map(c => c.text);
            const embeddings = await (0, geminiService_1.getEmbeddings)(texts, process.env.EMBEDDING_MODEL || 'text-embedding-004');
            if (embeddings.length !== chunks.length) {
                throw new Error(`Embedding count mismatch: expected ${chunks.length}, got ${embeddings.length}`);
            }
            // Delete existing chunks for this video (to allow updates)
            await this.deleteChunksByVideoId(videoId);
            // Prepare points for batch insert (use UUID for point IDs)
            const points = chunks.map((chunk, idx) => ({
                id: (0, uuid_1.v4)(), // Generate unique UUID for each point
                vector: embeddings[idx],
                payload: {
                    videoId,
                    text: chunk.text,
                    start: chunk.start,
                    end: chunk.end,
                    chunkIndex: chunk.index
                }
            }));
            // Batch upsert (Qdrant handles batching internally, but we can split for very large sets)
            const batchSize = 100;
            for (let i = 0; i < points.length; i += batchSize) {
                const batch = points.slice(i, i + batchSize);
                await this.client.upsert(this.collectionName, {
                    wait: true,
                    points: batch
                });
            }
            logger_1.logger.info(`✅ Upserted ${chunks.length} chunks for video ${videoId} into Qdrant`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to upsert chunks for ${videoId}:`, error);
            throw error;
        }
    }
    async searchChunks(videoId, query, limit = 10, scoreThreshold = 0.5) {
        try {
            // Generate query embedding
            const queryEmbeddings = await (0, geminiService_1.getEmbeddings)([query], process.env.EMBEDDING_MODEL || 'text-embedding-004');
            if (queryEmbeddings.length === 0 || queryEmbeddings[0].length === 0) {
                logger_1.logger.warn('Failed to generate query embedding');
                return [];
            }
            // Search with videoId filter (CRITICAL: only search within current video)
            const searchResult = await this.client.search(this.collectionName, {
                vector: queryEmbeddings[0],
                limit,
                score_threshold: scoreThreshold,
                filter: {
                    must: [
                        {
                            key: 'videoId',
                            match: {
                                value: videoId
                            }
                        }
                    ]
                },
                with_payload: true
            });
            // Map results to chunks
            return searchResult.map(result => ({
                chunk: {
                    text: result.payload?.text || '',
                    start: result.payload?.start || 0,
                    end: result.payload?.end || 0,
                    index: result.payload?.chunkIndex || 0
                },
                score: result.score || 0
            }));
        }
        catch (error) {
            logger_1.logger.error(`Failed to search chunks for ${videoId}:`, error);
            return [];
        }
    }
    async deleteChunksByVideoId(videoId) {
        try {
            await this.client.delete(this.collectionName, {
                wait: true,
                filter: {
                    must: [
                        {
                            key: 'videoId',
                            match: {
                                value: videoId
                            }
                        }
                    ]
                }
            });
            logger_1.logger.info(`Deleted chunks for video ${videoId} from Qdrant`);
        }
        catch (error) {
            logger_1.logger.error(`Failed to delete chunks for ${videoId}:`, error);
            throw error;
        }
    }
    async getChunkCount(videoId) {
        try {
            const result = await this.client.count(this.collectionName, {
                filter: {
                    must: [
                        {
                            key: 'videoId',
                            match: {
                                value: videoId
                            }
                        }
                    ]
                }
            });
            return result.count || 0;
        }
        catch (error) {
            logger_1.logger.error(`Failed to get chunk count for ${videoId}:`, error);
            return 0;
        }
    }
}
exports.QdrantService = QdrantService;
exports.qdrantService = new QdrantService();
//# sourceMappingURL=qdrantService.js.map