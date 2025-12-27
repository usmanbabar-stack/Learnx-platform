"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCollectionName = exports.ensureQdrantCollection = exports.connectQdrant = exports.getQdrantClient = void 0;
const js_client_rest_1 = require("@qdrant/js-client-rest");
const logger_1 = require("../utils/logger");
let qdrantClient = null;
const getQdrantClient = () => {
    if (!qdrantClient) {
        const url = process.env.QDRANT_URL || 'http://localhost:6333';
        const apiKey = process.env.QDRANT_API_KEY;
        qdrantClient = new js_client_rest_1.QdrantClient({
            url,
            ...(apiKey && { apiKey }),
        });
        logger_1.logger.info(`Qdrant client initialized: ${url}`);
    }
    return qdrantClient;
};
exports.getQdrantClient = getQdrantClient;
const connectQdrant = async () => {
    try {
        const client = (0, exports.getQdrantClient)();
        await client.getCollections();
        logger_1.logger.info('Qdrant connected successfully');
        // Ensure collection exists
        await (0, exports.ensureQdrantCollection)();
    }
    catch (error) {
        logger_1.logger.error('Qdrant connection failed:', error);
        throw error;
    }
};
exports.connectQdrant = connectQdrant;
const COLLECTION_NAME = 'video_transcript_chunks';
const EMBEDDING_DIM = 768; // text-embedding-004 dimension
const ensureQdrantCollection = async () => {
    try {
        const client = (0, exports.getQdrantClient)();
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
            logger_1.logger.info(`Qdrant collection '${COLLECTION_NAME}' created with videoId index`);
        }
        else {
            logger_1.logger.info(`Qdrant collection '${COLLECTION_NAME}' already exists`);
        }
    }
    catch (error) {
        logger_1.logger.error('Failed to ensure Qdrant collection:', error);
        throw error;
    }
};
exports.ensureQdrantCollection = ensureQdrantCollection;
const getCollectionName = () => COLLECTION_NAME;
exports.getCollectionName = getCollectionName;
//# sourceMappingURL=qdrant.js.map