"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_validator_1 = require("express-validator");
const authController_1 = require("../controllers/authController");
const router = express_1.default.Router();
const validateEmailFormat = (email) => {
    // Basic format check
    const basicPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!basicPattern.test(email))
        return false;
    // Check for common domain typos (e.g., @12gmail.com instead of 12@gmail.com)
    const suspiciousPatterns = [
        /@\d+gmail\.com$/i, // @12gmail.com (number before gmail)
        /@\d+yahoo\.com$/i, // @12yahoo.com
        /@\d+hotmail\.com$/i, // @12hotmail.com
        /@gmail\d+\.com$/i, // @gmail12.com
        /@@/, // double @
        /\.\.+/, // consecutive dots
    ];
    for (const pattern of suspiciousPatterns) {
        if (pattern.test(email))
            return false;
    }
    // Check domain has valid TLD
    const domain = email.split('@')[1];
    if (!domain || domain.length < 4)
        return false; // minimum: a.co
    return true;
};
const loginValidation = [
    (0, express_validator_1.body)('email')
        .isEmail().withMessage('Valid email is required')
        .normalizeEmail(),
    (0, express_validator_1.body)('password').isString().isLength({ min: 1 }).withMessage('Password is required'),
];
const signupValidation = [
    (0, express_validator_1.body)('email')
        .isEmail().withMessage('Valid email is required')
        .custom((value) => {
        if (!validateEmailFormat(value)) {
            throw new Error('Please check your email address - it appears to have a typo');
        }
        return true;
    })
        .normalizeEmail(),
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