import express from 'express';
import { body, query, param } from 'express-validator';
import { videoController } from '../controllers/videoController';

const router = express.Router();

// Validation middleware
const searchValidation = [
  query('query')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50'),
  query('subject')
    .optional()
    .isIn([
      'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
      'Engineering', 'Business', 'Economics', 'Psychology', 'History',
      'Literature', 'Art', 'Music', 'Language Learning', 'Medicine',
      'Law', 'Philosophy', 'Other'
    ])
    .withMessage('Invalid subject'),
  query('difficulty')
    .optional()
    .isIn(['beginner', 'intermediate', 'advanced'])
    .withMessage('Invalid difficulty level'),
  query('sortBy')
    .optional()
    .isIn(['relevance', 'date', 'views', 'rating'])
    .withMessage('Invalid sort option')
];

const videoIdValidation = [
  param('videoId')
    .isString()
    .isLength({ min: 11, max: 11 })
    .withMessage('Invalid YouTube video ID')
];

const batchProcessValidation = [
  body('videoIds')
    .isArray({ min: 1, max: 10 })
    .withMessage('Video IDs must be an array with 1-10 items'),
  body('videoIds.*')
    .isString()
    .isLength({ min: 11, max: 11 })
    .withMessage('Each video ID must be a valid YouTube ID')
];

const batchPreloadValidation = [
  body('videoIds')
    .isArray({ min: 1, max: 20 })
    .withMessage('Video IDs must be an array with 1-20 items'),
  body('videoIds.*')
    .isString()
    .isLength({ min: 11, max: 11 })
    .withMessage('Each video ID must be a valid YouTube ID')
];

// Routes
router.get('/search', searchValidation, videoController.searchVideos.bind(videoController));
router.get('/trending', videoController.getTrendingVideos.bind(videoController));
router.get('/subject/:subject', videoController.getVideosBySubject.bind(videoController));
router.get('/:videoId', videoIdValidation, videoController.getVideoById.bind(videoController));
router.get('/:videoId/transcript', videoIdValidation, videoController.getVideoTranscript.bind(videoController));
router.get('/:videoId/transcript-status', videoIdValidation, videoController.getTranscriptStatus.bind(videoController));
router.post('/:videoId/preload', videoIdValidation, videoController.preloadVideo.bind(videoController));
router.post('/batch-process', batchProcessValidation, videoController.batchProcessVideos.bind(videoController));
router.post('/preload-batch', batchPreloadValidation, videoController.preloadVideosBatch.bind(videoController));

export default router;
