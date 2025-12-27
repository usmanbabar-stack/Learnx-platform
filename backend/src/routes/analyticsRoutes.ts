import express from 'express';
import { param, query } from 'express-validator';
import { analyticsController } from '../controllers/analyticsController';

const router = express.Router();

// Validation middleware
const videoIdValidation = [
  param('videoId')
    .isString()
    .isLength({ min: 11, max: 11 })
    .withMessage('Invalid YouTube video ID')
];

const dateRangeValidation = [
  query('startDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid start date format'),
  query('endDate')
    .optional()
    .isISO8601()
    .withMessage('Invalid end date format')
];

// Routes
router.get('/overview', dateRangeValidation, analyticsController.getOverview.bind(analyticsController));
router.get('/popular-videos', dateRangeValidation, analyticsController.getPopularVideos.bind(analyticsController));
router.get('/search-trends', dateRangeValidation, analyticsController.getSearchTrends.bind(analyticsController));
router.get('/subjects', dateRangeValidation, analyticsController.getSubjectAnalytics.bind(analyticsController));
router.get('/video/:videoId', videoIdValidation, analyticsController.getVideoAnalytics.bind(analyticsController));

export default router;
