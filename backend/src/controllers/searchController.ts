import { Request, Response } from 'express';
import { Video } from '../models/Video';
import { youtubeScraperService } from '../services/youtubeScraperService';
import { logger } from '../utils/logger';
import { validationResult } from 'express-validator';
import { getRedisClient } from '../config/redis';
import { SearchResult } from '../types/video';
import { videoRepository } from '../repositories/videoRepository';

// ============================================
// STRICT EDUCATIONAL FILTER
// ============================================

// Educational keywords that MUST be present in title (at least one)
const EDUCATIONAL_KEYWORDS = [
  'tutorial', 'explained', 'lecture', 'course', 'lesson', 'learn',
  'introduction', 'guide', 'how to', 'what is', 'understanding',
  'beginner', 'advanced', 'complete', 'full course', 'crash course',
  'algorithm', 'programming', 'coding', 'development', 'engineering',
  'data structure', 'computer science', 'in hindi', 'in urdu', 'in english',
  'step by step', 'example', 'practice', 'solution', 'interview',
  'gate', 'exam', 'mcq', 'question', 'basics', 'fundamentals',
  'network', 'security', 'database', 'web', 'machine learning',
  'part 1', 'part 2', 'part-1', 'part-2', 'chapter', 'module',
  'encryption', 'decryption', 'cryptography', 'protocol',
];

// Non-educational patterns - strictly block these
const BLOCKED_PATTERNS = [
  /\b(official\s*(music\s*)?video|lyric\s*video|audio\s*song)\b/i,
  /\b(full\s*movie|official\s*trailer|teaser|promo)\b/i,
  /\bvevo\b/i,
  /\b(feat\.|ft\.|starring)\b/i,
  /\b(remix|cover|live\s*performance|concert|unplugged)\b/i,
  /\b(episode\s*\d+|s\d+\s*e\d+|ep\s*\d+)\b/i, // TV shows
  /\b(movie|film|drama|series|season)\b/i,
  /\b(song|album|music|singer|artist|band)\b/i,
  /\b(trailer|teaser|behind\s*the\s*scenes)\b/i,
];

/**
 * STRICT filter - only allows educational content
 * Requires at least one educational keyword AND no blocked patterns
 */
function filterEducationalResults(results: SearchResult[]): SearchResult[] {
  return results.filter(result => {
    const title = result.title.toLowerCase();
    const channel = result.channel.toLowerCase();
    
    // Check for blocked patterns - reject immediately
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(title) || pattern.test(channel)) {
        logger.debug(`Blocked non-educational: ${title}`);
        return false;
      }
    }
    
    // MUST have at least one educational keyword
    const hasEducationalKeyword = EDUCATIONAL_KEYWORDS.some(kw => 
      title.includes(kw)
    );
    
    if (!hasEducationalKeyword) {
      logger.debug(`No educational keyword found: ${title}`);
      return false;
    }
    
    return true;
  });
}

// ============================================

export class SearchController {
  private static memoryCache = new Map<string, { data: any; timestamp: number }>();
  private static readonly CACHE_TTL = 600000; // 10 minutes (increased for better hit rate)
  
  // Cleanup old cache entries periodically
  static {
    setInterval(() => {
      const now = Date.now();
      for (const [key, value] of SearchController.memoryCache.entries()) {
        if (now - value.timestamp > SearchController.CACHE_TTL) {
          SearchController.memoryCache.delete(key);
        }
      }
    }, 60000); // Clean every minute
  }

