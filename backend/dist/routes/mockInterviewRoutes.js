"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const mockInterviewController_1 = require("../controllers/mockInterviewController");
const router = express_1.default.Router();
// Validation rules
const generateInterviewValidation = [
    (0, express_validator_1.body)('field')
        .isString()
        .trim()
        .isLength({ min: 2, max: 255 })
        .withMessage('Field must be between 2 and 255 characters'),
    (0, express_validator_1.body)('difficulty')
        .optional()
        .isIn(['easy', 'medium', 'hard', 'mixed'])
        .withMessage('Difficulty must be easy, medium, hard, or mixed'),
    (0, express_validator_1.body)('questionCount')
        .optional()
        .isInt({ min: 3, max: 20 })
        .withMessage('Question count must be between 3 and 20'),
    (0, express_validator_1.body)('userId')
        .isInt({ min: 1 })
        .withMessage('Valid user ID is required'),
];
const evaluateAnswerValidation = [
    (0, express_validator_1.body)('sessionId')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Session ID is required'),
    (0, express_validator_1.body)('questionId')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Question ID is required'),
    (0, express_validator_1.body)('question')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Question text is required'),
    (0, express_validator_1.body)('userAnswer')
        .isString()
        .trim()
        .isLength({ min: 10 })
        .withMessage('Answer must be at least 10 characters'),
    (0, express_validator_1.body)('expectedKeyPoints')
        .isArray()
        .withMessage('Expected key points must be an array'),
    (0, express_validator_1.body)('field')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Field is required'),
];
const completeSessionValidation = [
    (0, express_validator_1.body)('sessionId')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Session ID is required'),
];
const userIdParamValidation = [
    (0, express_validator_1.param)('userId')
        .isInt({ min: 1 })
        .withMessage('Valid user ID is required'),
];
const sessionIdParamValidation = [
    (0, express_validator_1.param)('sessionId')
        .isString()
        .trim()
        .notEmpty()
        .withMessage('Session ID is required'),
];
const limitQueryValidation = [
    (0, express_validator_1.query)('limit')
        .optional()
        .isInt({ min: 1, max: 100 })
        .withMessage('Limit must be between 1 and 100'),
];
// Routes
router.post('/generate', generateInterviewValidation, mockInterviewController_1.mockInterviewController.generateInterview.bind(mockInterviewController_1.mockInterviewController));
router.post('/evaluate', evaluateAnswerValidation, mockInterviewController_1.mockInterviewController.evaluateAnswer.bind(mockInterviewController_1.mockInterviewController));
router.post('/complete', completeSessionValidation, mockInterviewController_1.mockInterviewController.completeSession.bind(mockInterviewController_1.mockInterviewController));
router.get('/sessions/:userId', [...userIdParamValidation, ...limitQueryValidation], mockInterviewController_1.mockInterviewController.getUserSessions.bind(mockInterviewController_1.mockInterviewController));
router.get('/session/:sessionId', sessionIdParamValidation, mockInterviewController_1.mockInterviewController.getSessionDetails.bind(mockInterviewController_1.mockInterviewController));
router.get('/stats/:userId', userIdParamValidation, mockInterviewController_1.mockInterviewController.getUserStats.bind(mockInterviewController_1.mockInterviewController));
router.post('/clear-cache', mockInterviewController_1.mockInterviewController.clearCache.bind(mockInterviewController_1.mockInterviewController));
exports.default = router;
//# sourceMappingURL=mockInterviewRoutes.js.map