"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withTransaction = exports.disconnectPostgres = exports.connectPostgres = exports.getPostgresPool = void 0;
const pg_1 = require("pg");
const logger_1 = require("../utils/logger");
let pool = null;
const getPostgresPool = () => {
    if (!pool) {
        // Try POSTGRES_URL first, if it exists use it
        // Otherwise build from individual env vars (better for passwords with special chars)
        const connectionString = process.env.POSTGRES_URL || process.env.DATABASE_URL;
        if (connectionString) {
            pool = new pg_1.Pool({
                connectionString,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            });
        }
        else {
            // Use individual config (handles special chars in password better)
            pool = new pg_1.Pool({
                user: process.env.POSTGRES_USER || 'postgres',
                password: process.env.POSTGRES_PASSWORD || 'postgres',
                host: process.env.POSTGRES_HOST || 'localhost',
                port: parseInt(process.env.POSTGRES_PORT || '5432'),
                database: process.env.POSTGRES_DB || 'learnx',
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 10000,
            });
        }
        pool.on('error', (err) => {
            logger_1.logger.error('Unexpected PostgreSQL pool error:', err);
        });
        logger_1.logger.info('PostgreSQL pool created');
    }
    return pool;
};
exports.getPostgresPool = getPostgresPool;
const connectPostgres = async () => {
    try {
        const pool = (0, exports.getPostgresPool)();
        const client = await pool.connect();
        await client.query('SELECT NOW()');
        client.release();
        logger_1.logger.info('PostgreSQL connected successfully');
    }
    catch (error) {
        logger_1.logger.error('PostgreSQL connection failed:', error);
        throw error;
    }
};
exports.connectPostgres = connectPostgres;
const disconnectPostgres = async () => {
    try {
        if (pool) {
            await pool.end();
            pool = null;
            logger_1.logger.info('PostgreSQL disconnected successfully');
        }
    }
    catch (error) {
        logger_1.logger.error('Error disconnecting from PostgreSQL:', error);
        throw error;
    }
};
exports.disconnectPostgres = disconnectPostgres;
const withTransaction = async (callback) => {
    const pool = (0, exports.getPostgresPool)();
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
    }
    catch (error) {
        await client.query('ROLLBACK');
        throw error;
    }
    finally {
        client.release();
    }
};
exports.withTransaction = withTransaction;
//# sourceMappingURL=postgres.js.map