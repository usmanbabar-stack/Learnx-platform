import { promises as fs } from 'fs';
import { join } from 'path';
import { getPostgresPool } from '../config/postgres';
import { asrService } from './asrService';
import { summaryService } from './summaryService';
import { quizService } from './quizService';
import { documentProcessingService } from './documentProcessingService';
import { logger } from '../utils/logger';

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(__dirname, '../../uploads/lectures');

interface LectureUploadData {
  teacherId: number;
  title: string;
  description?: string;
  subject?: string;
  difficulty?: string;
  visibility?: string;
  language?: string;
  fileType?: 'audio' | 'video' | 'document';
}

interface LectureProcessingResult {
  lectureId: number;
  transcriptWordCount: number;
  duration: string;
  notesGenerated: boolean;
  questionsGenerated: boolean;
}

export class LectureUploadService {
  /**
   * Process uploaded lecture file end-to-end:
   * 1. Save lecture metadata to DB
   * 2. Transcribe audio using ASR OR extract text from document
   * 3. Generate notes using summaryService
   * 4. Generate questions using quizService
   * 5. Update lecture status to 'completed'
   */
  async processLecture(
    file: Express.Multer.File,
    data: LectureUploadData
  ): Promise<LectureProcessingResult> {
    const pool = getPostgresPool();
    let lectureId: number | null = null;

    try {
      // Step 1: Create lecture record in DB
      logger.info(`Creating lecture record for teacher ${data.teacherId}`);
      
      const insertQuery = `
        INSERT INTO lectures (
          teacher_id, title, description, file_path, file_size,
          subject, difficulty, visibility, status
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'processing')
        RETURNING id
      `;

      const insertResult = await pool.query(insertQuery, [
        data.teacherId,
        data.title,
        data.description || null,
        file.path,
        file.size,
        data.subject || 'Other',
        data.difficulty || 'intermediate',
        data.visibility || 'private'
      ]);

      lectureId = insertResult.rows[0].id;
      logger.info(`Lecture ${lectureId} created, starting processing`);

      let transcriptText = '';
      let duration = '';
      let wordCount = 0;

      // Step 2: Determine processing path based on file type
      const isDocument = documentProcessingService.isDocumentFile(file.mimetype);
      const isMedia = documentProcessingService.isMediaFile(file.mimetype);

      if (isDocument) {
        // Process document: extract text directly
        logger.info(`Processing document file for lecture ${lectureId}`);
        
        const documentResult = await documentProcessingService.extractText(
          file.path,
          file.mimetype
        );

        transcriptText = documentResult.text;
        wordCount = documentResult.wordCount;
        duration = 'N/A'; // Documents don't have duration

        logger.info(
          `Document processing completed for lecture ${lectureId}: ` +
          `${wordCount} words` +
          (documentResult.pageCount ? `, ${documentResult.pageCount} pages` : '')
        );

      } else if (isMedia) {
        // Process audio/video: transcribe using ASR
        logger.info(`Starting transcription for lecture ${lectureId}`);
        
        const transcriptResult = await asrService.transcribe(
          file.path,
          data.language || 'en-US'
        );

        transcriptText = transcriptResult.fullText;
        wordCount = transcriptResult.wordCount;
        duration = asrService.formatDuration(transcriptResult.duration);

        logger.info(
          `Transcription completed for lecture ${lectureId}: ` +
          `${wordCount} words, ${duration} duration`
        );
      } else {
        throw new Error(`Unsupported file type: ${file.mimetype}`);
      }

      // Update lecture with transcript
      await pool.query(
        `UPDATE lectures 
         SET transcript_text = $1, duration = $2 
         WHERE id = $3`,
        [transcriptText, duration, lectureId]
      );

      // Step 3: Generate notes (both detailed and quick)
      let notesGenerated = false;
      try {
        logger.info(`Generating notes for lecture ${lectureId}`);
        
        // Convert text to transcript segments format for AI services
        // Split text into chunks of ~100 words each for better processing
        const words = transcriptText.split(/\s+/).filter(w => w.length > 0);
        const chunkSize = 100;
        const transcriptSegments = [];
        
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunkWords = words.slice(i, i + chunkSize);
          transcriptSegments.push({
            text: chunkWords.join(' '),
            start: i / chunkSize,
            duration: 1,
            sequence_order: transcriptSegments.length
          });
        }

        // Generate comprehensive summary
        const comprehensiveSummary = await summaryService.generateComprehensiveSummary(
          transcriptSegments,
          data.title,
          'Teacher Upload'
        );

        // Format comprehensive summary as markdown
        const detailedContent = `# ${data.title}

## Overview
${comprehensiveSummary.overview}

## Key Points
${comprehensiveSummary.keyPoints.map((point: string) => `- ${point}`).join('\n')}

## Main Topics
${comprehensiveSummary.mainTopics.map((topic: string) => `- ${topic}`).join('\n')}

## Key Timestamps
${comprehensiveSummary.keyTimestamps.map((ts: any) => `- **${ts.time}**: ${ts.description}`).join('\n')}

**Difficulty:** ${comprehensiveSummary.difficulty}
**Target Audience:** ${comprehensiveSummary.targetAudience}
`;

        // Generate quick summary
        const quickSummary = await summaryService.generateQuickSummary(
          transcriptSegments
        );

        const quickContent = `# ${data.title}

${quickSummary}
`;

        // Save both summaries to database
        const detailedWordCount = detailedContent.split(/\s+/).filter(w => w.length > 0).length;
        const quickWordCount = quickContent.split(/\s+/).filter(w => w.length > 0).length;
        
        await pool.query(
          `INSERT INTO generated_notes (lecture_id, content, summary_type, word_count)
           VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)`,
          [
            lectureId, detailedContent, 'detailed', detailedWordCount,
            lectureId, quickContent, 'quick', quickWordCount
          ]
        );

        notesGenerated = true;
        logger.info(`Notes generated for lecture ${lectureId}`);
      } catch (error) {
        logger.error(`Notes generation failed for lecture ${lectureId}:`, error);
        // Continue processing even if notes generation fails
      }

      // Step 4: Generate questions for quiz
      let questionsGenerated = false;
      try {
        logger.info(`Generating questions for lecture ${lectureId}`);
        
        // Convert text to transcript segments for quiz service (if not already done)
        const words = transcriptText.split(/\s+/).filter(w => w.length > 0);
        const chunkSize = 100;
        const transcriptSegments = [];
        
        for (let i = 0; i < words.length; i += chunkSize) {
          const chunkWords = words.slice(i, i + chunkSize);
          transcriptSegments.push({
            text: chunkWords.join(' '),
            start: i / chunkSize,
            duration: 1,
            sequence_order: transcriptSegments.length
          });
        }

        const quiz = await quizService.generateQuiz(
          transcriptSegments,
          `lecture-${lectureId}`,
          data.title,
          20 // Generate 20 questions
        );

        await pool.query(
          `INSERT INTO question_banks (lecture_id, questions, difficulty, total_questions, question_type)
           VALUES ($1, $2, 'mixed', $3, 'mixed')`,
          [lectureId, JSON.stringify(quiz.questions), quiz.questions.length]
        );

        questionsGenerated = true;
        logger.info(`Questions generated for lecture ${lectureId}: ${quiz.questions.length} questions`);
      } catch (error) {
        logger.error(`Question generation failed for lecture ${lectureId}:`, error);
        // Continue processing even if questions fail
      }

      // Step 5: Update lecture status
      const finalStatus = notesGenerated || questionsGenerated ? 'completed' : 'failed';
      await pool.query(
        'UPDATE lectures SET status = $1 WHERE id = $2',
        [finalStatus, lectureId!]
      );

      logger.info(
        `Lecture ${lectureId} processing completed with status: ${finalStatus} ` +
        `(notes: ${notesGenerated}, questions: ${questionsGenerated})`
      );

      return {
        lectureId: lectureId!,
        transcriptWordCount: wordCount,
        duration,
        notesGenerated,
        questionsGenerated
      };
    } catch (error) {
      // Mark lecture as failed if it was created
      if (lectureId) {
        try {
          await pool.query(
            'UPDATE lectures SET status = $1 WHERE id = $2',
            ['failed', lectureId]
          );
        } catch (updateError) {
          logger.error(`Failed to update lecture ${lectureId} status:`, updateError);
        }
      }

      logger.error('Lecture processing failed:', error);
      throw error;
    }
  }

  /**
   * Ensure uploads directory exists
   */
  async ensureUploadsDir(): Promise<void> {
    try {
      await fs.mkdir(UPLOADS_DIR, { recursive: true });
    } catch (error) {
      logger.error('Failed to create uploads directory:', error);
      throw error;
    }
  }

  /**
   * Delete a lecture file
   */
  async deleteLectureFile(filePath: string): Promise<void> {
    try {
      await fs.unlink(filePath);
      logger.info(`Deleted lecture file: ${filePath}`);
    } catch (error) {
      logger.error(`Failed to delete lecture file ${filePath}:`, error);
      // Don't throw - file might already be deleted
    }
  }
}

export const lectureUploadService = new LectureUploadService();
