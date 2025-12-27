import { QdrantClient } from '@qdrant/js-client-rest';
export declare const getQdrantClient: () => QdrantClient;
export declare const connectQdrant: () => Promise<void>;
export declare const ensureQdrantCollection: () => Promise<void>;
export declare const getCollectionName: () => string;
//# sourceMappingURL=qdrant.d.ts.map