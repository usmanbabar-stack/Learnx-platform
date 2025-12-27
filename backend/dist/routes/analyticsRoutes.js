"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const analyticsController_1 = require("../controllers/analyticsController");
const router = express_1.default.Router();
// Validation middleware
const videoIdValidation = [
    (0, express_validator_1.param)('videoId')
        .isString()
        .isLength({ min: 11, max: 11 })
        .withMessage('Invalid YouTube video ID')
];
const dateRangeValidation = [
    (0, express_validator_1.query)('startDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid start date format'),
    (0, express_validator_1.query)('endDate')
        .optional()
        .isISO8601()
        .withMessage('Invalid end date format')
];
// Routes
router.get('/overview', dateRangeValidation, analyticsController_1.analyticsController.getOverview.bind(analyticsController_1.analyticsController));
router.get('/popular-videos', dateRangeValidation, analyticsController_1.analyticsController.getPopularVideos.bind(analyticsController_1.analyticsController));
router.get('/search-trends', dateRangeValidation, analyticsController_1.analyticsController.getSearchTrends.bind(analyticsController_1.analyticsController));
router.get('/subjects', dateRangeValidation, analyticsController_1.analyticsController.getSubjectAnalytics.bind(analyticsController_1.analyticsController));
router.get('/video/:videoId', videoIdValidation, analyticsController_1.analyticsController.getVideoAnalytics.bind(analyticsController_1.analyticsController));
exports.default = router;
//# sourceMappingURL=analyticsRoutes.js.map