  /**
   * Main search endpoint
   */
  async search(req: Request, res: Response): Promise<void> {
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

      const {
        q: query,
        type = 'video',
        duration,
        upload_date,
        sort_by = 'relevance',
        limit = 20
      } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Search query is required'
        });
        return;
      }

      // Runtime flags
      const useDb = (process.env.USE_DB || 'false').toLowerCase() === 'true';
      const cacheKey = `search:${query}:${type}:${duration}:${upload_date}:${sort_by}:${limit}`;
      
      // Check memory cache first (fastest)
      const memoryCached = SearchController.memoryCache.get(cacheKey);
      if (memoryCached && (Date.now() - memoryCached.timestamp) < SearchController.CACHE_TTL) {
        logger.info(`Memory cache hit for query: ${query}`);
        res.json({
          success: true,
          data: memoryCached.data,
          cached: true
        });
        return;
      }
      
      try {
        const redisClient = getRedisClient();
        if (redisClient) {
          const cachedResults = await redisClient.get(cacheKey);
          
          if (cachedResults) {
            const parsedResults = JSON.parse(cachedResults);
            // Store in memory cache for faster subsequent access
            SearchController.memoryCache.set(cacheKey, {
              data: parsedResults,
              timestamp: Date.now()
            });
            res.json({
              success: true,
              data: parsedResults,
              cached: true
            });
            return;
          }
        }
      } catch (cacheError) {
        logger.warn('Redis cache error:', cacheError);
      }

      // For speed, skip database and go straight to scraping
      // (Database queries can add 100-500ms latency)
      const skipDb = (process.env.SKIP_DB_ON_SEARCH || 'true').toLowerCase() === 'true';
      
      let dbResults: any[] = [];
      if (useDb && !skipDb) {
        dbResults = await this.searchInDatabase(query, {
          sortBy: sort_by as string,
          limit: Number(limit)
        });

        if (dbResults.length >= Number(limit)) {
          const results = {
            videos: dbResults,
            total: dbResults.length,
            source: 'database',
            query
          };

          // Cache and return
          SearchController.memoryCache.set(cacheKey, {
            data: results,
            timestamp: Date.now()
          });

          try {
            const redisClient = getRedisClient();
            if (redisClient) {
              await redisClient.setEx(cacheKey, 1800, JSON.stringify(results));
            }
          } catch (cacheError) {
            logger.warn('Redis cache set error:', cacheError);
          }

          res.json({ success: true, data: results });
          return;
        }
      }

      // Search YouTube directly for fastest results
      const startScrape = Date.now();
      let youtubeResults: SearchResult[] = [];
      try {
        youtubeResults = await youtubeScraperService.searchEducationalVideos(query, {
          duration: duration as any,
          uploadDate: upload_date as any,
          sortBy: sort_by as any
        }, Number(limit));
      } catch (scrapeErr: any) {
        logger.warn(`YouTube scraping failed: ${scrapeErr?.message?.slice(0, 120)}`);
      }
      
      // Apply fast educational filter (removes music, movies, etc.)
      const filteredResults = filterEducationalResults(youtubeResults);
      
      logger.info(`YouTube scraping took ${Date.now() - startScrape}ms, filtered ${youtubeResults.length} -> ${filteredResults.length}`);

      // Fallback: if YouTube scraping returned 0, search PostgreSQL
      let aggregatedResults = filteredResults;
      let source = 'youtube';

      if (aggregatedResults.length === 0) {
        logger.info(`YouTube returned 0, falling back to PostgreSQL search for: ${query}`);
        try {
          const pgResults = await videoRepository.searchVideos(query as string, {}, Number(limit));
          if (pgResults.length > 0) {
            aggregatedResults = pgResults.map(v => ({
              videoId: v.videoId,
              title: v.metadata?.title || '',
              channel: v.metadata?.channel || '',
              description: v.metadata?.description || '',
              thumbnail: v.metadata?.thumbnail || `https://img.youtube.com/vi/${v.videoId}/maxresdefault.jpg`,
              duration: v.metadata?.duration || '',
              views: v.metadata?.views || '0',
              uploadTime: v.metadata?.uploadDate || '',
              url: `https://www.youtube.com/watch?v=${v.videoId}`,
            }));
            source = 'database';
            logger.info(`PostgreSQL fallback returned ${aggregatedResults.length} results`);
          }
        } catch (dbErr: any) {
          logger.warn(`PostgreSQL search fallback failed: ${dbErr?.message?.slice(0, 120)}`);
        }
      }

      const newVideosProcessed = 0;

      const results = {
        videos: aggregatedResults,
        total: aggregatedResults.length,
        source,
        query,
        newVideosProcessed
      };

      // Cache results in both memory and Redis
      SearchController.memoryCache.set(cacheKey, {
        data: results,
        timestamp: Date.now()
      });
      
      try {
        const redisClient = getRedisClient();
        if (redisClient) {
          await redisClient.setEx(cacheKey, 1800, JSON.stringify(results));
        }
      } catch (cacheError) {
        logger.warn('Redis cache set error:', cacheError);
      }

      res.json({
        success: true,
        data: results
      });

    } catch (error) {
      logger.error('Error in search:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: process.env.NODE_ENV === 'development' ? error : undefined
      });
    }
  }

  /**
   * Get search suggestions
   */
  async getSuggestions(req: Request, res: Response): Promise<void> {
    try {
      const { q: query } = req.query;

      if (!query || typeof query !== 'string') {
        res.status(400).json({
          success: false,
          message: 'Query parameter is required'
        });
        return;
      }

      // Get suggestions from database based on existing video titles
      const suggestions = await Video.aggregate([
        {
          $match: {
            $or: [
              { 'metadata.title': { $regex: query, $options: 'i' } },
              { searchKeywords: { $regex: query, $options: 'i' } }
            ]
          }
        },
        {
          $group: {
            _id: null,
            titles: { $addToSet: '$metadata.title' },
            keywords: { $addToSet: { $arrayElemAt: ['$searchKeywords', 0] } }
          }
        },
        {
          $project: {
            suggestions: {
              $slice: [
                {
                  $setUnion: [
                    { $slice: ['$titles', 5] },
                    { $slice: ['$keywords', 5] }
                  ]
                },
                10
              ]
            }
          }
        }
      ]);

      const suggestionList = suggestions.length > 0 ? suggestions[0].suggestions : [];

      // Add some popular educational topics if no suggestions found
      if (suggestionList.length === 0) {
        const popularTopics = [
          'machine learning tutorial',
          'web development course',
          'data structures algorithms',
          'python programming',
          'javascript fundamentals',
          'react tutorial',
          'calculus basics',
          'physics explained',
          'chemistry lab',
          'biology concepts'
        ].filter(topic => topic.toLowerCase().includes(query.toLowerCase()));

        suggestionList.push(...popularTopics.slice(0, 5));
      }

      res.json({
        success: true,
        data: {
          query,
          suggestions: suggestionList
        }
      });

    } catch (error) {
      logger.error('Error in getSuggestions:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get trending topics
   */
  async getTrendingTopics(req: Request, res: Response): Promise<void> {
    try {
      const cacheKey = 'trending:topics';
      
      try {
        const redisClient = getRedisClient();
        if (redisClient) {
          const cachedTopics = await redisClient.get(cacheKey);
          
          if (cachedTopics) {
            res.json({
              success: true,
              data: JSON.parse(cachedTopics),
              cached: true
            });
            return;
          }
        }
      } catch (cacheError) {
        logger.warn('Redis cache error:', cacheError);
      }

      // Get trending topics based on most common subjects and keywords
      const trendingTopics = await Video.aggregate([
        { $match: { isEducational: true, qualityScore: { $gte: 6 } } },
        { $unwind: '$searchKeywords' },
        {
          $group: {
            _id: '$searchKeywords',
            count: { $sum: 1 },
            avgQuality: { $avg: '$qualityScore' },
            subjects: { $addToSet: '$subject' }
          }
        },
        { $match: { count: { $gte: 3 } } },
        { $sort: { count: -1, avgQuality: -1 } },
        { $limit: 20 },
        {
          $project: {
            topic: '$_id',
            popularity: '$count',
            quality: { $round: ['$avgQuality', 1] },
            subjects: 1,
            _id: 0
          }
        }
      ]);

      const topics = {
        trending: trendingTopics,
        subjects: await this.getSubjectStats(),
        generatedAt: new Date()
      };

      // Cache for 1 hour (if Redis is available)
      try {
        const redisClient = getRedisClient();
        if (redisClient) {
          await redisClient.setEx(cacheKey, 3600, JSON.stringify(topics));
        }
      } catch (cacheError) {
        logger.warn('Redis cache set error:', cacheError);
      }

      res.json({
        success: true,
        data: topics
      });

    } catch (error) {
      logger.error('Error in getTrendingTopics:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Get available subjects
   */
  async getSubjects(req: Request, res: Response): Promise<void> {
    try {
      const subjects = await this.getSubjectStats();

      res.json({
        success: true,
        data: { subjects }
      });

    } catch (error) {
      logger.error('Error in getSubjects:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  }

  /**
   * Search in database
   */
  private async searchInDatabase(query: string, options: { sortBy: string; limit: number }) {
    const escapeRegex = (input: string) => input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const keywordRegexes = query
      .split(/\s+/)
      .filter(Boolean)
      .map(word => new RegExp(escapeRegex(word), 'i'));

    // Preferred query using $text (must be mutable for Mongoose filter typing)
    const textQuery: any = {
      $and: [
        { isEducational: true },
        {
          $or: [
            { $text: { $search: query } },
            { 'metadata.title': { $regex: query, $options: 'i' } },
            { 'metadata.description': { $regex: query, $options: 'i' } },
            { searchKeywords: { $in: keywordRegexes } }
          ]
        }
      ]
    };

    // Fallback query without $text (when text index is missing)
    const regexOnlyQuery: any = {
      $and: [
        { isEducational: true },
        {
          $or: [
            { 'metadata.title': { $regex: query, $options: 'i' } },
            { 'metadata.description': { $regex: query, $options: 'i' } },
            { searchKeywords: { $in: keywordRegexes } }
          ]
        }
      ]
    };

    let sortQuery: any = { score: { $meta: 'textScore' }, qualityScore: -1 };
    switch (options.sortBy) {
      case 'date':
        sortQuery = { createdAt: -1 };
        break;
      case 'views':
        sortQuery = { 'metadata.views': -1 };
        break;
      case 'rating':
        sortQuery = { qualityScore: -1 };
        break;
    }

    try {
      return await Video.find(textQuery)
        .sort(sortQuery)
        .limit(options.limit)
        .select('-transcript');
    } catch (err: any) {
      // Handle missing text index (Mongo code 291) by retrying without $text
      if (err && (err.code === 291 || /NoQueryExecutionPlans/i.test(String(err)))) {
        return await Video.find(regexOnlyQuery)
          .sort({ qualityScore: -1, createdAt: -1 })
          .limit(options.limit)
          .select('-transcript');
      }
      throw err;
    }
  }

  /**
   * Process YouTube search results
   */
  private async processYouTubeResults(youtubeResults: any[], limit: number) {
    const processedVideos = [];
    
    for (const result of youtubeResults.slice(0, limit)) {
      try {
        // Check if video already exists
        const existingVideo = await Video.findOne({ videoId: result.videoId });
        if (existingVideo) {
          processedVideos.push(existingVideo);
          continue;
        }

        // Get detailed metadata and transcript
        const [metadata, transcript] = await Promise.all([
          youtubeScraperService.getVideoMetadata(result.videoId),
          youtubeScraperService.getVideoTranscript(result.videoId).catch(() => [])
        ]);

        // Determine subject and quality
        const subject = this.determineSubject(metadata.title, metadata.description);
        const qualityScore = this.calculateQualityScore(metadata, transcript);

        const video = new Video({
          videoId: result.videoId,
          metadata,
          transcript,
          subject,
          difficulty: this.determineDifficulty(metadata.title, metadata.description),
          qualityScore,
          isEducational: qualityScore >= 5
        });

        await video.save();
        processedVideos.push(video);

      } catch (error) {
        logger.error(`Error processing YouTube result ${result.videoId}:`, error);
      }
    }

    return processedVideos;
  }

  /**
   * Get subject statistics
   */
  private async getSubjectStats() {
    return Video.aggregate([
      { $match: { isEducational: true } },
      {
        $group: {
          _id: '$subject',
          count: { $sum: 1 },
          avgQuality: { $avg: '$qualityScore' }
        }
      },
      { $sort: { count: -1 } },
      {
        $project: {
          subject: '$_id',
          videoCount: '$count',
          averageQuality: { $round: ['$avgQuality', 1] },
          _id: 0
        }
      }
    ]);
  }

  /**
   * Helper methods (similar to VideoController)
   */
  private determineSubject(title: string, description: string): string {
    const content = `${title} ${description}`.toLowerCase();
    
    const subjects = {
      'Computer Science': ['programming', 'coding', 'software', 'algorithm', 'data structure', 'javascript', 'python', 'java', 'react', 'nodejs', 'web development', 'machine learning', 'ai'],
      'Mathematics': ['math', 'calculus', 'algebra', 'geometry', 'statistics', 'probability'],
      'Physics': ['physics', 'quantum', 'mechanics', 'thermodynamics', 'electricity'],
      'Chemistry': ['chemistry', 'chemical', 'molecule', 'atom', 'reaction'],
      'Biology': ['biology', 'cell', 'dna', 'genetics', 'evolution'],
      'Engineering': ['engineering', 'mechanical', 'electrical', 'civil'],
      'Business': ['business', 'marketing', 'finance', 'management'],
      'Economics': ['economics', 'economy', 'market', 'trade'],
    };

    for (const [subject, keywords] of Object.entries(subjects)) {
      if (keywords.some(keyword => content.includes(keyword))) {
        return subject;
      }
    }

    return 'Other';
  }

  private determineDifficulty(title: string, description: string): 'beginner' | 'intermediate' | 'advanced' {
    const content = `${title} ${description}`.toLowerCase();
    
    if (content.includes('beginner') || content.includes('intro') || content.includes('basic')) {
      return 'beginner';
    }
    
    if (content.includes('advanced') || content.includes('expert') || content.includes('master')) {
      return 'advanced';
    }
    
    return 'intermediate';
  }

  private calculateQualityScore(metadata: any, transcript: any[]): number {
    let score = 5;

    if (metadata.title.length > 20 && metadata.title.length < 100) score += 1;
    if (metadata.description.length > 100) score += 1;
    if (transcript.length > 0) score += 2;

    const views = parseInt(metadata.views.replace(/[^\d]/g, '')) || 0;
    if (views > 10000) score += 1;
    if (views > 100000) score += 1;

    return Math.min(10, Math.max(0, score));
  }
}

export const searchController = new SearchController();
