import { getQdrantClient, getCollectionName } from '../config/qdrant';
import { logger } from '../utils/logger';
import { getEmbeddings } from './geminiService';
import { v4 as uuidv4 } from 'uuid';

// ⚡ OPTIMIZATION: Number of chunks to index immediately for fast AI readiness
const INITIAL_CHUNKS_COUNT = 30;

export interface TranscriptChunk {
  text: string;
  start: number;
  end: number;
  index: number;
}

export interface QdrantPoint {
  id: string; // UUID string
  vector: number[];
  payload: {
    videoId: string;
    text: string;
    start: number;
    end: number;
    chunkIndex: number;
  };
}

export class QdrantService {
  private client = getQdrantClient();
  private collectionName = getCollectionName();

  /**
   * ⚡ OPTIMIZED: Progressive indexing for sub-60-second AI readiness
   * Returns immediately after first 30 chunks are indexed
   * Continues indexing remaining chunks in background
   */
  async upsertChunksProgressive(
    videoId: string, 
    chunks: TranscriptChunk[],
    onInitialReady?: () => void
  ): Promise<void> {
    if (chunks.length === 0) return;

    try {
      // Delete existing chunks first
      await this.deleteChunksByVideoId(videoId);

      // Split into initial batch (fast) and remaining (background)
      const initialChunks = chunks.slice(0, INITIAL_CHUNKS_COUNT);
      const remainingChunks = chunks.slice(INITIAL_CHUNKS_COUNT);

      logger.info(`⚡ Progressive indexing: ${initialChunks.length} initial + ${remainingChunks.length} background for ${videoId}`);

      // Index initial chunks immediately
      const initialTexts = initialChunks.map(c => c.text);
      const initialEmbeddings = await getEmbeddings(initialTexts, process.env.EMBEDDING_MODEL || 'gemini-embedding-001');

      // Filter out chunks with empty embeddings to prevent Qdrant dimension errors
      const validInitial = initialChunks
        .map((chunk, idx) => ({ chunk, embedding: initialEmbeddings[idx] }))
        .filter(item => item.embedding && item.embedding.length > 0);

      if (validInitial.length > 0) {
        const initialPoints = validInitial.map(({ chunk, embedding }) => ({
          id: uuidv4(),
          vector: embedding,
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

        logger.info(`✅ Initial ${validInitial.length}/${initialChunks.length} chunks indexed for ${videoId} - AI READY!`);
        
        // Notify caller that initial indexing is complete
        if (onInitialReady) {
          onInitialReady();
        }
      }

      // Index remaining chunks in background (non-blocking)
      if (remainingChunks.length > 0) {
        this.indexRemainingChunks(videoId, remainingChunks).catch(err => {
          logger.warn(`Background indexing failed for ${videoId}: ${err}`);
        });
      }
    } catch (error) {
      logger.error(`Failed progressive upsert for ${videoId}:`, error);
      throw error;
    }
  }

  /**
   * Background indexing for remaining chunks (non-blocking)
   */
  private async indexRemainingChunks(videoId: string, chunks: TranscriptChunk[]): Promise<void> {
    try {
      const texts = chunks.map(c => c.text);
      const embeddings = await getEmbeddings(texts, process.env.EMBEDDING_MODEL || 'gemini-embedding-001');

      // Filter out chunks with empty embeddings
      const valid = chunks
        .map((chunk, idx) => ({ chunk, embedding: embeddings[idx] }))
        .filter(item => item.embedding && item.embedding.length > 0);

      if (valid.length === 0) {
        logger.warn(`No valid embeddings for background indexing of ${videoId}`);
        return;
      }

      const points = valid.map(({ chunk, embedding }) => ({
        id: uuidv4(),
        vector: embedding,
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

      logger.info(`✅ Background indexed ${valid.length}/${chunks.length} additional chunks for ${videoId}`);
    } catch (error) {
      logger.error(`Background indexing error for ${videoId}:`, error);
    }
  }

  async upsertChunks(videoId: string, chunks: TranscriptChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    try {
      // Generate embeddings for all chunks in batch
      const texts = chunks.map(c => c.text);
      const embeddings = await getEmbeddings(texts, process.env.EMBEDDING_MODEL || 'gemini-embedding-001');
      
      // Filter out chunks with empty embeddings
      const valid = chunks
        .map((chunk, idx) => ({ chunk, embedding: embeddings[idx] }))
        .filter(item => item.embedding && item.embedding.length > 0);

      if (valid.length === 0) {
        throw new Error('All embeddings returned empty - check embedding model configuration');
      }

      // Delete existing chunks for this video (to allow updates)
      await this.deleteChunksByVideoId(videoId);

      // Prepare points for batch insert (use UUID for point IDs)
      const points = valid.map(({ chunk, embedding }) => ({
        id: uuidv4(),
        vector: embedding,
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

      logger.info(`✅ Upserted ${valid.length}/${chunks.length} chunks for video ${videoId} into Qdrant`);
    } catch (error) {
      logger.error(`Failed to upsert chunks for ${videoId}:`, error);
      throw error;
    }
  }

  async searchChunks(
    videoId: string,
    query: string,
    limit: number = 10,
    scoreThreshold: number = 0.5
  ): Promise<Array<{ chunk: TranscriptChunk; score: number }>> {
    try {
      // Generate query embedding
      const queryEmbeddings = await getEmbeddings([query], process.env.EMBEDDING_MODEL || 'gemini-embedding-001');
      if (queryEmbeddings.length === 0 || queryEmbeddings[0].length === 0) {
        logger.warn('Failed to generate query embedding');
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
          text: result.payload?.text as string || '',
          start: result.payload?.start as number || 0,
          end: result.payload?.end as number || 0,
          index: result.payload?.chunkIndex as number || 0
        },
        score: result.score || 0
      }));
    } catch (error) {
      logger.error(`Failed to search chunks for ${videoId}:`, error);
      return [];
    }
  }

  async deleteChunksByVideoId(videoId: string): Promise<void> {
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
      logger.info(`Deleted chunks for video ${videoId} from Qdrant`);
    } catch (error) {
      logger.error(`Failed to delete chunks for ${videoId}:`, error);
      throw error;
    }
  }

  async getChunkCount(videoId: string): Promise<number> {
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
    } catch (error) {
      logger.error(`Failed to get chunk count for ${videoId}:`, error);
      return 0;
    }
  }
}

export const qdrantService = new QdrantService();

