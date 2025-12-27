import express from 'express';
import { param, query } from 'express-validator';
import { transcriptController } from '../controllers/transcriptController';

const router = express.Router();

// Validation middleware
const videoIdValidation = [
  param('videoId')
    .isString()
    .isLength({ min: 11, max: 11 })
    .withMessage('Invalid YouTube video ID')
];

const searchTranscriptValidation = [
  param('videoId')
    .isString()
    .isLength({ min: 11, max: 11 })
    .withMessage('Invalid YouTube video ID'),
  query('query')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters')
];

// Routes
router.get('/:videoId', videoIdValidation, transcriptController.getTranscript.bind(transcriptController));
router.get('/:videoId/search', searchTranscriptValidation, transcriptController.searchTranscript.bind(transcriptController));
router.get('/:videoId/summary', videoIdValidation, transcriptController.generateSummary.bind(transcriptController));
router.get('/:videoId/glossary', videoIdValidation, transcriptController.generateGlossary.bind(transcriptController));
router.get('/:videoId/flashcards', videoIdValidation, transcriptController.generateFlashcards.bind(transcriptController));

export default router;
