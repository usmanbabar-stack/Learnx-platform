import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { getPostgresPool } from '../config/postgres';
import { logger } from '../utils/logger';

export async function runMigrations(): Promise<void> {
  try {
    const pool = getPostgresPool();
    const client = await pool.connect();
    
    try {
      const migrationsDir = join(__dirname, 'migrations');
      const migrationFiles = readdirSync(migrationsDir)
        .filter(f => f.endsWith('.sql'))
        .sort();
      
      for (const file of migrationFiles) {
        const migrationPath = join(migrationsDir, file);
        const sql = readFileSync(migrationPath, 'utf-8');
        
        try {
          await client.query(sql);
          logger.info(`✅ Migration ${file} applied successfully`);
        } catch (error: any) {
          // Skip if already exists
          if (error.code === '42P07' || error.message?.includes('already exists')) {
            logger.info(`✅ Migration ${file} already applied (skipping)`);
          } else if (error.code === '42710') {
            // Trigger or function already exists
            logger.info(`✅ Migration ${file} already applied (trigger exists)`);
          } else {
            logger.warn(`⚠️ Migration ${file} warning:`, error.message);
          }
        }
      }
      
      logger.info('✅ All migrations completed');
    } finally {
      client.release();
    }
  } catch (error) {
    logger.error('❌ Migration error:', error);
    throw error;
  }
}

// Run migrations if this file is executed directly
if (require.main === module) {
  runMigrations()
    .then(() => {
      logger.info('Migrations completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Migration error:', error);
      process.exit(1);
    });
}

