"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const videoController_1 = require("../controllers/videoController");
const router = express_1.default.Router();
// Validation middleware
const searchValidation = [
    (0, express_validator_1.query)('query')
        .isString()
        .isLength({ min: 1, max: 200 })
        .withMessage('Search query must be between 1 and 200 characters'),
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 50 })
        .withMessage('Limit must be between 1 and 50'),
    (0, express_validator_1.query)('subject')
        .optional()
        .isIn([
        'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
        'Engineering', 'Business', 'Economics', 'Psychology', 'History',
        'Literature', 'Art', 'Music', 'Language Learning', 'Medicine',
        'Law', 'Philosophy', 'Other'
    ])
        .withMessage('Invalid subject'),
    (0, express_validator_1.query)('difficulty')
        .optional()
        .isIn(['beginner', 'intermediate', 'advanced'])
        .withMessage('Invalid difficulty level'),
    (0, express_validator_1.query)('sortBy')
        .optional()
        .isIn(['relevance', 'date', 'views', 'rating'])
        .withMessage('Invalid sort option')
];
const videoIdValidation = [
    (0, express_validator_1.param)('videoId')
        .isString()
        .isLength({ min: 11, max: 11 })
        .withMessage('Invalid YouTube video ID')
];
const batchProcessValidation = [
    (0, express_validator_1.body)('videoIds')
        .isArray({ min: 1, max: 10 })
        .withMessage('Video IDs must be an array with 1-10 items'),
    (0, express_validator_1.body)('videoIds.*')
        .isString()
        .isLength({ min: 11, max: 11 })
        .withMessage('Each video ID must be a valid YouTube ID')
];
const batchPreloadValidation = [
    (0, express_validator_1.body)('videoIds')
        .isArray({ min: 1, max: 20 })
        .withMessage('Video IDs must be an array with 1-20 items'),
    (0, express_validator_1.body)('videoIds.*')
        .isString()
        .isLength({ min: 11, max: 11 })
        .withMessage('Each video ID must be a valid YouTube ID')
];
// Routes
router.get('/search', searchValidation, videoController_1.videoController.searchVideos.bind(videoController_1.videoController));
router.get('/trending', videoController_1.videoController.getTrendingVideos.bind(videoController_1.videoController));
router.get('/subject/:subject', videoController_1.videoController.getVideosBySubject.bind(videoController_1.videoController));
router.get('/:videoId', videoIdValidation, videoController_1.videoController.getVideoById.bind(videoController_1.videoController));
router.get('/:videoId/transcript', videoIdValidation, videoController_1.videoController.getVideoTranscript.bind(videoController_1.videoController));
router.get('/:videoId/transcript-status', videoIdValidation, videoController_1.videoController.getTranscriptStatus.bind(videoController_1.videoController));
router.post('/:videoId/preload', videoIdValidation, videoController_1.videoController.preloadVideo.bind(videoController_1.videoController));
router.post('/batch-process', batchProcessValidation, videoController_1.videoController.batchProcessVideos.bind(videoController_1.videoController));
router.post('/preload-batch', batchPreloadValidation, videoController_1.videoController.preloadVideosBatch.bind(videoController_1.videoController));
exports.default = router;
//# sourceMappingURL=videoRoutes.js.map