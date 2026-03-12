import { logger } from '../utils/logger';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TranscriptSegment } from './transcriptOrchestrationService';

// Use GOOGLE_API_KEY for quiz generation (shared with flashcards)
function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_QUIZ || process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('Missing Gemini API key. Set GOOGLE_API_KEY in .env');
  }
  return key;
}

// Always create fresh client to pick up any API key changes
function getClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(getApiKey());
}

// Use gemini-3-flash-preview for quiz generation, with fallback
const MODELS_TO_TRY = ['gemini-3-flash-preview', 'gemini-2.5-flash', 'gemini-3.1-flash-lite-preview'];

// Limit transcript size to reduce token usage
const MAX_TRANSCRIPT_CHARS = 25000;

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctAnswer: number; // Index of correct option (0-based)
  explanation: string;
  difficulty: 'easy' | 'medium' | 'hard';
  category: string;
  timestamp?: string;
}

export interface Quiz {
  videoId: string;
  videoTitle: string;
  questions: QuizQuestion[];
  totalQuestions: number;
  categories: string[];
  generatedAt: string;
}

export class QuizService {
  private static instance: QuizService;
  private cache: Map<string, Quiz> = new Map();
  // Track in-flight requests to prevent duplicate API calls
  private inFlightRequests: Map<string, Promise<Quiz>> = new Map();

  private constructor() {}

  static getInstance(): QuizService {
    if (!QuizService.instance) {
      QuizService.instance = new QuizService();
    }
    return QuizService.instance;
  }

