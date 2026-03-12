"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.videoRepository = exports.VideoRepository = void 0;
exports.getSummaryByVideoId = getSummaryByVideoId;
exports.saveSummary = saveSummary;
exports.getGlossaryByVideoId = getGlossaryByVideoId;
exports.saveGlossary = saveGlossary;
exports.deleteGlossary = deleteGlossary;
exports.getQuizByVideoId = getQuizByVideoId;
exports.saveQuiz = saveQuiz;
exports.getChatHistory = getChatHistory;
exports.saveChatMessage = saveChatMessage;
exports.clearChatHistory = clearChatHistory;
const postgres_1 = require("../config/postgres");
const logger_1 = require("../utils/logger");
class VideoRepository {
    constructor() {
        this.pool = (0, postgres_1.getPostgresPool)();
    }
    async findByVideoId(videoId) {
        const query = `
      SELECT 
        v.*,
        COALESCE(
          json_agg(
            json_build_object(
              'text', t.text,
              'start', t.start_time,
              'duration', t.duration
            ) ORDER BY t.sequence_order
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) as transcript,
        COALESCE(
          json_agg(k.keyword) FILTER (WHERE k.keyword IS NOT NULL),
          '[]'::json
        ) as search_keywords
      FROM videos v
      LEFT JOIN transcript_items t ON v.video_id = t.video_id
      LEFT JOIN video_keywords k ON v.video_id = k.video_id
      WHERE v.video_id = $1
      GROUP BY v.id
    `;
        const result = await this.pool.query(query, [videoId]);
        if (result.rows.length === 0)
            return null;
        return this.mapRowToVideoDocument(result.rows[0]);
    }
    async create(video) {
        return await this.pool.query('BEGIN').then(async () => {
            try {
                // Insert video
                const videoQuery = `
          INSERT INTO videos (
            video_id, title, channel, description, duration, views, likes,
            upload_date, category, thumbnail, url, subject, difficulty,
            language, is_educational, quality_score, scraped_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
          ON CONFLICT (video_id) DO UPDATE SET
            title = EXCLUDED.title,
            channel = EXCLUDED.channel,
            description = EXCLUDED.description,
            views = EXCLUDED.views,
            likes = EXCLUDED.likes,
            updated_at = CURRENT_TIMESTAMP
          RETURNING *
        `;
                const videoResult = await this.pool.query(videoQuery, [
                    video.videoId,
                    video.metadata.title,
                    video.metadata.channel,
                    video.metadata.description,
                    video.metadata.duration,
                    video.metadata.views,
                    video.metadata.likes || '0',
                    video.metadata.uploadDate,
                    video.metadata.category || 'Education',
                    video.metadata.thumbnail,
                    video.metadata.url,
                    video.subject,
                    video.difficulty,
                    video.language,
                    video.isEducational,
                    video.qualityScore,
                    video.metadata.scrapedAt || new Date()
                ]);
                const videoId = videoResult.rows[0].video_id;
                // Delete existing transcript and keywords
                await this.pool.query('DELETE FROM transcript_items WHERE video_id = $1', [videoId]);
                await this.pool.query('DELETE FROM video_keywords WHERE video_id = $1', [videoId]);
                // Insert transcript items (batch insert for performance)
                if (video.transcript && video.transcript.length > 0) {
                    const transcriptValues = video.transcript.map((item, idx) => `($1, $${idx * 3 + 2}, $${idx * 3 + 3}, $${idx * 3 + 4}, $${idx * 3 + 5})`).join(', ');
                    const transcriptParams = [videoId];
                    video.transcript.forEach((item, idx) => {
                        transcriptParams.push(item.text, item.start, item.duration, idx);
                    });
                    await this.pool.query(`INSERT INTO transcript_items (video_id, text, start_time, duration, sequence_order) VALUES ${transcriptValues}`, transcriptParams);
                }
                // Insert keywords (batch insert)
                if (video.searchKeywords && video.searchKeywords.length > 0) {
                    const keywordValues = video.searchKeywords.map((_, idx) => `($1, $${idx + 2})`).join(', ');
                    const keywordParams = [videoId, ...video.searchKeywords];
                    await this.pool.query(`INSERT INTO video_keywords (video_id, keyword) VALUES ${keywordValues} ON CONFLICT DO NOTHING`, keywordParams);
                }
                await this.pool.query('COMMIT');
                // Fetch and return the complete document
                const saved = await this.findByVideoId(videoId);
                return saved;
            }
            catch (error) {
                await this.pool.query('ROLLBACK');
                throw error;
            }
        });
    }
    async findBySubject(subject, limit = 20) {
        const query = `
      SELECT 
        v.*,
        COALESCE(
          json_agg(
            json_build_object(
              'text', t.text,
              'start', t.start_time,
              'duration', t.duration
            ) ORDER BY t.sequence_order
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) as transcript,
        COALESCE(
          json_agg(k.keyword) FILTER (WHERE k.keyword IS NOT NULL),
          '[]'::json
        ) as search_keywords
      FROM videos v
      LEFT JOIN transcript_items t ON v.video_id = t.video_id
      LEFT JOIN video_keywords k ON v.video_id = k.video_id
      WHERE v.subject = $1 AND v.is_educational = true
      GROUP BY v.id
      ORDER BY v.quality_score DESC, v.created_at DESC
      LIMIT $2
    `;
        const result = await this.pool.query(query, [subject, limit]);
        return result.rows.map(row => this.mapRowToVideoDocument(row));
    }
    async searchVideos(query, filters = {}, limit = 20) {
        const conditions = ['v.is_educational = true'];
        const params = [];
        let paramIndex = 1;
        // Full-text search on title and description
        conditions.push(`(
      to_tsvector('english', v.title) @@ plainto_tsquery('english', $${paramIndex}) OR
      to_tsvector('english', v.description) @@ plainto_tsquery('english', $${paramIndex}) OR
      v.title ILIKE $${paramIndex + 1} OR
      v.description ILIKE $${paramIndex + 1} OR
      EXISTS (
        SELECT 1 FROM video_keywords k 
        WHERE k.video_id = v.video_id 
        AND k.keyword ILIKE $${paramIndex + 1}
      )
    )`);
        params.push(query, `%${query}%`);
        paramIndex += 2;
        // Apply filters
        if (filters.subject) {
            conditions.push(`v.subject = $${paramIndex}`);
            params.push(filters.subject);
            paramIndex++;
        }
        if (filters.difficulty) {
            conditions.push(`v.difficulty = $${paramIndex}`);
            params.push(filters.difficulty);
            paramIndex++;
        }
        if (filters.language) {
            conditions.push(`v.language = $${paramIndex}`);
            params.push(filters.language);
            paramIndex++;
        }
        if (filters.minQualityScore) {
            conditions.push(`v.quality_score >= $${paramIndex}`);
            params.push(filters.minQualityScore);
            paramIndex++;
        }
        // Sort order
        let orderBy = 'v.quality_score DESC, v.created_at DESC';
        if (filters.sortBy) {
            switch (filters.sortBy) {
                case 'date':
                    orderBy = 'v.created_at DESC';
                    break;
                case 'views':
                    orderBy = 'v.views DESC';
                    break;
                case 'rating':
                    orderBy = 'v.quality_score DESC';
                    break;
            }
        }
        const sql = `
      SELECT 
        v.*,
        COALESCE(
          json_agg(
            json_build_object(
              'text', t.text,
              'start', t.start_time,
              'duration', t.duration
            ) ORDER BY t.sequence_order
          ) FILTER (WHERE t.id IS NOT NULL),
          '[]'::json
        ) as transcript,
        COALESCE(
          json_agg(k.keyword) FILTER (WHERE k.keyword IS NOT NULL),
          '[]'::json
        ) as search_keywords
      FROM videos v
      LEFT JOIN transcript_items t ON v.video_id = t.video_id
      LEFT JOIN video_keywords k ON v.video_id = k.video_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY v.id
      ORDER BY ${orderBy}
      LIMIT $${paramIndex}
    `;
        params.push(limit);
        const result = await this.pool.query(sql, params);
        return result.rows.map(row => this.mapRowToVideoDocument(row));
    }
    async getTranscriptByVideoId(videoId) {
        const query = `
      SELECT text, start_time as start, duration
      FROM transcript_items
      WHERE video_id = $1
      ORDER BY sequence_order
    `;
        const result = await this.pool.query(query, [videoId]);
        return result.rows.map(row => ({
            text: row.text,
            start: parseFloat(row.start),
            duration: parseFloat(row.duration)
        }));
    }
    async saveTranscript(videoId, segments) {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            // Delete existing transcript items for this video (if any)
            await client.query('DELETE FROM transcript_items WHERE video_id = $1', [videoId]);
            // 🚀 OPTIMIZATION: Use bulk INSERT with VALUES list for massive speedup
            // Instead of N separate INSERT statements, we do 1 bulk insert
            if (segments && segments.length > 0) {
                // Batch in groups of 500 to avoid query size limits
                const BATCH_SIZE = 500;
                for (let batchStart = 0; batchStart < segments.length; batchStart += BATCH_SIZE) {
                    const batch = segments.slice(batchStart, batchStart + BATCH_SIZE);
                    // Build VALUES clause dynamically
                    const values = [videoId];
                    const valuePlaceholders = [];
                    batch.forEach((segment, idx) => {
                        const baseIdx = idx * 4 + 2; // Start at $2 since $1 is videoId
                        valuePlaceholders.push(`($1, $${baseIdx}, $${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3})`);
                        values.push(segment.text, segment.start, segment.duration, batchStart + idx // sequence_order
                        );
                    });
                    const bulkInsertQuery = `
            INSERT INTO transcript_items (video_id, text, start_time, duration, sequence_order)
            VALUES ${valuePlaceholders.join(', ')}
          `;
                    await client.query(bulkInsertQuery, values);
                }
            }
            await client.query('COMMIT');
            logger_1.logger.info(`Saved ${segments.length} transcript segments for video: ${videoId} (bulk insert)`);
        }
        catch (error) {
            await client.query('ROLLBACK');
            logger_1.logger.error(`Failed to save transcript for ${videoId}:`, error);
            throw error;
        }
        finally {
            client.release();
        }
    }
    mapRowToVideoDocument(row) {
        const metadata = {
            videoId: row.video_id,
            title: row.title,
            channel: row.channel,
            description: row.description || '',
            duration: row.duration,
            views: row.views || '0',
            likes: row.likes || '0',
            uploadDate: row.upload_date,
            category: row.category || 'Education',
            thumbnail: row.thumbnail,
            url: row.url,
            scrapedAt: row.scraped_at || new Date()
        };
        const transcript = Array.isArray(row.transcript)
            ? row.transcript.map((t) => ({
                text: t.text,
                start: parseFloat(t.start),
                duration: parseFloat(t.duration)
            }))
            : [];
        return {
            videoId: row.video_id,
            metadata,
            transcript,
            searchKeywords: Array.isArray(row.search_keywords) ? row.search_keywords : [],
            subject: row.subject,
            difficulty: row.difficulty,
            language: row.language,
            isEducational: row.is_educational,
            qualityScore: parseFloat(row.quality_score),
            createdAt: row.created_at,
            updatedAt: row.updated_at
        };
    }
}
exports.VideoRepository = VideoRepository;
exports.videoRepository = new VideoRepository();
// Summary Repository functions
async function getSummaryByVideoId(videoId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `SELECT * FROM video_summaries WHERE video_id = $1`;
    const result = await pool.query(query, [videoId]);
    if (result.rows.length === 0)
        return null;
    const row = result.rows[0];
    return {
        videoId: row.video_id,
        overview: row.overview,
        keyPoints: row.key_points || [],
        mainTopics: row.main_topics || [],
        keyTimestamps: row.key_timestamps || [],
        targetAudience: row.target_audience,
        difficulty: row.difficulty,
        estimatedWatchTime: row.estimated_watch_time,
        generationTimeMs: row.generation_time_ms,
        createdAt: row.created_at
    };
}
async function saveSummary(summary) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `
    INSERT INTO video_summaries (
      video_id, overview, key_points, main_topics, key_timestamps,
      target_audience, difficulty, estimated_watch_time, generation_time_ms
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT (video_id) DO UPDATE SET
      overview = EXCLUDED.overview,
      key_points = EXCLUDED.key_points,
      main_topics = EXCLUDED.main_topics,
      key_timestamps = EXCLUDED.key_timestamps,
      target_audience = EXCLUDED.target_audience,
      difficulty = EXCLUDED.difficulty,
      estimated_watch_time = EXCLUDED.estimated_watch_time,
      generation_time_ms = EXCLUDED.generation_time_ms,
      updated_at = CURRENT_TIMESTAMP
  `;
    await pool.query(query, [
        summary.videoId,
        summary.overview,
        JSON.stringify(summary.keyPoints),
        JSON.stringify(summary.mainTopics),
        JSON.stringify(summary.keyTimestamps),
        summary.targetAudience,
        summary.difficulty,
        summary.estimatedWatchTime,
        summary.generationTimeMs || null
    ]);
    logger_1.logger.info(`Saved summary to database for video: ${summary.videoId}`);
}
// Glossary Repository functions
async function getGlossaryByVideoId(videoId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `SELECT * FROM video_glossaries WHERE video_id = $1`;
    const result = await pool.query(query, [videoId]);
    if (result.rows.length === 0)
        return null;
    const row = result.rows[0];
    return {
        videoId: row.video_id,
        terms: row.terms || [],
        categories: row.categories || [],
        totalTerms: row.total_terms,
        generationTimeMs: row.generation_time_ms,
        createdAt: row.created_at
    };
}
async function saveGlossary(glossary) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `
    INSERT INTO video_glossaries (
      video_id, terms, categories, total_terms, generation_time_ms
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (video_id) DO UPDATE SET
      terms = EXCLUDED.terms,
      categories = EXCLUDED.categories,
      total_terms = EXCLUDED.total_terms,
      generation_time_ms = EXCLUDED.generation_time_ms,
      updated_at = CURRENT_TIMESTAMP
  `;
    await pool.query(query, [
        glossary.videoId,
        JSON.stringify(glossary.terms),
        JSON.stringify(glossary.categories),
        glossary.totalTerms,
        glossary.generationTimeMs || null
    ]);
    logger_1.logger.info(`Saved glossary to database for video: ${glossary.videoId}`);
}
// Delete glossary from database (for clearing failed generations)
async function deleteGlossary(videoId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const result = await pool.query('DELETE FROM video_glossaries WHERE video_id = $1', [videoId]);
    if (result.rowCount && result.rowCount > 0) {
        logger_1.logger.info(`Deleted glossary from database for video: ${videoId}`);
        return true;
    }
    return false;
}
// Quiz Repository functions
async function getQuizByVideoId(videoId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `SELECT * FROM video_quizzes WHERE video_id = $1`;
    const result = await pool.query(query, [videoId]);
    if (result.rows.length === 0)
        return null;
    const row = result.rows[0];
    return {
        videoId: row.video_id,
        questions: row.questions || [],
        totalQuestions: row.total_questions,
        categories: row.categories || [],
        generationTimeMs: row.generation_time_ms,
        createdAt: row.created_at
    };
}
async function saveQuiz(quiz) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `
    INSERT INTO video_quizzes (
      video_id, questions, total_questions, categories, generation_time_ms
    ) VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (video_id) DO UPDATE SET
      questions = EXCLUDED.questions,
      total_questions = EXCLUDED.total_questions,
      categories = EXCLUDED.categories,
      generation_time_ms = EXCLUDED.generation_time_ms,
      updated_at = CURRENT_TIMESTAMP
  `;
    await pool.query(query, [
        quiz.videoId,
        JSON.stringify(quiz.questions),
        quiz.totalQuestions,
        JSON.stringify(quiz.categories),
        quiz.generationTimeMs || null
    ]);
    logger_1.logger.info(`Saved quiz to database for video: ${quiz.videoId}`);
}
// Get chat history for a user-video combination (last 10 messages = 5 pairs)
async function getChatHistory(userId, videoId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `
    SELECT id, user_id, video_id, message_type, content, video_time, created_at
    FROM chat_history
    WHERE user_id = $1 AND video_id = $2
    ORDER BY created_at ASC
    LIMIT 10
  `;
    const result = await pool.query(query, [userId, videoId]);
    return result.rows.map(row => ({
        id: row.id,
        userId: row.user_id,
        videoId: row.video_id,
        messageType: row.message_type,
        content: row.content,
        videoTime: row.video_time || 0,
        createdAt: row.created_at
    }));
}
// Save a chat message
async function saveChatMessage(userId, videoId, messageType, content, videoTime = 0) {
    const pool = (0, postgres_1.getPostgresPool)();
    const query = `
    INSERT INTO chat_history (user_id, video_id, message_type, content, video_time)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, user_id, video_id, message_type, content, video_time, created_at
  `;
    const result = await pool.query(query, [userId, videoId, messageType, content, videoTime]);
    const row = result.rows[0];
    return {
        id: row.id,
        userId: row.user_id,
        videoId: row.video_id,
        messageType: row.message_type,
        content: row.content,
        videoTime: row.video_time || 0,
        createdAt: row.created_at
    };
}
// Clear chat history for a user-video combination
async function clearChatHistory(userId, videoId) {
    const pool = (0, postgres_1.getPostgresPool)();
    const result = await pool.query('DELETE FROM chat_history WHERE user_id = $1 AND video_id = $2', [userId, videoId]);
    const deletedCount = result.rowCount || 0;
    logger_1.logger.info(`Cleared ${deletedCount} chat messages for user ${userId}, video ${videoId}`);
    return deletedCount;
}
//# sourceMappingURL=videoRepository.js.map