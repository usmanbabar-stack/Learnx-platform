import { Request, Response } from 'express';
import { videoRepository, getSummaryByVideoId, saveSummary, getGlossaryByVideoId, saveGlossary } from '../repositories/videoRepository';
import { logger } from '../utils/logger';
import { validationResult } from 'express-validator';
import { getRedisClient } from '../config/redis';
import { summaryService } from '../services/summaryService';
import { glossaryService } from '../services/glossaryService';
import { flashcardService } from '../services/flashcardService';

interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export class TranscriptController {
  /**
   * Get video transcript
   */
  async getTranscript(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { videoId } = req.params;
      const { format = 'json', timestamps = 'true' } = req.query;

      // Check cache first
      const cacheKey = `transcript:${videoId}:${format}:${timestamps}`;
      try {
        const redisClient = getRedisClient();
        const cachedTranscript = await redisClient?.get(cacheKey);
        
        if (cachedTranscript) {
          res.json({
            success: true,
            data: JSON.parse(cachedTranscript),
            cached: true
          });
          return;
        }
      } catch (cacheError) {
        logger.warn('Redis cache error:', cacheError);
      }

      // Get transcript from PostgreSQL
      const transcript = await videoRepository.getTranscriptByVideoId(videoId);
      
      if (!transcript || transcript.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Transcript not available or still processing',
          status: 'transcript_pending'
        });
        return;
      }

      // Format transcript based on request
      let formattedTranscript;
      
      if (format === 'text') {
        formattedTranscript = {
          videoId,
          text: transcript.map((item: TranscriptSegment) => item.text).join(' '),
          wordCount: transcript.reduce((count: number, item: TranscriptSegment) => count + item.text.split(' ').length, 0)
        };
      } else if (format === 'srt') {
        formattedTranscript = {
          videoId,
          srt: this.convertToSRT(transcript)
        };
      } else {
        // Default JSON format
        formattedTranscript = {
          videoId,
          transcript: timestamps === 'true' ? transcript : transcript.map((item: TranscriptSegment) => ({ text: item.text })),
          totalDuration: transcript.length > 0 ? transcript[transcript.length - 1].start + transcript[transcript.length - 1].duration : 0,
          segmentCount: transcript.length
        };
      }

      // Cache the result
      try {
        const redisClient = getRedisClient();
        await redisClient?.setEx(cacheKey, 3600, JSON.stringify(formattedTranscript)); // Cache for 1 hour
      } catch (cacheError) {
        logger.warn('Redis cache set error:', cacheError);
      }

      res.json({
        success: true,
        data: formattedTranscript
      });

    } catch (error) {
      logger.error('Error in getTranscript:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Search within video transcript
   */
  async searchTranscript(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { videoId } = req.params;
      const { query } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
        return;
      }

      // Get transcript from PostgreSQL
      const transcript = await videoRepository.getTranscriptByVideoId(videoId);
      
      if (!transcript || transcript.length === 0) {
        res.status(404).json({
          success: false,
          message: 'No transcript available for this video'
        });
        return;
      }

      // Search transcript segments
      const searchResults = transcript
        .map((segment: TranscriptSegment, index: number) => ({
          ...segment,
          index,
          relevanceScore: this.calculateRelevanceScore(segment.text, query)
        }))
        .filter((segment: any) => segment.relevanceScore > 0)
        .sort((a: any, b: any) => b.relevanceScore - a.relevanceScore)
        .slice(0, 20); // Limit to top 20 results

      // Add context (previous and next segments)
      const resultsWithContext = searchResults.map((result: any) => {
        const contextBefore = result.index > 0 ? transcript[result.index - 1] : null;
        const contextAfter = result.index < transcript.length - 1 ? transcript[result.index + 1] : null;

        return {
          segment: {
            text: result.text,
            start: result.start,
            duration: result.duration
          },
          context: {
            before: contextBefore,
            after: contextAfter
          },
          relevanceScore: result.relevanceScore,
          timestamp: this.formatTimestamp(result.start)
        };
      });

      res.json({
        success: true,
        data: {
          videoId,
          query,
          results: resultsWithContext,
          totalMatches: resultsWithContext.length
        }
      });

    } catch (error) {
      logger.error('Error in searchTranscript:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Generate transcript summary
   * CACHING STRATEGY:
   * 1. Check PostgreSQL (permanent cache - shared across all users)
   * 2. If not found, generate with LLM and save to PostgreSQL
   * 3. Redis used only for short-term session cache
   */
  async generateSummary(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { videoId } = req.params;

      // 1. CHECK POSTGRESQL FIRST (permanent cache - shared for all users)
      try {
        const savedSummary = await getSummaryByVideoId(videoId);
        // Only use cached summary if it has actual content (not a failed generation)
        const hasValidContent = savedSummary && 
          savedSummary.overview && savedSummary.overview.length > 0 &&
          savedSummary.keyPoints && savedSummary.keyPoints.length > 0;
        
        if (hasValidContent) {
          logger.info(`Returning cached summary from PostgreSQL for ${videoId}`);
          
          // Get video metadata for response
          const video = await videoRepository.findByVideoId(videoId);
          
          res.json({
            success: true,
            data: {
              ...savedSummary,
              title: (video as any)?.metadata?.title || videoId,
              channel: (video as any)?.metadata?.channel,
              cached: true,
              cacheSource: 'database'
            }
          });
          return;
        } else if (savedSummary) {
          logger.info(`Found cached summary with empty content for ${videoId}, will regenerate`);
        }
      } catch (dbError) {
        logger.warn('PostgreSQL summary lookup error:', dbError);
        // Continue to generate if DB lookup fails
      }

      // 2. Get video from PostgreSQL
      const video = await videoRepository.findByVideoId(videoId);
      if (!video) {
        res.status(404).json({
          success: false,
          message: 'Video not found'
        });
        return;
      }

      // 3. Get transcript from PostgreSQL
      const transcript = await videoRepository.getTranscriptByVideoId(videoId);
      if (!transcript || transcript.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Transcript not ready. Please wait for transcript processing to complete.',
          status: 'transcript_pending'
        });
        return;
      }

      // 4. Generate with LLM (only if not in database)
      logger.info(`Generating AI summary for video: ${videoId} (${transcript.length} segments)`);
      const startTime = Date.now();
      
      const aiSummary = await summaryService.generateComprehensiveSummary(
        transcript,
        (video as any).metadata?.title || 'Educational Video',
        (video as any).metadata?.channel
      );

      const generationTimeMs = Date.now() - startTime;
      
      // 5. SAVE TO POSTGRESQL (only if summary has actual content - don't cache failures!)
      const hasValidSummary = aiSummary.overview && aiSummary.overview.length > 0 &&
        aiSummary.keyPoints && aiSummary.keyPoints.length > 0;
      
      if (hasValidSummary) {
        try {
          await saveSummary({
            videoId,
            overview: aiSummary.overview,
            keyPoints: aiSummary.keyPoints,
            mainTopics: aiSummary.mainTopics,
            keyTimestamps: aiSummary.keyTimestamps,
            targetAudience: aiSummary.targetAudience,
            difficulty: aiSummary.difficulty,
            estimatedWatchTime: aiSummary.estimatedWatchTime,
            generationTimeMs
          });
        } catch (saveError) {
          logger.warn('Failed to save summary to PostgreSQL:', saveError);
          // Continue anyway - we can return the generated summary
        }
      } else {
        logger.warn(`Summary generation returned empty content for ${videoId} - NOT caching failure`);
      }

      const summaryData = {
        videoId,
        title: (video as any).metadata?.title,
        channel: (video as any).metadata?.channel,
        ...aiSummary,
        originalSegments: transcript.length,
        generatedAt: new Date().toISOString(),
        generationTimeMs,
        cached: false
      };

      logger.info(`Summary generated in ${generationTimeMs}ms for ${videoId}`);

      res.json({
        success: true,
        data: summaryData
      });

    } catch (error) {
      logger.error('Error in generateSummary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate summary. Please try again.'
      });
    }
  }

  /**
   * Generate glossary from transcript
   * CACHING STRATEGY:
   * 1. Check PostgreSQL (permanent cache - shared across all users)
   * 2. If not found, generate with LLM and save to PostgreSQL
   */
  async generateGlossary(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { videoId } = req.params;
      const forceRegenerate = req.query.regenerate === 'true';

      // 1. CHECK POSTGRESQL FIRST (permanent cache - shared for all users)
      // Skip cache if force regenerate is requested
      if (!forceRegenerate) {
        try {
          const savedGlossary = await getGlossaryByVideoId(videoId);
          // Only use cached glossary if it actually has terms (not a failed generation)
          if (savedGlossary && savedGlossary.totalTerms > 0) {
            logger.info(`Returning cached glossary from PostgreSQL for ${videoId}`);
            
            // Get video metadata for response
            const video = await videoRepository.findByVideoId(videoId);
            
            res.json({
              success: true,
              data: {
                ...savedGlossary,
                title: (video as any)?.metadata?.title,
                channel: (video as any)?.metadata?.channel,
                cached: true,
                cacheSource: 'database'
              }
            });
            return;
          } else if (savedGlossary && savedGlossary.totalTerms === 0) {
            logger.info(`Found cached glossary with 0 terms for ${videoId}, will regenerate`);
          }
        } catch (dbError) {
          logger.warn('PostgreSQL glossary lookup error:', dbError);
          // Continue to generate if DB lookup fails
        }
      } else {
        logger.info(`Force regenerating glossary for ${videoId}`);
      }

      // 2. Get video from PostgreSQL
      const video = await videoRepository.findByVideoId(videoId);
      if (!video) {
        res.status(404).json({
          success: false,
          message: 'Video not found'
        });
        return;
      }

      // 3. Get transcript from PostgreSQL
      const transcript = await videoRepository.getTranscriptByVideoId(videoId);
      if (!transcript || transcript.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Transcript not ready. Please wait for transcript processing to complete.',
          status: 'transcript_pending'
        });
        return;
      }

      // 4. Generate with LLM (only if not in database)
      logger.info(`Generating AI glossary for video: ${videoId} (${transcript.length} segments)`);
      const startTime = Date.now();
      
      const glossary = await glossaryService.generateGlossary(
        transcript,
        videoId,
        (video as any).metadata?.title || 'Educational Video'
      );

      const generationTimeMs = Date.now() - startTime;

      // 5. SAVE TO POSTGRESQL (only if glossary has actual content - don't cache failures!)
      if (glossary.totalTerms > 0) {
        try {
          await saveGlossary({
            videoId,
            terms: glossary.terms,
            categories: glossary.categories,
            totalTerms: glossary.totalTerms,
            generationTimeMs
          });
        } catch (saveError) {
          logger.warn('Failed to save glossary to PostgreSQL:', saveError);
          // Continue anyway - we can return the generated glossary
        }
      } else {
        logger.warn(`Glossary generation returned 0 terms for ${videoId} - NOT caching failure`);
      }

      const glossaryData = {
        ...glossary,
        title: (video as any).metadata?.title,
        channel: (video as any).metadata?.channel,
        generationTimeMs,
        cached: false
      };

      logger.info(`Glossary generated in ${generationTimeMs}ms: ${glossary.totalTerms} terms`);

      res.json({
        success: true,
        data: glossaryData
      });

    } catch (error) {
      logger.error('Error in generateGlossary:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate glossary. Please try again.'
      });
    }
  }

  /**
   * Generate flashcards from transcript
   */
  async generateFlashcards(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          success: false,
          message: 'Validation errors',
          errors: errors.array()
        });
        return;
      }

      const { videoId } = req.params;
      const cardCount = parseInt(req.query.count as string) || 10;

      // Limit card count to reasonable range
      const limitedCount = Math.min(Math.max(cardCount, 5), 20);

      // Get video from PostgreSQL
      const video = await videoRepository.findByVideoId(videoId);
      if (!video) {
        res.status(404).json({
          success: false,
          message: 'Video not found'
        });
        return;
      }

      // Get transcript from PostgreSQL
      const transcript = await videoRepository.getTranscriptByVideoId(videoId);
      if (!transcript || transcript.length === 0) {
        res.status(404).json({
          success: false,
          message: 'Transcript not ready. Please wait for transcript processing to complete.',
          status: 'transcript_pending'
        });
        return;
      }

      // Generate flashcards with LLM
      logger.info(`Generating flashcards for video: ${videoId} (${limitedCount} cards)`);
      const startTime = Date.now();

      const flashcards = await flashcardService.generateFlashcards(
        transcript,
        videoId,
        (video as any).metadata?.title || 'Educational Video',
        limitedCount
      );

      const generationTimeMs = Date.now() - startTime;

      const flashcardData = {
        ...flashcards,
        generationTimeMs,
        cached: false
      };

      logger.info(`Flashcards generated in ${generationTimeMs}ms: ${flashcards.totalCards} cards`);

      res.json({
        success: true,
        data: flashcardData
      });

    } catch (error) {
      logger.error('Error in generateFlashcards:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to generate flashcards. Please try again.'
      });
    }
  }

  /**
   * Convert transcript to SRT format
   */
  private convertToSRT(transcript: TranscriptSegment[]): string {
    return transcript
      .map((segment, index) => {
        const startTime = this.formatSRTTimestamp(segment.start);
        const endTime = this.formatSRTTimestamp(segment.start + segment.duration);
        
        return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}\n`;
      })
      .join('\n');
  }

  /**
   * Format timestamp for SRT
   */
  private formatSRTTimestamp(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 1000);

    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Format timestamp for display
   */
  private formatTimestamp(seconds: number): string {
    const minutes = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Calculate relevance score for search
   */
  private calculateRelevanceScore(text: string, query: string): number {
    const textLower = text.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(' ').filter(word => word.length > 2);

    let score = 0;

    // Exact phrase match
    if (textLower.includes(queryLower)) {
      score += 10;
    }

    // Individual word matches
    queryWords.forEach(word => {
      if (textLower.includes(word)) {
        score += 3;
      }
    });

    // Word proximity bonus
    if (queryWords.length > 1) {
      const words = textLower.split(' ');
      let minDistance = Infinity;
      
      for (let i = 0; i < words.length; i++) {
        for (let j = i + 1; j < words.length; j++) {
          if (queryWords.includes(words[i]) && queryWords.includes(words[j])) {
            minDistance = Math.min(minDistance, j - i);
          }
        }
      }
      
      if (minDistance < 5) {
        score += 5 - minDistance;
      }
    }

    return score;
  }
}

export const transcriptController = new TranscriptController();