  async generateQuiz(
    transcript: TranscriptSegment[],
    videoId: string,
    videoTitle: string,
    questionCount: number = 10
  ): Promise<Quiz> {
    // Check cache first
    const cacheKey = `${videoId}-${questionCount}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.info(`Returning cached quiz for ${videoId}`);
      return cached;
    }

    // If request is already in-flight, return the same promise (deduplication)
    if (this.inFlightRequests.has(cacheKey)) {
      logger.info(`Quiz request already in-flight for ${videoId}, returning existing promise`);
      return this.inFlightRequests.get(cacheKey)!;
    }

    // Create the actual request promise
    const requestPromise = this.doGenerateQuiz(transcript, videoId, videoTitle, questionCount, cacheKey);
    this.inFlightRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      this.cache.set(cacheKey, result);
      return result;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  private async doGenerateQuiz(
    transcript: TranscriptSegment[],
    videoId: string,
    videoTitle: string,
    questionCount: number,
    cacheKey: string
  ): Promise<Quiz> {
    if (!transcript || transcript.length === 0) {
      throw new Error('Cannot generate quiz: transcript is empty');
    }

    const fullText = this.prepareTranscriptWithTimestamps(transcript);
    const wordCount = fullText.split(' ').length;

    logger.info(`Generating ${questionCount} quiz questions for "${videoTitle}": ${wordCount} words`);

    const prompt = `You are an educational assessment expert. Create ${questionCount} multiple-choice quiz questions from this video transcript to test understanding.

VIDEO: ${videoTitle}

TRANSCRIPT:
${fullText.slice(0, MAX_TRANSCRIPT_CHARS)}

Generate exactly ${questionCount} multiple-choice questions. Each question should:
1. Test a key concept or important detail from the video
2. Have 4 options (A, B, C, D)
3. Have exactly ONE correct answer
4. Include a clear explanation of why the answer is correct
5. Be categorized by topic
6. Be assigned a difficulty level
7. Include a timestamp reference where possible

Output strict JSON:
{
  "questions": [
    {
      "question": "What is...",
      "options": ["Option A", "Option B", "Option C", "Option D"],
      "correctAnswer": 0,
      "explanation": "The correct answer is A because...",
      "difficulty": "easy" | "medium" | "hard",
      "category": "Topic Name",
      "timestamp": "MM:SS (optional - time in video where this is discussed)"
    }
  ]
}

Requirements:
- Make questions clear and unambiguous
- Ensure all options are plausible but only one is correct
- Mix difficulty levels appropriately
- Cover different topics from the video
- Provide educational explanations
- correctAnswer must be the index (0-3) of the correct option in the options array`;

    try {
      for (const modelName of MODELS_TO_TRY) {
        try {
          logger.info(`Quiz: Using ${modelName}`);

          const genAI = getClient();
          const model = genAI.getGenerativeModel({ model: modelName });

          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.5,
              topP: 0.9,
              maxOutputTokens: 8192,
            },
          });

          const text = result.response.text();

          logger.info(`Gemini raw response length for quiz: ${text?.length || 0}`);

          if (!text || text.trim().length === 0) {
            logger.warn(`${modelName} returned empty response for quiz`);
            continue; // Try next model
          }

          // Extract JSON from response
          let jsonStr = text.trim();
          if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.slice(7);
          } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.slice(3);
          }
          if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.slice(0, -3);
          }
          jsonStr = jsonStr.trim();

          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (parseError) {
            logger.error(`Quiz JSON parse failed with ${modelName}, raw text:`, jsonStr.slice(0, 500));
            continue; // Try next model
          }

          const questions: QuizQuestion[] = (parsed.questions || []).map((q: any, index: number) => ({
            id: `q-${index + 1}`,
            question: q.question || 'Question not available',
            options: Array.isArray(q.options) && q.options.length === 4 
              ? q.options 
              : ['Option A', 'Option B', 'Option C', 'Option D'],
            correctAnswer: typeof q.correctAnswer === 'number' && q.correctAnswer >= 0 && q.correctAnswer < 4
              ? q.correctAnswer
              : 0,
            explanation: q.explanation || 'Explanation not available',
            difficulty: this.validateDifficulty(q.difficulty),
            category: q.category || 'General',
            timestamp: q.timestamp || undefined,
          }));

          // Extract unique categories
          const categories = [...new Set(questions.map(q => q.category))];

          const quiz: Quiz = {
            videoId,
            videoTitle,
            questions,
            totalQuestions: questions.length,
            categories,
            generatedAt: new Date().toISOString(),
          };

          logger.info(`Successfully generated ${questions.length} quiz questions with ${categories.length} categories`);
          return quiz;

        } catch (modelError: any) {
          logger.warn(`Quiz: ${modelName} failed: ${modelError.message}`);
          continue; // Try next model
        }
      }

      // All models failed
      logger.error('Quiz generation: all models failed');
      return this.getFallbackQuiz(videoId, videoTitle, questionCount);

    } catch (error: any) {
      logger.error('Quiz generation failed:', {
        error: error.message,
        videoId,
      });
      
      // Return fallback quiz on error
      return this.getFallbackQuiz(videoId, videoTitle, questionCount);
    }
  }

  private validateDifficulty(difficulty: any): 'easy' | 'medium' | 'hard' {
    const valid = ['easy', 'medium', 'hard'];
    return valid.includes(difficulty) ? difficulty : 'medium';
  }

  private prepareTranscriptWithTimestamps(segments: TranscriptSegment[]): string {
    // Include timestamps for better context and timestamp generation
    return segments
      .map(seg => {
        const minutes = Math.floor(seg.start / 60);
        const seconds = Math.floor(seg.start % 60);
        const timestamp = `[${minutes}:${seconds.toString().padStart(2, '0')}]`;
        return `${timestamp} ${seg.text}`;
      })
      .join(' ');
  }

  private getFallbackQuiz(videoId: string, videoTitle: string, questionCount: number): Quiz {
    logger.warn('Returning fallback quiz due to generation failure');
    
    const fallbackQuestions: QuizQuestion[] = Array.from({ length: Math.min(questionCount, 3) }, (_, i) => ({
      id: `fallback-q-${i + 1}`,
      question: `Question ${i + 1} about the content in "${videoTitle}"`,
      options: [
        'This is a placeholder option',
        'Quiz generation encountered an error',
        'Please try again later',
        'Contact support if the issue persists'
      ],
      correctAnswer: 0,
      explanation: 'This is a fallback quiz. The AI service was unable to generate questions at this time.',
      difficulty: 'medium' as const,
      category: 'General',
    }));

    return {
      videoId,
      videoTitle,
      questions: fallbackQuestions,
      totalQuestions: fallbackQuestions.length,
      categories: ['General'],
      generatedAt: new Date().toISOString(),
    };
  }

  clearCache(videoId?: string): void {
    if (videoId) {
      // Clear all cache entries for this video (different question counts)
      const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(videoId));
      keysToDelete.forEach(key => this.cache.delete(key));
      logger.info(`Cleared quiz cache for video ${videoId}`);
    } else {
      this.cache.clear();
      logger.info('Cleared entire quiz cache');
    }
  }
}

export const quizService = QuizService.getInstance();
