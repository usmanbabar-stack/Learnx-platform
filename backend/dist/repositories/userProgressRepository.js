"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userProgressRepository = exports.UserProgressRepository = void 0;
const postgres_1 = require("../config/postgres");
const logger_1 = require("../utils/logger");
class UserProgressRepository {
    constructor() {
        this.pool = (0, postgres_1.getPostgresPool)();
    }
    /**
     * Get progress for a specific video (for resume functionality)
     */
    async getProgress(userId, videoId) {
        try {
            const query = `
        SELECT id, user_id as "userId", video_id as "videoId", 
               progress_time as "progressTime", total_duration as "totalDuration",
               completed, last_watched as "lastWatched"
        FROM user_progress
        WHERE user_id = $1 AND video_id = $2
      `;
            const result = await this.pool.query(query, [userId, videoId]);
            return result.rows[0] || null;
        }
        catch (error) {
            logger_1.logger.error(`Failed to get progress for user ${userId}, video ${videoId}:`, error);
            return null;
        }
    }
    /**
     * Get all in-progress (not completed) videos for resume functionality
     */
    async getInProgressVideos(userId, limit = 10) {
        try {
            // First try with video join, fallback to progress-only if videos table doesn't have all
            const query = `
        SELECT up.id, up.user_id as "userId", up.video_id as "videoId", 
               up.progress_time as "progressTime", up.total_duration as "totalDuration",
               up.completed, up.last_watched as "lastWatched",
               COALESCE(v.title, up.video_title, 'Video') as title,
               COALESCE(v.thumbnail, up.video_thumbnail, CONCAT('https://img.youtube.com/vi/', up.video_id, '/mqdefault.jpg')) as thumbnail,
               COALESCE(v.channel, up.video_channel, 'YouTube') as channel,
               v.duration as "videoDuration", v.subject
        FROM user_progress up
        LEFT JOIN videos v ON up.video_id = v.video_id
        WHERE up.user_id = $1 
          AND up.completed = false 
          AND up.progress_time > 10
        ORDER BY up.last_watched DESC
        LIMIT $2
      `;
            const result = await this.pool.query(query, [userId, limit]);
            return result.rows;
        }
        catch (error) {
            logger_1.logger.error(`Failed to get in-progress videos for user ${userId}:`, error);
            return [];
        }
    }
    /**
     * Get recently watched videos (for dashboard)
     */
    async getRecentlyWatched(userId, limit = 10) {
        try {
            const query = `
        SELECT up.id, up.user_id as "userId", up.video_id as "videoId", 
               up.progress_time as "progressTime", up.total_duration as "totalDuration",
               up.completed, up.last_watched as "lastWatched",
               COALESCE(v.title, up.video_title, 'Video') as title,
               COALESCE(v.thumbnail, up.video_thumbnail, CONCAT('https://img.youtube.com/vi/', up.video_id, '/mqdefault.jpg')) as thumbnail,
               COALESCE(v.channel, up.video_channel, 'YouTube') as channel,
               v.duration as "videoDuration", v.subject
        FROM user_progress up
        LEFT JOIN videos v ON up.video_id = v.video_id
        WHERE up.user_id = $1
        ORDER BY up.last_watched DESC
        LIMIT $2
      `;
            const result = await this.pool.query(query, [userId, limit]);
            return result.rows;
        }
        catch (error) {
            logger_1.logger.error(`Failed to get recently watched for user ${userId}:`, error);
            return [];
        }
    }
    /**
     * Get completed videos (for achievements)
     */
    async getCompletedVideos(userId, limit = 50) {
        try {
            const query = `
        SELECT up.id, up.user_id as "userId", up.video_id as "videoId", 
               up.progress_time as "progressTime", up.total_duration as "totalDuration",
               up.completed, up.last_watched as "lastWatched",
               v.title, v.thumbnail, v.channel, v.duration as "videoDuration", v.subject
        FROM user_progress up
        LEFT JOIN videos v ON up.video_id = v.video_id
        WHERE up.user_id = $1 AND up.completed = true
        ORDER BY up.last_watched DESC
        LIMIT $2
      `;
            const result = await this.pool.query(query, [userId, limit]);
            return result.rows;
        }
        catch (error) {
            logger_1.logger.error(`Failed to get completed videos for user ${userId}:`, error);
            return [];
        }
    }
    async getDashboardStats(userId) {
        try {
            // Calculate total hours watched (sum of progress time)
            const hoursQuery = `
        SELECT COALESCE(SUM(progress_time), 0) / 3600.0 as total_hours
        FROM user_progress
        WHERE user_id = $1
      `;
            const hoursResult = await this.pool.query(hoursQuery, [userId]);
            const totalHours = parseFloat(hoursResult.rows[0]?.total_hours || '0');
            // Count completed videos
            const videosQuery = `
        SELECT COUNT(*) as count
        FROM user_progress
        WHERE user_id = $1 AND completed = true
      `;
            const videosResult = await this.pool.query(videosQuery, [userId]);
            const videosWatched = parseInt(videosResult.rows[0]?.count || '0');
            // Calculate current streak (consecutive days with watch activity)
            let currentStreak = 0;
            try {
                const streakQuery = `
          WITH daily_activity AS (
            SELECT DISTINCT DATE(last_watched) as watch_date
            FROM user_progress
            WHERE user_id = $1 AND progress_time > 0
            ORDER BY watch_date DESC
          ),
          ranked_dates AS (
            SELECT 
              watch_date,
              watch_date - (ROW_NUMBER() OVER (ORDER BY watch_date DESC))::int as group_date
            FROM daily_activity
          )
          SELECT COUNT(*) as streak
          FROM ranked_dates
          WHERE group_date = (
            SELECT group_date 
            FROM ranked_dates 
            WHERE watch_date >= CURRENT_DATE - 1
            ORDER BY watch_date DESC
            LIMIT 1
          )
        `;
                const streakResult = await this.pool.query(streakQuery, [userId]);
                currentStreak = parseInt(streakResult.rows[0]?.streak || '0');
            }
            catch (streakError) {
                logger_1.logger.warn('Streak calculation failed:', streakError);
            }
            // Calculate XP (10 XP per minute watched + 100 XP per completed video)
            const totalMinutes = totalHours * 60;
            const experiencePoints = Math.floor(totalMinutes * 10) + (videosWatched * 100);
            return {
                totalHours: Math.round(totalHours * 10) / 10, // Round to 1 decimal
                videosWatched,
                currentStreak,
                experiencePoints
            };
        }
        catch (error) {
            logger_1.logger.error('Failed to get dashboard stats:', error);
            return {
                totalHours: 0,
                videosWatched: 0,
                currentStreak: 0,
                experiencePoints: 0
            };
        }
    }
    async updateProgress(userId, videoId, progressTime, totalDuration, completed = false, videoTitle, videoThumbnail, videoChannel) {
        // Auto-mark as completed if progress >= 90%
        const isCompleted = completed || (totalDuration > 0 && progressTime >= totalDuration * 0.9);
        // Use UPSERT that works even without video in videos table
        const query = `
      INSERT INTO user_progress (user_id, video_id, progress_time, total_duration, completed, last_watched, video_title, video_thumbnail, video_channel)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, $6, $7, $8)
      ON CONFLICT (user_id, video_id)
      DO UPDATE SET
        progress_time = GREATEST(user_progress.progress_time, EXCLUDED.progress_time),
        total_duration = CASE WHEN EXCLUDED.total_duration > 0 THEN EXCLUDED.total_duration ELSE user_progress.total_duration END,
        completed = user_progress.completed OR EXCLUDED.completed,
        last_watched = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP,
        video_title = COALESCE(EXCLUDED.video_title, user_progress.video_title),
        video_thumbnail = COALESCE(EXCLUDED.video_thumbnail, user_progress.video_thumbnail),
        video_channel = COALESCE(EXCLUDED.video_channel, user_progress.video_channel)
      RETURNING id, user_id as "userId", video_id as "videoId", 
                progress_time as "progressTime", total_duration as "totalDuration",
                completed, last_watched as "lastWatched",
                video_title as "title", video_thumbnail as "thumbnail", video_channel as "channel"
    `;
        try {
            const result = await this.pool.query(query, [
                userId, videoId, progressTime, totalDuration, isCompleted,
                videoTitle || null, videoThumbnail || null, videoChannel || null
            ]);
            logger_1.logger.info(`Updated progress for user ${userId}, video ${videoId}: ${progressTime}s / ${totalDuration}s`);
            return result.rows[0];
        }
        catch (error) {
            // If foreign key error, log but don't fail - the migration will fix this
            if (error.code === '23503') {
                logger_1.logger.warn(`FK constraint on progress update - run migration 002 to fix`);
                // Try simpler insert without video metadata
                const simpleQuery = `
          INSERT INTO user_progress (user_id, video_id, progress_time, total_duration, completed, last_watched)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
          ON CONFLICT (user_id, video_id)
          DO UPDATE SET
            progress_time = GREATEST(user_progress.progress_time, EXCLUDED.progress_time),
            total_duration = CASE WHEN EXCLUDED.total_duration > 0 THEN EXCLUDED.total_duration ELSE user_progress.total_duration END,
            completed = user_progress.completed OR EXCLUDED.completed,
            last_watched = CURRENT_TIMESTAMP
          RETURNING id, user_id as "userId", video_id as "videoId", 
                    progress_time as "progressTime", total_duration as "totalDuration",
                    completed, last_watched as "lastWatched"
        `;
                const result = await this.pool.query(simpleQuery, [userId, videoId, progressTime, totalDuration, isCompleted]);
                return result.rows[0];
            }
            throw error;
        }
    }
    async recordWatchHistory(userId, videoId, duration, action) {
        try {
            const query = `
        INSERT INTO watch_history (user_id, video_id, duration, action)
        VALUES ($1, $2, $3, $4)
      `;
            await this.pool.query(query, [userId, videoId, duration, action]);
        }
        catch (error) {
            logger_1.logger.warn('Failed to record watch history (non-critical):', error);
        }
    }
    /**
     * Get weekly learning stats (hours per day for past 7 days)
     */
    async getWeeklyStats(userId) {
        try {
            const query = `
        WITH date_series AS (
          SELECT generate_series(
            CURRENT_DATE - INTERVAL '6 days',
            CURRENT_DATE,
            '1 day'::interval
          )::date AS date
        ),
        daily_hours AS (
          SELECT 
            DATE(last_watched) as watch_date,
            SUM(progress_time) / 3600.0 as hours
          FROM user_progress
          WHERE user_id = $1 
            AND last_watched >= CURRENT_DATE - INTERVAL '6 days'
          GROUP BY DATE(last_watched)
        )
        SELECT 
          TO_CHAR(ds.date, 'Dy') as day,
          ds.date::text as date,
          COALESCE(dh.hours, 0) as hours
        FROM date_series ds
        LEFT JOIN daily_hours dh ON ds.date = dh.watch_date
        ORDER BY ds.date ASC
      `;
            const result = await this.pool.query(query, [userId]);
            return result.rows.map(row => ({
                day: row.day,
                date: row.date,
                hours: parseFloat(row.hours) || 0
            }));
        }
        catch (error) {
            logger_1.logger.error(`Failed to get weekly stats for user ${userId}:`, error);
            // Return empty week with zeros
            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
            const today = new Date();
            return days.map((day, i) => {
                const d = new Date(today);
                d.setDate(d.getDate() - (6 - i));
                return { day, date: d.toISOString().split('T')[0], hours: 0 };
            });
        }
    }
    /**
     * Get learning patterns (hours watched by time of day)
     */
    async getLearningPatterns(userId) {
        try {
            // This requires watch_history table with timestamps
            // For now, calculate from last_watched distribution
            const query = `
        SELECT 
          EXTRACT(HOUR FROM last_watched) as hour,
          COUNT(*) as watch_count,
          SUM(progress_time) / 60.0 as total_minutes
        FROM user_progress
        WHERE user_id = $1 AND progress_time > 0
        GROUP BY EXTRACT(HOUR FROM last_watched)
        ORDER BY hour
      `;
            const result = await this.pool.query(query, [userId]);
            // Create 24-hour distribution, group into 6 time slots
            const hourlyData = new Map();
            result.rows.forEach(row => {
                hourlyData.set(parseInt(row.hour), parseFloat(row.total_minutes) || 0);
            });
            const timeSlots = [
                { hour: '6 AM', range: [5, 8] },
                { hour: '9 AM', range: [9, 11] },
                { hour: '12 PM', range: [12, 14] },
                { hour: '3 PM', range: [15, 17] },
                { hour: '6 PM', range: [18, 20] },
                { hour: '9 PM', range: [21, 23] },
            ];
            return timeSlots.map(slot => {
                let total = 0;
                for (let h = slot.range[0]; h <= slot.range[1]; h++) {
                    total += hourlyData.get(h) || 0;
                }
                return { hour: slot.hour, avgMinutes: Math.round(total) };
            });
        }
        catch (error) {
            logger_1.logger.error(`Failed to get learning patterns for user ${userId}:`, error);
            return [
                { hour: '6 AM', avgMinutes: 0 },
                { hour: '9 AM', avgMinutes: 0 },
                { hour: '12 PM', avgMinutes: 0 },
                { hour: '3 PM', avgMinutes: 0 },
                { hour: '6 PM', avgMinutes: 0 },
                { hour: '9 PM', avgMinutes: 0 },
            ];
        }
    }
    /**
     * Mark video as completed manually
     */
    async markCompleted(userId, videoId) {
        try {
            const query = `
        UPDATE user_progress
        SET completed = true, updated_at = CURRENT_TIMESTAMP
        WHERE user_id = $1 AND video_id = $2
      `;
            await this.pool.query(query, [userId, videoId]);
            await this.recordWatchHistory(userId, videoId, 0, 'complete');
            logger_1.logger.info(`Marked video ${videoId} as completed for user ${userId}`);
        }
        catch (error) {
            logger_1.logger.error('Failed to mark video as completed:', error);
            throw error;
        }
    }
}
exports.UserProgressRepository = UserProgressRepository;
exports.userProgressRepository = new UserProgressRepository();
//# sourceMappingURL=userProgressRepository.js.map