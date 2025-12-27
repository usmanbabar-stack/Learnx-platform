import express from 'express';
import { body } from 'express-validator';
import { authController } from '../controllers/authController';

const router = express.Router();


const validateEmailFormat = (email: string): boolean => {
  // Basic format check
  const basicPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!basicPattern.test(email)) return false;
  
  // Check for common domain typos (e.g., @12gmail.com instead of 12@gmail.com)
  const suspiciousPatterns = [
    /@\d+gmail\.com$/i,      // @12gmail.com (number before gmail)
    /@\d+yahoo\.com$/i,      // @12yahoo.com
    /@\d+hotmail\.com$/i,    // @12hotmail.com
    /@gmail\d+\.com$/i,      // @gmail12.com
    /@@/,                     // double @
    /\.\.+/,                  // consecutive dots
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(email)) return false;
  }
  
  // Check domain has valid TLD
  const domain = email.split('@')[1];
  if (!domain || domain.length < 4) return false; // minimum: a.co
  
  return true;
};

const loginValidation = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .normalizeEmail(),
  body('password').isString().isLength({ min: 1 }).withMessage('Password is required'),
];

const signupValidation = [
  body('email')
    .isEmail().withMessage('Valid email is required')
    .custom((value) => {
      if (!validateEmailFormat(value)) {
        throw new Error('Please check your email address - it appears to have a typo');
      }
      return true;
    })
    .normalizeEmail(),
  body('password').isString().isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('firstName').optional().isString(),
  body('lastName').optional().isString(),
  body('role').optional().isIn(['student', 'teacher', 'admin']),
  body('institution').optional().isString(),
];

router.post('/login', loginValidation, authController.login.bind(authController));
router.post('/signup', signupValidation, authController.signup.bind(authController));
router.get('/me', authController.getMe.bind(authController));

export default router;

