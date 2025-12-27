import express from 'express';
import { query } from 'express-validator';
import { searchController } from '../controllers/searchController';

const router = express.Router();

// Validation middleware
const searchValidation = [
  query('q')
    .isString()
    .isLength({ min: 1, max: 200 })
    .withMessage('Search query must be between 1 and 200 characters'),
  query('type')
    .optional()
    .isIn(['video', 'channel', 'playlist'])
    .withMessage('Invalid search type'),
  query('duration')
    .optional()
    .isIn(['short', 'medium', 'long'])
    .withMessage('Invalid duration filter'),
  query('upload_date')
    .optional()
    .isIn(['hour', 'today', 'week', 'month', 'year'])
    .withMessage('Invalid upload date filter'),
  query('sort_by')
    .optional()
    .isIn(['relevance', 'date', 'views', 'rating'])
    .withMessage('Invalid sort option'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 50 })
    .withMessage('Limit must be between 1 and 50')
];

const suggestionsValidation = [
  query('q')
    .isString()
    .isLength({ min: 1, max: 100 })
    .withMessage('Query must be between 1 and 100 characters')
];

// Routes
router.get('/', searchValidation, searchController.search.bind(searchController));
router.get('/suggestions', suggestionsValidation, searchController.getSuggestions.bind(searchController));

// Simple test endpoint
router.get('/test', (req, res) => {
  res.json({
    success: true,
    message: 'Search routes are working!',
    timestamp: new Date().toISOString()
  });
});
router.get('/trending-topics', searchController.getTrendingTopics.bind(searchController));
router.get('/subjects', searchController.getSubjects.bind(searchController));

export default router;
