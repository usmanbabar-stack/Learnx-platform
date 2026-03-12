import { Pool } from 'pg';
import { getPostgresPool } from '../config/postgres';
import { logger } from '../utils/logger';

export interface MockInterviewSession {
  sessionId: string;
  userId: number;
  field: string;
  difficulty: string;
  questions: any;
  totalQuestions: number;
  createdAt: Date;
  completedAt?: Date;
  overallScore?: number;
}

export interface MockInterviewResponse {
  id: number;
  sessionId: string;
  questionId: string;
  questionText: string;
  userAnswer: string;
  feedback: any;
  score: number;
  answeredAt: Date;
}

export class MockInterviewRepository {
  private pool: Pool;

  constructor() {
    this.pool = getPostgresPool();
  }

  async createSession(session: Omit<MockInterviewSession, 'createdAt' | 'completedAt' | 'overallScore'>): Promise<MockInterviewSession> {
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
      logger.info(`Created mock interview session: ${session.sessionId}`);
      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      logger.error('Error creating mock interview session:', error);
      throw error;
    }
  }

  async getSessionById(sessionId: string): Promise<MockInterviewSession | null> {
    const query = `
      SELECT session_id, user_id, field, difficulty, questions, total_questions, 
             created_at, completed_at, overall_score
      FROM mock_interview_sessions
      WHERE session_id = $1
    `;

    try {
      const result = await this.pool.query(query, [sessionId]);
      if (result.rows.length === 0) return null;
      return this.mapRowToSession(result.rows[0]);
    } catch (error) {
      logger.error('Error getting mock interview session:', error);
      throw error;
    }
  }

  async getUserSessions(userId: number, limit: number = 10): Promise<MockInterviewSession[]> {
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
    } catch (error) {
      logger.error('Error getting user sessions:', error);
      throw error;
    }
  }

  async saveResponse(response: Omit<MockInterviewResponse, 'id' | 'answeredAt'>): Promise<MockInterviewResponse> {
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
      logger.info(`Saved response for question ${response.questionId} in session ${response.sessionId}`);
      return this.mapRowToResponse(result.rows[0]);
    } catch (error) {
      logger.error('Error saving mock interview response:', error);
      throw error;
    }
  }

  async getSessionResponses(sessionId: string): Promise<MockInterviewResponse[]> {
    const query = `
      SELECT id, session_id, question_id, question_text, user_answer, feedback, score, answered_at
      FROM mock_interview_responses
      WHERE session_id = $1
      ORDER BY answered_at ASC
    `;

    try {
      const result = await this.pool.query(query, [sessionId]);
      return result.rows.map(row => this.mapRowToResponse(row));
    } catch (error) {
      logger.error('Error getting session responses:', error);
      throw error;
    }
  }

  async completeSession(sessionId: string, overallScore: number): Promise<void> {
    const query = `
      UPDATE mock_interview_sessions
      SET completed_at = CURRENT_TIMESTAMP, overall_score = $2
      WHERE session_id = $1
    `;

    try {
      await this.pool.query(query, [sessionId, overallScore]);
      logger.info(`Completed session ${sessionId} with score ${overallScore}`);
    } catch (error) {
      logger.error('Error completing mock interview session:', error);
      throw error;
    }
  }

  async getUserStats(userId: number): Promise<{
    totalSessions: number;
    averageScore: number;
    totalQuestionsAnswered: number;
    fieldDistribution: { field: string; count: number }[];
  }> {
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
    } catch (error) {
      logger.error('Error getting user stats:', error);
      throw error;
    }
  }

  private mapRowToSession(row: any): MockInterviewSession {
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

  private mapRowToResponse(row: any): MockInterviewResponse {
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

export const mockInterviewRepository = new MockInterviewRepository();
