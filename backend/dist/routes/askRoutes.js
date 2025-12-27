"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const askController_1 = require("../controllers/askController");
const router = express_1.default.Router();
const askValidation = [
    (0, express_validator_1.body)('videoId').isString().isLength({ min: 11, max: 32 }).withMessage('Invalid videoId'),
    (0, express_validator_1.body)('question').isString().isLength({ min: 1, max: 1000 }).withMessage('Question is required'),
    (0, express_validator_1.body)('currentTime').optional().isFloat({ min: 0 }).withMessage('currentTime must be >= 0'),
];
router.post('/', askValidation, askController_1.askController.ask.bind(askController_1.askController));
exports.default = router;
//# sourceMappingURL=askRoutes.js.map