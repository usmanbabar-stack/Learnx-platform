import { Request, Response } from 'express';
import { getPostgresPool } from '../config/postgres';
import { pastPaperAnalysisService } from '../services/pastPaperAnalysisService';
import { logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';
import multer from 'multer';

const UPLOADS_DIR = path.join(__dirname, '../../uploads/past-papers');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
      cb(null, UPLOADS_DIR);
    } catch (error) {
      cb(error as Error, UPLOADS_DIR);
    }
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, `paper-${uniqueSuffix}${ext}`);
  }
});

const fileFilter = (req: any, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'text/plain',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only PDF, images (JPG/PNG), TXT, and DOCX files are allowed.'));
  }
};

export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  }
});

export class PastPaperController {
  /**
   * Create a new analysis session and upload papers
   */
  async createSession(req: Request, res: Response): Promise<void> {
    const pool = getPostgresPool();
    
    try {
      const userId = (req as any).userId;
      const files = req.files as Express.Multer.File[];
      const { session_name } = req.body;

      if (!files || files.length < 2) {
        res.status(400).json({
          success: false,
          message: 'Please upload at least 2 past papers'
        });
        return;
      }

      if (files.length > 10) {
        res.status(400).json({
          success: false,
          message: 'Maximum 10 papers can be uploaded at once'
        });
        return;
      }

      logger.info(`Creating past paper analysis session for user ${userId} with ${files.length} papers`);

      // Create analysis session
      const sessionResult = await pool.query(
        `INSERT INTO paper_analysis_sessions 
         (student_id, session_name, total_papers, total_questions, status)
         VALUES ($1, $2, $3, 0, 'processing')
         RETURNING id`,
        [userId, session_name || `Analysis ${new Date().toLocaleDateString()}`, files.length]
      );

      const sessionId = sessionResult.rows[0].id;

      // Save uploaded papers
      const paperIds: number[] = [];
      
      for (const file of files) {
        const fileType = this.getFileType(file.mimetype);
        
        const paperResult = await pool.query(
          `INSERT INTO past_papers 
           (student_id, filename, file_path, file_type, file_size, processing_status)
           VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING id`,
          [userId, file.originalname, file.path, fileType, file.size]
        );

        const paperId = paperResult.rows[0].id;
        paperIds.push(paperId);

        // Link paper to session
        await pool.query(
          'INSERT INTO session_papers (session_id, paper_id) VALUES ($1, $2)',
          [sessionId, paperId]
        );
      }

      // Process papers asynchronously
      this.processPapersAsync(sessionId, paperIds).catch(error => {
        logger.error(`Async processing failed for session ${sessionId}:`, error);
      });

      res.status(202).json({
        success: true,
        message: 'Papers uploaded successfully. Analysis in progress.',
        data: {
          sessionId,
          totalPapers: files.length,
          status: 'processing'
        }
      });
    } catch (error: any) {
      logger.error('Create session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to upload papers',
        error: error.message
      });
    }
  }

  /**
   * Get file type from MIME type
   */
  private getFileType(mimeType: string): string {
    if (mimeType === 'application/pdf') return 'pdf';
    if (mimeType.startsWith('image/')) return 'image';
    if (mimeType === 'text/plain') return 'text';
    if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return 'docx';
    return 'other';
  }

  /**
   * Process papers asynchronously
   */
  private async processPapersAsync(sessionId: number, paperIds: number[]): Promise<void> {
    const pool = getPostgresPool();
    
    try {
      logger.info(`Starting async processing of ${paperIds.length} papers for session ${sessionId}`);

      // Process each paper
      for (const paperId of paperIds) {
        try {
          await pastPaperAnalysisService.processPaper(paperId);
        } catch (error) {
          logger.error(`Failed to process paper ${paperId}:`, error);
          // Continue with other papers even if one fails
        }
      }

      // Get total questions extracted
      const questionsResult = await pool.query(
        `SELECT COUNT(*) as total
         FROM extracted_questions eq
         JOIN session_papers sp ON eq.paper_id = sp.paper_id
         WHERE sp.session_id = $1`,
        [sessionId]
      );

      const totalQuestions = parseInt(questionsResult.rows[0].total);

      // Analyze patterns
      const analysis = await pastPaperAnalysisService.analyzePatterns(sessionId);

      // Generate practice set
      const practiceQuestions = await pastPaperAnalysisService.generatePracticeSet(sessionId, 20);

      // Update session with analysis results
      await pool.query(
        `UPDATE paper_analysis_sessions SET
         total_questions = $1,
         topic_frequency = $2,
         difficulty_distribution = $3,
         question_type_distribution = $4,
         bloom_distribution = $5,
         patterns = $6,
         recommendations = $7,
         weak_areas = $8,
         strong_areas = $9,
         practice_questions = $10,
         status = 'completed'
         WHERE id = $11`,
        [
          totalQuestions,
          JSON.stringify(analysis.topic_frequency),
          JSON.stringify(analysis.difficulty_distribution),
          JSON.stringify(analysis.question_type_distribution),
          JSON.stringify(analysis.bloom_distribution),
          JSON.stringify(analysis.patterns),
          JSON.stringify(analysis.recommendations),
          JSON.stringify(analysis.weak_areas),
          JSON.stringify(analysis.strong_areas),
          JSON.stringify(practiceQuestions),
          sessionId
        ]
      );

      logger.info(`Session ${sessionId} processing completed successfully`);
    } catch (error) {
      logger.error(`Session ${sessionId} processing failed:`, error);
      await pool.query(
        'UPDATE paper_analysis_sessions SET status = $1 WHERE id = $2',
        ['failed', sessionId]
      );
    }
  }

  /**
   * Get all sessions for a student
   */
  async getSessions(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const pool = getPostgresPool();

      const result = await pool.query(
        `SELECT 
          pas.*,
          COUNT(DISTINCT sp.paper_id) as paper_count
         FROM paper_analysis_sessions pas
         LEFT JOIN session_papers sp ON pas.id = sp.session_id
         WHERE pas.student_id = $1
         GROUP BY pas.id
         ORDER BY pas.analysis_date DESC`,
        [userId]
      );

      res.json({
        success: true,
        data: result.rows
      });
    } catch (error: any) {
      logger.error('Get sessions error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch sessions',
        error: error.message
      });
    }
  }

  /**
   * Get session details with full analysis
   */
  async getSessionDetails(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { sessionId } = req.params;
      const pool = getPostgresPool();

      // Get session
      const sessionResult = await pool.query(
        'SELECT * FROM paper_analysis_sessions WHERE id = $1 AND student_id = $2',
        [sessionId, userId]
      );

      if (sessionResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Session not found'
        });
        return;
      }

      const session = sessionResult.rows[0];

      // Get papers in this session
      const papersResult = await pool.query(
        `SELECT pp.*
         FROM past_papers pp
         JOIN session_papers sp ON pp.id = sp.paper_id
         WHERE sp.session_id = $1`,
        [sessionId]
      );

      // Get sample questions (limit to 50 for performance)
      const questionsResult = await pool.query(
        `SELECT eq.*
         FROM extracted_questions eq
         JOIN session_papers sp ON eq.paper_id = sp.paper_id
         WHERE sp.session_id = $1
         ORDER BY eq.id
         LIMIT 50`,
        [sessionId]
      );

      res.json({
        success: true,
        data: {
          session,
          papers: papersResult.rows,
          sampleQuestions: questionsResult.rows
        }
      });
    } catch (error: any) {
      logger.error('Get session details error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch session details',
        error: error.message
      });
    }
  }

  /**
   * Delete a session and its papers
   */
  async deleteSession(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const { sessionId } = req.params;
      const pool = getPostgresPool();

      // Verify ownership
      const sessionResult = await pool.query(
        'SELECT * FROM paper_analysis_sessions WHERE id = $1 AND student_id = $2',
        [sessionId, userId]
      );

      if (sessionResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Session not found'
        });
        return;
      }

      // Get paper files to delete
      const papersResult = await pool.query(
        `SELECT pp.file_path
         FROM past_papers pp
         JOIN session_papers sp ON pp.id = sp.paper_id
         WHERE sp.session_id = $1`,
        [sessionId]
      );

      // Delete physical files
      for (const paper of papersResult.rows) {
        try {
          await fs.unlink(paper.file_path);
        } catch (error) {
          logger.warn(`Failed to delete file ${paper.file_path}:`, error);
        }
      }

      // Delete session (cascade will delete related records)
      await pool.query(
        'DELETE FROM paper_analysis_sessions WHERE id = $1',
        [sessionId]
      );

      res.json({
        success: true,
        message: 'Session deleted successfully'
      });
    } catch (error: any) {
      logger.error('Delete session error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete session',
        error: error.message
      });
    }
  }

  /**
   * Get statistics for student
   */
  async getStatistics(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).userId;
      const pool = getPostgresPool();

      const result = await pool.query(
        'SELECT * FROM student_paper_stats WHERE student_id = $1',
        [userId]
      );

      res.json({
        success: true,
        data: result.rows[0] || {
          total_papers_uploaded: 0,
          completed_papers: 0,
          total_questions_extracted: 0,
          total_analysis_sessions: 0
        }
      });
    } catch (error: any) {
      logger.error('Get statistics error:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics',
        error: error.message
      });
    }
  }
}

export const pastPaperController = new PastPaperController();
