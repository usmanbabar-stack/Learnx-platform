"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.flashcardService = exports.FlashcardService = void 0;
const logger_1 = require("../utils/logger");
const generative_ai_1 = require("@google/generative-ai");
// Use GOOGLE_API_KEY for flashcard generation (shared with chatbot - has quota available)
function getApiKey() {
    const key = process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY_FLASHCARD || process.env.GEMINI_API_KEY || '';
    if (!key) {
        throw new Error('Missing Gemini API key. Set GOOGLE_API_KEY in .env');
    }
    return key;
}
// Always create fresh client to pick up any API key changes
function getClient() {
    return new generative_ai_1.GoogleGenerativeAI(getApiKey());
}
// Use gemini-2.5-flash for flashcards - more reliable than gemma-3-12b-it
// Switch to avoid 503 errors from Gemma model high demand
const MODEL_NAME = 'gemini-2.5-flash';
// Limit transcript size to reduce token usage
const MAX_TRANSCRIPT_CHARS = 25000;
class FlashcardService {
    constructor() {
        this.cache = new Map();
        // Track in-flight requests to prevent duplicate API calls
        this.inFlightRequests = new Map();
    }
    static getInstance() {
        if (!FlashcardService.instance) {
            FlashcardService.instance = new FlashcardService();
        }
        return FlashcardService.instance;
    }
    async generateFlashcards(transcript, videoId, videoTitle, cardCount = 10) {
        // Check cache first
        const cacheKey = `${videoId}-${cardCount}`;
        const cached = this.cache.get(cacheKey);
        if (cached) {
            logger_1.logger.info(`Returning cached flashcards for ${videoId}`);
            return cached;
        }
        // If request is already in-flight, return the same promise (deduplication)
        if (this.inFlightRequests.has(cacheKey)) {
            logger_1.logger.info(`Flashcard request already in-flight for ${videoId}, returning existing promise`);
            return this.inFlightRequests.get(cacheKey);
        }
        // Create the actual request promise
        const requestPromise = this.doGenerateFlashcards(transcript, videoId, videoTitle, cardCount, cacheKey);
        this.inFlightRequests.set(cacheKey, requestPromise);
        try {
            const result = await requestPromise;
            this.cache.set(cacheKey, result);
            return result;
        }
        finally {
            this.inFlightRequests.delete(cacheKey);
        }
    }
    async doGenerateFlashcards(transcript, videoId, videoTitle, cardCount, cacheKey) {
        if (!transcript || transcript.length === 0) {
            throw new Error('Cannot generate flashcards: transcript is empty');
        }
        const fullText = this.prepareTranscriptWithTimestamps(transcript);
        const wordCount = fullText.split(' ').length;
        logger_1.logger.info(`Generating ${cardCount} flashcards for "${videoTitle}": ${wordCount} words`);
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
        // Retry logic for transient errors (503, 500, etc.)
        const maxRetries = 2;
        let lastError = null;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                if (attempt > 0) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff: 2s, 4s
                    logger_1.logger.info(`Flashcard retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
                logger_1.logger.info(`Flashcard: Using ${MODEL_NAME} (attempt ${attempt + 1}/${maxRetries + 1})`);
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
                logger_1.logger.info(`Gemini raw response length for flashcards: ${text?.length || 0}`);
                if (!text || text.trim().length === 0) {
                    logger_1.logger.warn(`${MODEL_NAME} returned empty response for flashcards`);
                    if (attempt < maxRetries) {
                        throw new Error('Empty response, will retry');
                    }
                    return this.getFallbackFlashcards(videoId, videoTitle);
                }
                // Extract JSON from response
                let jsonStr = text.trim();
                if (jsonStr.startsWith('```json')) {
                    jsonStr = jsonStr.slice(7);
                }
                else if (jsonStr.startsWith('```')) {
                    jsonStr = jsonStr.slice(3);
                }
                if (jsonStr.endsWith('```')) {
                    jsonStr = jsonStr.slice(0, -3);
                }
                jsonStr = jsonStr.trim();
                let parsed;
                try {
                    parsed = JSON.parse(jsonStr);
                }
                catch (parseError) {
                    logger_1.logger.error('Flashcard JSON parse failed, raw text:', jsonStr.slice(0, 500));
                    if (attempt < maxRetries) {
                        throw new Error('JSON parse failed, will retry');
                    }
                    return this.getFallbackFlashcards(videoId, videoTitle);
                }
                const cards = (parsed.cards || []).map((c, index) => ({
                    id: `card-${index + 1}`,
                    question: c.question || 'Question not available',
                    answer: c.answer || 'Answer not available',
                    category: c.category || 'General',
                    difficulty: this.validateDifficulty(c.difficulty),
                    timestamp: c.timestamp || undefined,
                }));
                // Extract unique categories
                const categories = [...new Set(cards.map(c => c.category))];
                const deck = {
                    videoId,
                    videoTitle,
                    cards,
                    totalCards: cards.length,
                    categories,
                    generatedAt: new Date().toISOString(),
                };
                logger_1.logger.info(`✅ Flashcards generated: ${cards.length} cards in ${categories.length} categories`);
                return deck;
            }
            catch (error) {
                lastError = error;
                const errorMsg = error?.message || String(error);
                const isRetryable = error?.status === 503 ||
                    error?.status === 500 ||
                    errorMsg.includes('503') ||
                    errorMsg.includes('500') ||
                    errorMsg.includes('high demand') ||
                    errorMsg.includes('timeout') ||
                    errorMsg.includes('UNAVAILABLE') ||
                    errorMsg.includes('Empty response') ||
                    errorMsg.includes('JSON parse failed');
                if (isRetryable && attempt < maxRetries) {
                    logger_1.logger.warn(`Flashcard generation failed with retryable error: ${errorMsg.slice(0, 200)}`);
                    continue; // Retry
                }
                else {
                    // Non-retryable error or max retries reached
                    logger_1.logger.error('Flashcard generation failed:', {
                        message: error?.message,
                        status: error?.status,
                        statusText: error?.statusText,
                        attempt: attempt + 1,
                        stack: error?.stack?.slice(0, 500)
                    });
                    break; // Exit retry loop
                }
            }
        }
        // All retries failed, return fallback
        logger_1.logger.warn(`All flashcard generation attempts failed, returning fallback`);
        return this.getFallbackFlashcards(videoId, videoTitle);
    }
    prepareTranscriptWithTimestamps(transcript) {
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
    validateDifficulty(diff) {
        if (['easy', 'medium', 'hard'].includes(diff)) {
            return diff;
        }
        return 'medium';
    }
    getFallbackFlashcards(videoId, videoTitle) {
        logger_1.logger.warn(`Returning fallback flashcards for ${videoId}`);
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
exports.FlashcardService = FlashcardService;
exports.flashcardService = FlashcardService.getInstance();
//# sourceMappingURL=flashcardService.js.map