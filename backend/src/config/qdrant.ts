import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../utils/logger';

let qdrantClient: QdrantClient | null = null;

export const getQdrantClient = (): QdrantClient => {
  if (!qdrantClient) {
    const url = process.env.QDRANT_URL || 'http://localhost:6333';
    const apiKey = process.env.QDRANT_API_KEY;
    
    qdrantClient = new QdrantClient({
      url,
      ...(apiKey && { apiKey }),
    });

    logger.info(`Qdrant client initialized: ${url}`);
  }
  return qdrantClient;
};

export const connectQdrant = async (): Promise<void> => {
  try {
    const client = getQdrantClient();
    await client.getCollections();
    logger.info('Qdrant connected successfully');
    
    // Ensure collection exists
    await ensureQdrantCollection();
  } catch (error) {
    logger.error('Qdrant connection failed:', error);
    throw error;
  }
};

const COLLECTION_NAME = 'video_transcript_chunks';
const EMBEDDING_DIM = 3072; // gemini-embedding-001 dimension

export const ensureQdrantCollection = async (): Promise<void> => {
  try {
    const client = getQdrantClient();
    
    // Check if collection exists and has correct dimensions
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (exists) {
      // Verify dimension matches; recreate if mismatched
      const info = await client.getCollection(COLLECTION_NAME);
      const currentDim = (info.config?.params?.vectors as any)?.size;
      if (currentDim && currentDim !== EMBEDDING_DIM) {
        logger.warn(`Qdrant collection dimension mismatch: ${currentDim} vs ${EMBEDDING_DIM}. Recreating collection...`);
        await client.deleteCollection(COLLECTION_NAME);
        // Fall through to create below
      } else {
        logger.info(`Qdrant collection '${COLLECTION_NAME}' already exists (dim=${currentDim})`);
        return;
      }
    }
    
    await client.createCollection(COLLECTION_NAME, {
      vectors: {
        size: EMBEDDING_DIM,
        distance: 'Cosine',
      },
    });
      
    // Create payload index on videoId for fast filtering
    await client.createPayloadIndex(COLLECTION_NAME, {
      field_name: 'videoId',
      field_schema: 'keyword',
    });
      
    logger.info(`Qdrant collection '${COLLECTION_NAME}' created with dim=${EMBEDDING_DIM} and videoId index`);
  } catch (error) {
    logger.error('Failed to ensure Qdrant collection:', error);
    throw error;
  }
};

export const getCollectionName = (): string => COLLECTION_NAME;

