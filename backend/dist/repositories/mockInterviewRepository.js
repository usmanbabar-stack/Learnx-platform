"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockInterviewRepository = exports.MockInterviewRepository = void 0;
const postgres_1 = require("../config/postgres");
const logger_1 = require("../utils/logger");
class MockInterviewRepository {
    constructor() {
        this.pool = (0, postgres_1.getPostgresPool)();
    }
    async createSession(session) {
        const query = `
      INSERT INTO mock_interview_sessions (session_id, user_id, field, difficulty, questions, total_questions)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING session_id, user_id, field, difficulty, questions, total_questions, created_at, completed_at, overall_score
    `;
        const values = [
            session.sessionId,
            session.userId,
            session.field,
            session.difficulty,
            JSON.stringify(session.questions),
            session.totalQuestions,
        ];
        try {
            const result = await this.pool.query(query, values);
            logger_1.logger.info(`Created mock interview session: ${session.sessionId}`);
            return this.mapRowToSession(result.rows[0]);
        }
        catch (error) {
            logger_1.logger.error('Error creating mock interview session:', error);
            throw error;
        }
    }
    async getSessionById(sessionId) {
        const query = `
      SELECT session_id, user_id, field, difficulty, questions, total_questions, 
             created_at, completed_at, overall_score
      FROM mock_interview_sessions
      WHERE session_id = $1
    `;
        try {
            const result = await this.pool.query(query, [sessionId]);
            if (result.rows.length === 0)
                return null;
            return this.mapRowToSession(result.rows[0]);
        }
        catch (error) {
            logger_1.logger.error('Error getting mock interview session:', error);
            throw error;
        }
    }
    async getUserSessions(userId, limit = 10) {
        const query = `
      SELECT session_id, user_id, field, difficulty, questions, total_questions, 
             created_at, completed_at, overall_score
      FROM mock_interview_sessions
      WHERE user_id = $1
      ORDER BY created_at DESC
      LIMIT $2
    `;
        try {
            const result = await this.pool.query(query, [userId, limit]);
            return result.rows.map(row => this.mapRowToSession(row));
        }
        catch (error) {
            logger_1.logger.error('Error getting user sessions:', error);
            throw error;
        }
    }
    async saveResponse(response) {
        const query = `
      INSERT INTO mock_interview_responses (session_id, question_id, question_text, user_answer, feedback, score)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, session_id, question_id, question_text, user_answer, feedback, score, answered_at
    `;
        const values = [
            response.sessionId,
            response.questionId,
            response.questionText,
            response.userAnswer,
            JSON.stringify(response.feedback),
            response.score,
        ];
        try {
            const result = await this.pool.query(query, values);
            logger_1.logger.info(`Saved response for question ${response.questionId} in session ${response.sessionId}`);
            return this.mapRowToResponse(result.rows[0]);
        }
        catch (error) {
            logger_1.logger.error('Error saving mock interview response:', error);
            throw error;
        }
    }
    async getSessionResponses(sessionId) {
        const query = `
      SELECT id, session_id, question_id, question_text, user_answer, feedback, score, answered_at
      FROM mock_interview_responses
      WHERE session_id = $1
      ORDER BY answered_at ASC
    `;
        try {
            const result = await this.pool.query(query, [sessionId]);
            return result.rows.map(row => this.mapRowToResponse(row));
        }
        catch (error) {
            logger_1.logger.error('Error getting session responses:', error);
            throw error;
        }
    }
    async completeSession(sessionId, overallScore) {
        const query = `
      UPDATE mock_interview_sessions
      SET completed_at = CURRENT_TIMESTAMP, overall_score = $2
      WHERE session_id = $1
    `;
        try {
            await this.pool.query(query, [sessionId, overallScore]);
            logger_1.logger.info(`Completed session ${sessionId} with score ${overallScore}`);
        }
        catch (error) {
            logger_1.logger.error('Error completing mock interview session:', error);
            throw error;
        }
    }
    async getUserStats(userId) {
        const statsQuery = `
      SELECT 
        COUNT(DISTINCT s.session_id) as total_sessions,
        ROUND(AVG(s.overall_score), 1) as average_score,
        COUNT(r.id) as total_questions_answered
      FROM mock_interview_sessions s
      LEFT JOIN mock_interview_responses r ON s.session_id = r.session_id
      WHERE s.user_id = $1 AND s.completed_at IS NOT NULL
    `;
        const fieldQuery = `
      SELECT field, COUNT(*) as count
      FROM mock_interview_sessions
      WHERE user_id = $1
      GROUP BY field
      ORDER BY count DESC
      LIMIT 5
    `;
        try {
            const [statsResult, fieldResult] = await Promise.all([
                this.pool.query(statsQuery, [userId]),
                this.pool.query(fieldQuery, [userId]),
            ]);
            return {
                totalSessions: parseInt(statsResult.rows[0]?.total_sessions || '0'),
                averageScore: parseFloat(statsResult.rows[0]?.average_score || '0'),
                totalQuestionsAnswered: parseInt(statsResult.rows[0]?.total_questions_answered || '0'),
                fieldDistribution: fieldResult.rows.map(row => ({
                    field: row.field,
                    count: parseInt(row.count),
                })),
            };
        }
        catch (error) {
            logger_1.logger.error('Error getting user stats:', error);
            throw error;
        }
    }
    mapRowToSession(row) {
        return {
            sessionId: row.session_id,
            userId: row.user_id,
            field: row.field,
            difficulty: row.difficulty,
            questions: typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions,
            totalQuestions: row.total_questions,
            createdAt: row.created_at,
            completedAt: row.completed_at,
            overallScore: row.overall_score,
        };
    }
    mapRowToResponse(row) {
        return {
            id: row.id,
            sessionId: row.session_id,
            questionId: row.question_id,
            questionText: row.question_text,
            userAnswer: row.user_answer,
            feedback: typeof row.feedback === 'string' ? JSON.parse(row.feedback) : row.feedback,
            score: row.score,
            answeredAt: row.answered_at,
        };
    }
}
exports.MockInterviewRepository = MockInterviewRepository;
exports.mockInterviewRepository = new MockInterviewRepository();
//# sourceMappingURL=mockInterviewRepository.js.map