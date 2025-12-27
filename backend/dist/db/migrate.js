"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMigrations = runMigrations;
const fs_1 = require("fs");
const path_1 = require("path");
const postgres_1 = require("../config/postgres");
const logger_1 = require("../utils/logger");
async function runMigrations() {
    try {
        const pool = (0, postgres_1.getPostgresPool)();
        const client = await pool.connect();
        try {
            const migrationsDir = (0, path_1.join)(__dirname, 'migrations');
            const migrationFiles = (0, fs_1.readdirSync)(migrationsDir)
                .filter(f => f.endsWith('.sql'))
                .sort();
            for (const file of migrationFiles) {
                const migrationPath = (0, path_1.join)(migrationsDir, file);
                const sql = (0, fs_1.readFileSync)(migrationPath, 'utf-8');
                try {
                    await client.query(sql);
                    logger_1.logger.info(`✅ Migration ${file} applied successfully`);
                }
                catch (error) {
                    // Skip if already exists
                    if (error.code === '42P07' || error.message?.includes('already exists')) {
                        logger_1.logger.info(`✅ Migration ${file} already applied (skipping)`);
                    }
                    else if (error.code === '42710') {
                        // Trigger or function already exists
                        logger_1.logger.info(`✅ Migration ${file} already applied (trigger exists)`);
                    }
                    else {
                        logger_1.logger.warn(`⚠️ Migration ${file} warning:`, error.message);
                    }
                }
            }
            logger_1.logger.info('✅ All migrations completed');
        }
        finally {
            client.release();
        }
    }
    catch (error) {
        logger_1.logger.error('❌ Migration error:', error);
        throw error;
    }
}
// Run migrations if this file is executed directly
if (require.main === module) {
    runMigrations()
        .then(() => {
        logger_1.logger.info('Migrations completed successfully');
        process.exit(0);
    })
        .catch((error) => {
        logger_1.logger.error('Migration error:', error);
        process.exit(1);
    });
}
//# sourceMappingURL=migrate.js.map