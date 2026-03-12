"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const videoRepository_1 = require("../repositories/videoRepository");
const logger_1 = require("../utils/logger");
const router = (0, express_1.Router)();
// GET /api/chat/:videoId - Get chat history for current user and video
router.get('/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const userId = parseInt(req.query.userId);
        if (!userId || isNaN(userId)) {
            res.status(400).json({
                success: false,
                message: 'userId is required'
            });
            return;
        }
        const history = await (0, videoRepository_1.getChatHistory)(userId, videoId);
        res.json({
            success: true,
            data: {
                videoId,
                userId,
                messages: history.map(msg => ({
                    id: msg.id.toString(),
                    type: msg.messageType,
                    content: msg.content,
                    timestamp: new Date(msg.createdAt).getTime(),
                    videoTime: msg.videoTime
                })),
                count: history.length
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error fetching chat history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chat history'
        });
    }
});
// POST /api/chat/:videoId - Save a chat message
router.post('/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const { userId, messageType, content, videoTime } = req.body;
        if (!userId || !messageType || !content) {
            res.status(400).json({
                success: false,
                message: 'userId, messageType, and content are required'
            });
            return;
        }
        if (!['user', 'ai'].includes(messageType)) {
            res.status(400).json({
                success: false,
                message: 'messageType must be "user" or "ai"'
            });
            return;
        }
        const saved = await (0, videoRepository_1.saveChatMessage)(parseInt(userId), videoId, messageType, content, videoTime || 0);
        res.json({
            success: true,
            data: {
                id: saved.id.toString(),
                type: saved.messageType,
                content: saved.content,
                timestamp: new Date(saved.createdAt).getTime(),
                videoTime: saved.videoTime
            }
        });
    }
    catch (error) {
        logger_1.logger.error('Error saving chat message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save chat message'
        });
    }
});
// DELETE /api/chat/:videoId - Clear chat history for current user and video
router.delete('/:videoId', async (req, res) => {
    try {
        const { videoId } = req.params;
        const userId = parseInt(req.query.userId);
        if (!userId || isNaN(userId)) {
            res.status(400).json({
                success: false,
                message: 'userId is required'
            });
            return;
        }
        const deletedCount = await (0, videoRepository_1.clearChatHistory)(userId, videoId);
        res.json({
            success: true,
            data: {
                videoId,
                userId,
                deletedCount
            },
            message: `Cleared ${deletedCount} messages`
        });
    }
    catch (error) {
        logger_1.logger.error('Error clearing chat history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to clear chat history'
        });
    }
});
exports.default = router;
//# sourceMappingURL=chatRoutes.js.map