import { Router } from 'express';
import { authenticate } from '../middleware/authMiddleware';
import { pastPaperController, upload } from '../controllers/pastPaperController';

const router = Router();

// All routes require authentication
router.use(authenticate);

/**
 * POST /api/past-papers/sessions
 * Create a new analysis session and upload papers (2-10 files)
 */
router.post('/sessions', upload.array('papers', 10), (req, res) => 
  pastPaperController.createSession(req, res)
);

/**
 * GET /api/past-papers/sessions
 * Get all analysis sessions for the logged-in student
 */
router.get('/sessions', (req, res) => 
  pastPaperController.getSessions(req, res)
);

/**
 * GET /api/past-papers/sessions/:sessionId
 * Get detailed analysis for a specific session
 */
router.get('/sessions/:sessionId', (req, res) => 
  pastPaperController.getSessionDetails(req, res)
);

/**
 * DELETE /api/past-papers/sessions/:sessionId
 * Delete an analysis session and its papers
 */
router.delete('/sessions/:sessionId', (req, res) => 
  pastPaperController.deleteSession(req, res)
);

/**
 * GET /api/past-papers/statistics
 * Get statistics for the logged-in student
 */
router.get('/statistics', (req, res) => 
  pastPaperController.getStatistics(req, res)
);

export default router;
