import { Pool, PoolClient } from 'pg';
export declare const getPostgresPool: () => Pool;
export declare const connectPostgres: () => Promise<void>;
export declare const disconnectPostgres: () => Promise<void>;
export declare const withTransaction: <T>(callback: (client: PoolClient) => Promise<T>) => Promise<T>;
//# sourceMappingURL=postgres.d.ts.map