"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const transcriptController_1 = require("../controllers/transcriptController");
const router = express_1.default.Router();
// Validation middleware
const videoIdValidation = [
    (0, express_validator_1.param)('videoId')
        .isString()
        .isLength({ min: 11, max: 11 })
        .withMessage('Invalid YouTube video ID')
];
const searchTranscriptValidation = [
    (0, express_validator_1.param)('videoId')
        .isString()
        .isLength({ min: 11, max: 11 })
        .withMessage('Invalid YouTube video ID'),
    (0, express_validator_1.query)('query')
        .isString()
        .isLength({ min: 1, max: 200 })
        .withMessage('Search query must be between 1 and 200 characters')
];
// Routes
router.get('/:videoId', videoIdValidation, transcriptController_1.transcriptController.getTranscript.bind(transcriptController_1.transcriptController));
router.get('/:videoId/search', searchTranscriptValidation, transcriptController_1.transcriptController.searchTranscript.bind(transcriptController_1.transcriptController));
router.get('/:videoId/summary', videoIdValidation, transcriptController_1.transcriptController.generateSummary.bind(transcriptController_1.transcriptController));
exports.default = router;
//# sourceMappingURL=transcriptRoutes.js.map