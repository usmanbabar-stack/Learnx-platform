import express from 'express';
import { dashboardController } from '../controllers/dashboardController';

const router = express.Router();

// Get user dashboard statistics
router.get('/stats', dashboardController.getStats.bind(dashboardController));

export default router;

