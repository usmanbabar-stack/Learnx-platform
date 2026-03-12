import express from 'express';
import { teacherLectureController } from '../controllers/teacherLectureController';
import { authenticate } from '../middleware/authMiddleware';
import { requireTeacher } from '../middleware/roleMiddleware';
import { uploadLectureFile } from '../config/multer';

const router = express.Router();

// All routes require authentication and teacher role
router.use(authenticate);
router.use(requireTeacher);

/**
 * GET /api/teacher/stats
 * Get teacher's statistics (lectures, views, etc.)
 */
router.get('/stats', teacherLectureController.getStats.bind(teacherLectureController));

/**
 * GET /api/teacher/lectures
 * Get all lectures for the authenticated teacher
 */
router.get('/lectures', teacherLectureController.getLectures.bind(teacherLectureController));

/**
 * GET /api/teacher/lectures/:id
 * Get a single lecture with its notes and question banks
 */
router.get('/lectures/:id', teacherLectureController.getLecture.bind(teacherLectureController));

/**
 * GET /api/teacher/lectures/:id/notes/download
 * Download notes for a lecture (markdown file)
 * Query param: type=detailed|quick (default: detailed)
 */
router.get('/lectures/:id/notes/download', teacherLectureController.downloadNotes.bind(teacherLectureController));

/**
 * GET /api/teacher/lectures/:id/questions/download
 * Download question bank for a lecture (markdown file)
 */
router.get('/lectures/:id/questions/download', teacherLectureController.downloadQuestions.bind(teacherLectureController));

/**
 * PUT /api/teacher/lectures/:id
 * Update lecture metadata (title, description, etc.)
 */
router.put('/lectures/:id', teacherLectureController.updateLecture.bind(teacherLectureController));

/**
 * DELETE /api/teacher/lectures/:id
 * Delete a lecture (cascades to notes and question banks)
 */
router.delete('/lectures/:id', teacherLectureController.deleteLecture.bind(teacherLectureController));

/**
 * POST /api/teacher/lectures/upload
 * Upload a new lecture file (video/audio)
 * Uses multer middleware for file upload, then processes with ASR + AI generation
 */
router.post(
  '/lectures/upload', 
  uploadLectureFile, 
  teacherLectureController.uploadLecture.bind(teacherLectureController)
);

export default router;
