import { logger } from '../utils/logger';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TranscriptSegment } from './transcriptOrchestrationService';

// Use GOOGLE_API_KEY for flashcard generation (shared with chatbot - has quota available)
function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FLASHCARD || process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('Missing Gemini API key. Set GOOGLE_API_KEY in .env');
  }
  return key;
}

// Always create fresh client to pick up any API key changes
function getClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(getApiKey());
}

// Use gemma-3-12b for flashcards - 10 RPM, 14k RPD quota
// Only 1 API call per video for flashcards
const MODEL_NAME = 'gemma-3-12b-it';

// Limit transcript size to reduce token usage
const MAX_TRANSCRIPT_CHARS = 25000;

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  category: string;
  difficulty: 'easy' | 'medium' | 'hard';
  timestamp?: string;
}

export interface FlashcardDeck {
  videoId: string;
  videoTitle: string;
  cards: Flashcard[];
  totalCards: number;
  categories: string[];
  generatedAt: string;
}

export class FlashcardService {
  private static instance: FlashcardService;
  private cache: Map<string, FlashcardDeck> = new Map();
  // Track in-flight requests to prevent duplicate API calls
  private inFlightRequests: Map<string, Promise<FlashcardDeck>> = new Map();

  private constructor() {}

  static getInstance(): FlashcardService {
    if (!FlashcardService.instance) {
      FlashcardService.instance = new FlashcardService();
    }
    return FlashcardService.instance;
  }

  async generateFlashcards(
    transcript: TranscriptSegment[],
    videoId: string,
    videoTitle: string,
    cardCount: number = 10
  ): Promise<FlashcardDeck> {
    // Check cache first
    const cacheKey = `${videoId}-${cardCount}`;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      logger.info(`Returning cached flashcards for ${videoId}`);
      return cached;
    }

    // If request is already in-flight, return the same promise (deduplication)
    if (this.inFlightRequests.has(cacheKey)) {
      logger.info(`Flashcard request already in-flight for ${videoId}, returning existing promise`);
      return this.inFlightRequests.get(cacheKey)!;
    }

    // Create the actual request promise
    const requestPromise = this.doGenerateFlashcards(transcript, videoId, videoTitle, cardCount, cacheKey);
    this.inFlightRequests.set(cacheKey, requestPromise);

    try {
      const result = await requestPromise;
      this.cache.set(cacheKey, result);
      return result;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  private async doGenerateFlashcards(
    transcript: TranscriptSegment[],
    videoId: string,
    videoTitle: string,
    cardCount: number,
    cacheKey: string
  ): Promise<FlashcardDeck> {
    if (!transcript || transcript.length === 0) {
      throw new Error('Cannot generate flashcards: transcript is empty');
    }

    const fullText = this.prepareTranscriptWithTimestamps(transcript);
    const wordCount = fullText.split(' ').length;

    logger.info(`Generating ${cardCount} flashcards for "${videoTitle}": ${wordCount} words`);

    const prompt = `You are an educational content expert. Create ${cardCount} flashcards from this video transcript for effective learning.

VIDEO: ${videoTitle}

TRANSCRIPT:
${fullText.slice(0, MAX_TRANSCRIPT_CHARS)}

Generate exactly ${cardCount} flashcards. Each flashcard should:
1. Have a clear question testing understanding of a key concept
2. Have a concise, accurate answer (1-3 sentences)
3. Be categorized by topic
4. Be assigned a difficulty level

Output strict JSON:
{
  "cards": [
    {
      "question": "What is...",
      "answer": "The answer is...",
      "category": "Topic Name",
      "difficulty": "easy" | "medium" | "hard",
      "timestamp": "MM:SS (optional - time in video where concept appears)"
    }
  ]
}

Make questions varied: definitions, concepts, comparisons, applications.
Ensure answers are educational and accurate based on the video content.`;

    try {
      logger.info(`Flashcard: Using ${MODEL_NAME}`);

      const genAI = getClient();
      const model = genAI.getGenerativeModel({ model: MODEL_NAME });

      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.4,
          topP: 0.9,
          maxOutputTokens: 4096,
        },
      });

      const text = result.response.text();

      logger.info(`Gemini raw response length for flashcards: ${text?.length || 0}`);

      if (!text || text.trim().length === 0) {
        logger.warn(`${MODEL_NAME} returned empty response for flashcards`);
        return this.getFallbackFlashcards(videoId, videoTitle);
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
        logger.error('Flashcard JSON parse failed, raw text:', jsonStr.slice(0, 500));
        return this.getFallbackFlashcards(videoId, videoTitle);
      }

      const cards: Flashcard[] = (parsed.cards || []).map((c: any, index: number) => ({
        id: `card-${index + 1}`,
        question: c.question || 'Question not available',
        answer: c.answer || 'Answer not available',
        category: c.category || 'General',
        difficulty: this.validateDifficulty(c.difficulty),
        timestamp: c.timestamp || undefined,
      }));

      // Extract unique categories
      const categories = [...new Set(cards.map(c => c.category))];

      const deck: FlashcardDeck = {
        videoId,
        videoTitle,
        cards,
        totalCards: cards.length,
        categories,
        generatedAt: new Date().toISOString(),
      };

      logger.info(`✅ Flashcards generated: ${cards.length} cards in ${categories.length} categories`);
      return deck;

    } catch (error: any) {
      logger.error('Flashcard generation failed:', {
        message: error?.message,
        status: error?.status,
        statusText: error?.statusText,
        errorDetails: error?.errorDetails,
        stack: error?.stack?.slice(0, 500)
      });
      return this.getFallbackFlashcards(videoId, videoTitle);
    }
  }

  private prepareTranscriptWithTimestamps(transcript: TranscriptSegment[]): string {
    return transcript
      .map((seg, idx) => {
        if (idx % 5 === 0) {
          const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
          const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
          return `[${mm}:${ss}] ${seg.text}`;
        }
        return seg.text;
      })
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private validateDifficulty(diff: any): 'easy' | 'medium' | 'hard' {
    if (['easy', 'medium', 'hard'].includes(diff)) {
      return diff;
    }
    return 'medium';
  }

  private getFallbackFlashcards(videoId: string, videoTitle: string): FlashcardDeck {
    logger.warn(`Returning fallback flashcards for ${videoId}`);
    return {
      videoId,
      videoTitle,
      cards: [
        {
          id: 'card-1',
          question: `What is the main topic of "${videoTitle}"?`,
          answer: 'Please watch the video to learn about the main concepts covered.',
          category: 'General',
          difficulty: 'easy',
        },
        {
          id: 'card-2',
          question: 'What are the key takeaways from this video?',
          answer: 'Review the video content to identify the key learning points.',
          category: 'General',
          difficulty: 'medium',
        },
      ],
      totalCards: 2,
      categories: ['General'],
      generatedAt: new Date().toISOString(),
    };
  }
}

export const flashcardService = FlashcardService.getInstance();
