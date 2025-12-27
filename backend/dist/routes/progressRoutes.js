"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const progressController_1 = require("../controllers/progressController");
const router = express_1.default.Router();
// Dashboard and stats routes
router.get('/stats', progressController_1.progressController.getDashboardStats.bind(progressController_1.progressController));
router.get('/in-progress', progressController_1.progressController.getInProgressVideos.bind(progressController_1.progressController));
router.get('/recently-watched', progressController_1.progressController.getRecentlyWatched.bind(progressController_1.progressController));
router.get('/completed', progressController_1.progressController.getCompletedVideos.bind(progressController_1.progressController));
// Video-specific progress routes
router.get('/:videoId', progressController_1.progressController.getVideoProgress.bind(progressController_1.progressController));
router.post('/update', progressController_1.progressController.updateProgress.bind(progressController_1.progressController));
router.post('/:videoId/complete', progressController_1.progressController.markCompleted.bind(progressController_1.progressController));
exports.default = router;
//# sourceMappingURL=progressRoutes.js.map