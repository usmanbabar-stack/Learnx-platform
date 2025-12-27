"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const searchController_1 = require("../controllers/searchController");
const router = express_1.default.Router();
// Validation middleware
const searchValidation = [
    (0, express_validator_1.query)('q')
        .isString()
        .isLength({ min: 1, max: 200 })
        .withMessage('Search query must be between 1 and 200 characters'),
    (0, express_validator_1.query)('type')
        .optional()
        .isIn(['video', 'channel', 'playlist'])
        .withMessage('Invalid search type'),
    (0, express_validator_1.query)('duration')
        .optional()
        .isIn(['short', 'medium', 'long'])
        .withMessage('Invalid duration filter'),
    (0, express_validator_1.query)('upload_date')
        .optional()
        .isIn(['hour', 'today', 'week', 'month', 'year'])
        .withMessage('Invalid upload date filter'),
    (0, express_validator_1.query)('sort_by')
        .optional()
        .isIn(['relevance', 'date', 'views', 'rating'])
        .withMessage('Invalid sort option'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50')
];
const suggestionsValidation = [
    (0, express_validator_1.query)('q')
        .isString()
        .isLength({ min: 1, max: 100 })
        .withMessage('Query must be between 1 and 100 characters')
];
// Routes
router.get('/', searchValidation, searchController_1.searchController.search.bind(searchController_1.searchController));
router.get('/suggestions', suggestionsValidation, searchController_1.searchController.getSuggestions.bind(searchController_1.searchController));
// Simple test endpoint
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Search routes are working!',
        timestamp: new Date().toISOString()
    });
});
router.get('/trending-topics', searchController_1.searchController.getTrendingTopics.bind(searchController_1.searchController));
router.get('/subjects', searchController_1.searchController.getSubjects.bind(searchController_1.searchController));
exports.default = router;
//# sourceMappingURL=searchRoutes.js.map