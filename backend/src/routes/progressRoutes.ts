import express from 'express';
import { progressController } from '../controllers/progressController';

const router = express.Router();

// Dashboard and stats routes
router.get('/stats', progressController.getDashboardStats.bind(progressController));
router.get('/weekly', progressController.getWeeklyStats.bind(progressController));
router.get('/patterns', progressController.getLearningPatterns.bind(progressController));
router.get('/in-progress', progressController.getInProgressVideos.bind(progressController));
router.get('/recently-watched', progressController.getRecentlyWatched.bind(progressController));
router.get('/completed', progressController.getCompletedVideos.bind(progressController));

// Video-specific progress routes
router.get('/:videoId', progressController.getVideoProgress.bind(progressController));
router.post('/update', progressController.updateProgress.bind(progressController));
router.post('/:videoId/complete', progressController.markCompleted.bind(progressController));

export default router;
