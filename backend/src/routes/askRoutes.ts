import express from 'express';
import { body } from 'express-validator';
import { askController } from '../controllers/askController';

const router = express.Router();

const askValidation = [
  body('videoId').isString().isLength({ min: 11, max: 32 }).withMessage('Invalid videoId'),
  body('question').isString().isLength({ min: 1, max: 1000 }).withMessage('Question is required'),
  body('currentTime').optional().isFloat({ min: 0 }).withMessage('currentTime must be >= 0'),
];

router.post('/', askValidation, askController.ask.bind(askController));

export default router;


