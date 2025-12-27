"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const authController_1 = require("../controllers/authController");
const router = express_1.default.Router();
const loginValidation = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('password').isString().isLength({ min: 1 }).withMessage('Password is required'),
];
const signupValidation = [
    (0, express_validator_1.body)('email').isEmail().withMessage('Valid email is required'),
    (0, express_validator_1.body)('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
    (0, express_validator_1.body)('firstName').optional().isString(),
    (0, express_validator_1.body)('lastName').optional().isString(),
    (0, express_validator_1.body)('role').optional().isIn(['student', 'teacher', 'admin']),
    (0, express_validator_1.body)('institution').optional().isString(),
];
router.post('/login', loginValidation, authController_1.authController.login.bind(authController_1.authController));
router.post('/signup', signupValidation, authController_1.authController.signup.bind(authController_1.authController));
router.get('/me', authController_1.authController.getMe.bind(authController_1.authController));
exports.default = router;
//# sourceMappingURL=authRoutes.js.map