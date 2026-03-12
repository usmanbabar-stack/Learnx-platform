#!/usr/bin/env ts-node
/**
 * Script to preload transcripts for all videos in the database
 * Run this to ensure all videos have transcripts ready
 */

import { logger } from '../utils/logger';
import { videoRepository } from '../repositories/videoRepository';
import { transcriptOrchestrationService } from '../services/transcriptOrchestrationService';

async function preloadAllVideos() {
  try {
    logger.info('🚀 Starting batch preload for all videos...');

    // Get all videos
    // TODO: Fix this - findAll method doesn't exist in videoRepository
    // const allVideos = await videoRepository.findAll();
    const allVideos: any[] = []; // Temporary fix
    logger.info(`📊 Found ${allVideos.length} videos in database`);

    // Filter videos without transcripts
    const videosNeedingTranscripts = [];
    for (const video of allVideos) {
      const transcript = await videoRepository.getTranscriptByVideoId(video.videoId);
      if (!transcript || transcript.length === 0) {
        videosNeedingTranscripts.push(video);
      }
    }

    logger.info(`⚡ ${videosNeedingTranscripts.length} videos need transcripts`);

    if (videosNeedingTranscripts.length === 0) {
      logger.info('✅ All videos already have transcripts!');
      process.exit(0);
    }

    // Preload transcripts (one at a time to avoid overwhelming the system)
    let completed = 0;
    let failed = 0;

    for (const video of videosNeedingTranscripts) {
      try {
        logger.info(`[${completed + 1}/${videosNeedingTranscripts.length}] Preloading: ${video.videoId} - ${video.title}`);
        await transcriptOrchestrationService.preloadTranscript(video.videoId);
        completed++;
        logger.info(`✅ Completed: ${video.videoId}`);
      } catch (error) {
        failed++;
        logger.error(`❌ Failed: ${video.videoId}`, error);
      }
    }

    logger.info(`\n📊 Preload Summary:`);
    logger.info(`   ✅ Completed: ${completed}`);
    logger.info(`   ❌ Failed: ${failed}`);
    logger.info(`   📈 Total: ${videosNeedingTranscripts.length}`);

    process.exit(0);
  } catch (error) {
    logger.error('Fatal error during preload:', error);
    process.exit(1);
  }
}

// Run the script
preloadAllVideos();
