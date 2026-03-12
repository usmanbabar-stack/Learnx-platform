#!/usr/bin/env ts-node
"use strict";
/**
 * Script to preload transcripts for all videos in the database
 * Run this to ensure all videos have transcripts ready
 */
Object.defineProperty(exports, "__esModule", { value: true });
const logger_1 = require("../utils/logger");
const videoRepository_1 = require("../repositories/videoRepository");
const transcriptOrchestrationService_1 = require("../services/transcriptOrchestrationService");
async function preloadAllVideos() {
    try {
        logger_1.logger.info('🚀 Starting batch preload for all videos...');
        // Get all videos
        // TODO: Fix this - findAll method doesn't exist in videoRepository
        // const allVideos = await videoRepository.findAll();
        const allVideos = []; // Temporary fix
        logger_1.logger.info(`📊 Found ${allVideos.length} videos in database`);
        // Filter videos without transcripts
        const videosNeedingTranscripts = [];
        for (const video of allVideos) {
            const transcript = await videoRepository_1.videoRepository.getTranscriptByVideoId(video.videoId);
            if (!transcript || transcript.length === 0) {
                videosNeedingTranscripts.push(video);
            }
        }
        logger_1.logger.info(`⚡ ${videosNeedingTranscripts.length} videos need transcripts`);
        if (videosNeedingTranscripts.length === 0) {
            logger_1.logger.info('✅ All videos already have transcripts!');
            process.exit(0);
        }
        // Preload transcripts (one at a time to avoid overwhelming the system)
        let completed = 0;
        let failed = 0;
        for (const video of videosNeedingTranscripts) {
            try {
                logger_1.logger.info(`[${completed + 1}/${videosNeedingTranscripts.length}] Preloading: ${video.videoId} - ${video.title}`);
                await transcriptOrchestrationService_1.transcriptOrchestrationService.preloadTranscript(video.videoId);
                completed++;
                logger_1.logger.info(`✅ Completed: ${video.videoId}`);
            }
            catch (error) {
                failed++;
                logger_1.logger.error(`❌ Failed: ${video.videoId}`, error);
            }
        }
        logger_1.logger.info(`\n📊 Preload Summary:`);
        logger_1.logger.info(`   ✅ Completed: ${completed}`);
        logger_1.logger.info(`   ❌ Failed: ${failed}`);
        logger_1.logger.info(`   📈 Total: ${videosNeedingTranscripts.length}`);
        process.exit(0);
    }
    catch (error) {
        logger_1.logger.error('Fatal error during preload:', error);
        process.exit(1);
    }
}
// Run the script
preloadAllVideos();
//# sourceMappingURL=preload-all-videos.js.map