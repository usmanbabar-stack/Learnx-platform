import express from 'express';
import { body, param, query } from 'express-validator';
import { mockInterviewController } from '../controllers/mockInterviewController';

const router = express.Router();

// Validation rules
const generateInterviewValidation = [
  body('field')
    .isString()
    .trim()
    .isLength({ min: 2, max: 255 })
    .withMessage('Field must be between 2 and 255 characters'),
  body('difficulty')
    .optional()
    .isIn(['easy', 'medium', 'hard', 'mixed'])
    .withMessage('Difficulty must be easy, medium, hard, or mixed'),
  body('questionCount')
    .optional()
    .isInt({ min: 3, max: 20 })
    .withMessage('Question count must be between 3 and 20'),
  body('userId')
    .isInt({ min: 1 })
    .withMessage('Valid user ID is required'),
];

const evaluateAnswerValidation = [
  body('sessionId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Session ID is required'),
  body('questionId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Question ID is required'),
  body('question')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Question text is required'),
  body('userAnswer')
    .isString()
    .trim()
    .isLength({ min: 10 })
    .withMessage('Answer must be at least 10 characters'),
  body('expectedKeyPoints')
    .isArray()
    .withMessage('Expected key points must be an array'),
  body('field')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Field is required'),
];

const completeSessionValidation = [
  body('sessionId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Session ID is required'),
];

const userIdParamValidation = [
  param('userId')
    .isInt({ min: 1 })
    .withMessage('Valid user ID is required'),
];

const sessionIdParamValidation = [
  param('sessionId')
    .isString()
    .trim()
    .notEmpty()
    .withMessage('Session ID is required'),
];

const limitQueryValidation = [
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limit must be between 1 and 100'),
];

// Routes
router.post(
  '/generate',
  generateInterviewValidation,
  mockInterviewController.generateInterview.bind(mockInterviewController)
);

router.post(
  '/evaluate',
  evaluateAnswerValidation,
  mockInterviewController.evaluateAnswer.bind(mockInterviewController)
);

router.post(
  '/complete',
  completeSessionValidation,
  mockInterviewController.completeSession.bind(mockInterviewController)
);

router.get(
  '/sessions/:userId',
  [...userIdParamValidation, ...limitQueryValidation],
  mockInterviewController.getUserSessions.bind(mockInterviewController)
);

router.get(
  '/session/:sessionId',
  sessionIdParamValidation,
  mockInterviewController.getSessionDetails.bind(mockInterviewController)
);

router.get(
  '/stats/:userId',
  userIdParamValidation,
  mockInterviewController.getUserStats.bind(mockInterviewController)
);

router.post(
  '/clear-cache',
  mockInterviewController.clearCache.bind(mockInterviewController)
);

export default router;
