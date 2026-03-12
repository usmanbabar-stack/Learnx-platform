import { Response } from 'express';
import { AuthRequest } from '../middleware/authMiddleware';
import { getPostgresPool } from '../config/postgres';
import { lectureUploadService } from '../services/lectureUploadService';
import { logger } from '../utils/logger';

export class TeacherLectureController {
  /**
   * Get all lectures for the authenticated teacher
   * GET /api/teacher/lectures
   */
  async getLectures(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;
      
      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const pool = getPostgresPool();
      
      const query = `
        SELECT 
          l.*,
          COUNT(DISTINCT gn.id) as notes_count,
          COUNT(DISTINCT qb.id) as question_banks_count
        FROM lectures l
        LEFT JOIN generated_notes gn ON l.id = gn.lecture_id
        LEFT JOIN question_banks qb ON l.id = qb.lecture_id
        WHERE l.teacher_id = $1
        GROUP BY l.id
        ORDER BY l.created_at DESC
      `;

      const result = await pool.query(query, [teacherId]);

      res.json({
        success: true,
        data: {
          lectures: result.rows,
          total: result.rows.length
        }
      });
    } catch (error) {
      logger.error('Error fetching lectures:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch lectures'
      });
    }
  }

  /**
   * Get a single lecture with its notes and question banks
   * GET /api/teacher/lectures/:id
   */
  async getLecture(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;
      const lectureId = parseInt(req.params.id);

      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (isNaN(lectureId)) {
        res.status(400).json({ success: false, message: 'Invalid lecture ID' });
        return;
      }

      const pool = getPostgresPool();

      // Get lecture details
      const lectureQuery = 'SELECT * FROM lectures WHERE id = $1 AND teacher_id = $2';
      const lectureResult = await pool.query(lectureQuery, [lectureId, teacherId]);

      if (lectureResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Lecture not found or access denied'
        });
        return;
      }

      // Get associated notes
      const notesQuery = 'SELECT * FROM generated_notes WHERE lecture_id = $1 ORDER BY created_at DESC';
      const notesResult = await pool.query(notesQuery, [lectureId]);

      // Get associated question banks
      const questionsQuery = 'SELECT * FROM question_banks WHERE lecture_id = $1 ORDER BY created_at DESC';
      const questionsResult = await pool.query(questionsQuery, [lectureId]);

      res.json({
        success: true,
        data: {
          lecture: lectureResult.rows[0],
          notes: notesResult.rows,
          questionBanks: questionsResult.rows
        }
      });
    } catch (error) {
      logger.error('Error fetching lecture:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch lecture details'
      });
    }
  }

  /**
   * Update lecture metadata
   * PUT /api/teacher/lectures/:id
   */
  async updateLecture(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;
      const lectureId = parseInt(req.params.id);
      const { title, description, subject, difficulty, visibility } = req.body;

      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (isNaN(lectureId)) {
        res.status(400).json({ success: false, message: 'Invalid lecture ID' });
        return;
      }

      const pool = getPostgresPool();

      // Verify ownership
      const checkQuery = 'SELECT id FROM lectures WHERE id = $1 AND teacher_id = $2';
      const checkResult = await pool.query(checkQuery, [lectureId, teacherId]);

      if (checkResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Lecture not found or access denied'
        });
        return;
      }

      // Update lecture
      const updateQuery = `
        UPDATE lectures 
        SET title = COALESCE($1, title),
            description = COALESCE($2, description),
            subject = COALESCE($3, subject),
            difficulty = COALESCE($4, difficulty),
            visibility = COALESCE($5, visibility),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = $6 AND teacher_id = $7
        RETURNING *
      `;

      const updateResult = await pool.query(updateQuery, [
        title, description, subject, difficulty, visibility,
        lectureId, teacherId
      ]);

      res.json({
        success: true,
        data: {
          lecture: updateResult.rows[0]
        }
      });
    } catch (error) {
      logger.error('Error updating lecture:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update lecture'
      });
    }
  }

  /**
   * Delete a lecture (and cascade to notes/questions)
   * DELETE /api/teacher/lectures/:id
   */
  async deleteLecture(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;
      const lectureId = parseInt(req.params.id);

      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (isNaN(lectureId)) {
        res.status(400).json({ success: false, message: 'Invalid lecture ID' });
        return;
      }

      const pool = getPostgresPool();

      const deleteQuery = 'DELETE FROM lectures WHERE id = $1 AND teacher_id = $2 RETURNING id';
      const result = await pool.query(deleteQuery, [lectureId, teacherId]);

      if (result.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Lecture not found or access denied'
        });
        return;
      }

      logger.info(`Lecture ${lectureId} deleted by teacher ${teacherId}`);

      res.json({
        success: true,
        message: 'Lecture deleted successfully'
      });
    } catch (error) {
      logger.error('Error deleting lecture:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to delete lecture'
      });
    }
  }

  /**
   * Get teacher statistics
   * GET /api/teacher/stats
   */
  async getStats(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;

      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      const pool = getPostgresPool();

      const statsQuery = `
        SELECT 
          COUNT(DISTINCT l.id) as total_lectures,
          COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'completed') as completed_lectures,
          COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'processing') as processing_lectures,
          COUNT(DISTINCT l.id) FILTER (WHERE l.status = 'failed') as failed_lectures,
          SUM(l.view_count) as total_views,
          COUNT(DISTINCT gn.id) as total_notes,
          COUNT(DISTINCT qb.id) as total_question_banks
        FROM lectures l
        LEFT JOIN generated_notes gn ON l.id = gn.lecture_id
        LEFT JOIN question_banks qb ON l.id = qb.lecture_id
        WHERE l.teacher_id = $1
      `;

      const result = await pool.query(statsQuery, [teacherId]);

      res.json({
        success: true,
        data: {
          stats: result.rows[0]
        }
      });
    } catch (error) {
      logger.error('Error fetching teacher stats:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch statistics'
      });
    }
  }

  /**
   * Upload lecture file and process it
   * POST /api/teacher/lectures/upload
   */
  async uploadLecture(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;

      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      // Check if file was uploaded
      if (!req.file) {
        res.status(400).json({
          success: false,
          message: 'No file uploaded. Please provide a video or audio file.'
        });
        return;
      }

      // Extract lecture data from request body
      const { title, description, subject, difficulty, visibility, language, fileType } = req.body;

      if (!title || title.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: 'Lecture title is required'
        });
        return;
      }

      logger.info(
        `Processing lecture upload for teacher ${teacherId}: ` +
        `${req.file.originalname} (${(req.file.size / (1024 * 1024)).toFixed(2)} MB) ` +
        `- Type: ${fileType || 'auto'}`
      );

      // Process lecture asynchronously (transcription + AI generation)
      // We'll return immediately and let it process in the background
      const result = await lectureUploadService.processLecture(req.file, {
        teacherId,
        title,
        description,
        subject,
        difficulty,
        visibility,
        language,
        fileType: fileType as 'audio' | 'video' | 'document'
      });

      res.status(201).json({
        success: true,
        message: 'Lecture uploaded and processed successfully',
        data: {
          lectureId: result.lectureId,
          transcriptWordCount: result.transcriptWordCount,
          duration: result.duration,
          notesGenerated: result.notesGenerated,
          questionsGenerated: result.questionsGenerated
        }
      });
    } catch (error: any) {
      logger.error('Error uploading lecture:', error);
      
      // Clean up uploaded file if processing failed
      if (req.file?.path) {
        await lectureUploadService.deleteLectureFile(req.file.path);
      }

      res.status(500).json({
        success: false,
        message: error.message || 'Failed to upload and process lecture'
      });
    }
  }

  /**
   * Download notes for a lecture
   * GET /api/teacher/lectures/:id/notes/download
   */
  async downloadNotes(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;
      const lectureId = parseInt(req.params.id);
      const summaryType = req.query.type as string || 'detailed';

      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (isNaN(lectureId)) {
        res.status(400).json({ success: false, message: 'Invalid lecture ID' });
        return;
      }

      const pool = getPostgresPool();

      // Verify ownership
      const checkQuery = 'SELECT title FROM lectures WHERE id = $1 AND teacher_id = $2';
      const checkResult = await pool.query(checkQuery, [lectureId, teacherId]);

      if (checkResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Lecture not found or access denied'
        });
        return;
      }

      const lectureTitle = checkResult.rows[0].title;

      // Get notes
      const notesQuery = 'SELECT content FROM generated_notes WHERE lecture_id = $1 AND summary_type = $2';
      const notesResult = await pool.query(notesQuery, [lectureId, summaryType]);

      if (notesResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: `No ${summaryType} notes found for this lecture`
        });
        return;
      }

      const content = notesResult.rows[0].content;
      
      // Set headers for file download
      const filename = `${lectureTitle.replace(/[^a-z0-9]/gi, '_')}_${summaryType}_notes.md`;
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);

      logger.info(`Downloaded ${summaryType} notes for lecture ${lectureId} by teacher ${teacherId}`);
    } catch (error) {
      logger.error('Error downloading notes:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to download notes'
      });
    }
  }

  /**
   * Download question bank for a lecture
   * GET /api/teacher/lectures/:id/questions/download
   */
  async downloadQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
      const teacherId = req.userId;
      const lectureId = parseInt(req.params.id);

      if (!teacherId) {
        res.status(401).json({ success: false, message: 'Unauthorized' });
        return;
      }

      if (isNaN(lectureId)) {
        res.status(400).json({ success: false, message: 'Invalid lecture ID' });
        return;
      }

      const pool = getPostgresPool();

      // Verify ownership
      const checkQuery = 'SELECT title FROM lectures WHERE id = $1 AND teacher_id = $2';
      const checkResult = await pool.query(checkQuery, [lectureId, teacherId]);

      if (checkResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Lecture not found or access denied'
        });
        return;
      }

      const lectureTitle = checkResult.rows[0].title;

      // Get question bank
      const questionsQuery = 'SELECT questions FROM question_banks WHERE lecture_id = $1 LIMIT 1';
      const questionsResult = await pool.query(questionsQuery, [lectureId]);

      if (questionsResult.rows.length === 0) {
        res.status(404).json({
          success: false,
          message: 'No questions found for this lecture'
        });
        return;
      }

      const questions = questionsResult.rows[0].questions;
      
      // Format questions as markdown
      let content = `# Question Bank: ${lectureTitle}\n\n`;
      content += `**Total Questions:** ${questions.length}\n\n`;
      content += `---\n\n`;

      questions.forEach((q: any, idx: number) => {
        content += `## Question ${idx + 1}\n\n`;
        content += `**${q.question}**\n\n`;
        
        if (q.options && q.options.length > 0) {
          content += `Options:\n`;
          q.options.forEach((opt: string, optIdx: number) => {
            content += `- ${String.fromCharCode(65 + optIdx)}) ${opt}\n`;
          });
          content += `\n`;
        }

        content += `**Correct Answer:** ${q.correctAnswer}\n\n`;
        
        if (q.explanation) {
          content += `**Explanation:** ${q.explanation}\n\n`;
        }

        content += `---\n\n`;
      });
      
      // Set headers for file download
      const filename = `${lectureTitle.replace(/[^a-z0-9]/gi, '_')}_questions.md`;
      res.setHeader('Content-Type', 'text/markdown');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send(content);

      logger.info(`Downloaded questions for lecture ${lectureId} by teacher ${teacherId}`);
    } catch (error) {
      logger.error('Error downloading questions:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to download questions'
      });
    }
  }
}

export const teacherLectureController = new TeacherLectureController();
