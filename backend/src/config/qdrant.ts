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
const EMBEDDING_DIM = 768; // text-embedding-004 dimension

export const ensureQdrantCollection = async (): Promise<void> => {
  try {
    const client = getQdrantClient();
    
    // Check if collection exists
    const collections = await client.getCollections();
    const exists = collections.collections.some(c => c.name === COLLECTION_NAME);
    
    if (!exists) {
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
      
      logger.info(`Qdrant collection '${COLLECTION_NAME}' created with videoId index`);
    } else {
      logger.info(`Qdrant collection '${COLLECTION_NAME}' already exists`);
    }
  } catch (error) {
    logger.error('Failed to ensure Qdrant collection:', error);
    throw error;
  }
};

export const getCollectionName = (): string => COLLECTION_NAME;

