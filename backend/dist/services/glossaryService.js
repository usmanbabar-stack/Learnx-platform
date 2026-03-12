"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.glossaryService = exports.GlossaryService = void 0;
const logger_1 = require("../utils/logger");
const generative_ai_1 = require("@google/generative-ai");
// Use dedicated GOOGLE_API_KEY_2 for Summary/Glossary (separate from chatbot)
function getApiKey() {
    const key = process.env.GOOGLE_API_KEY_2 || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!key) {
        throw new Error('Missing Gemini API key. Set GOOGLE_API_KEY_2 in .env');
    }
    return key;
}
// Always create fresh client to pick up any API key changes
function getClient() {
    return new generative_ai_1.GoogleGenerativeAI(getApiKey());
}
// SINGLE MODEL ONLY - to ensure max 1 API call per glossary request
// gemini-2.5-flash has quota available
const MODELS_TO_TRY = [
    'gemini-2.5-flash', // Only model - 1 API call max
];
// NO RETRIES - to minimize API calls
const MAX_TRANSCRIPT_CHARS = 20000; // ~5000 tokens input
// Delay helper for retry logic
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
class GlossaryService {
    constructor() {
        this.cache = new Map();
        // Track in-flight requests to prevent duplicate API calls
        this.inFlightRequests = new Map();
    }
    static getInstance() {
        if (!GlossaryService.instance) {
            GlossaryService.instance = new GlossaryService();
        }
        return GlossaryService.instance;
    }
    async generateGlossary(transcript, videoId, videoTitle) {
        // Check cache first
        const cached = this.cache.get(videoId);
        if (cached) {
            logger_1.logger.info(`Returning cached glossary for ${videoId}`);
            return cached;
        }
        // If request is already in-flight, return the same promise (deduplication)
        if (this.inFlightRequests.has(videoId)) {
            logger_1.logger.info(`Glossary request already in-flight for ${videoId}, returning existing promise`);
            return this.inFlightRequests.get(videoId);
        }
        // Create the actual request promise
        const requestPromise = this.doGenerateGlossary(transcript, videoId, videoTitle);
        this.inFlightRequests.set(videoId, requestPromise);
        try {
            const result = await requestPromise;
            this.cache.set(videoId, result);
            return result;
        }
        finally {
            this.inFlightRequests.delete(videoId);
        }
    }
    async doGenerateGlossary(transcript, videoId, videoTitle) {
        if (!transcript || transcript.length === 0) {
            throw new Error('Cannot generate glossary: transcript is empty');
        }
        const fullText = this.prepareTranscriptWithTimestamps(transcript);
        const wordCount = fullText.split(' ').length;
        logger_1.logger.info(`Generating glossary for "${videoTitle}": ${wordCount} words`);
        const prompt = `Extract key terms from this educational video transcript and return ONLY valid JSON.

IMPORTANT: Always respond in ENGLISH only. Do not use Hindi, Hinglish, or any other language. Even if the transcript contains non-English words, your definitions and terms must be 100% in English.

VIDEO TITLE: ${videoTitle}

TRANSCRIPT:
${fullText.slice(0, MAX_TRANSCRIPT_CHARS)}

INSTRUCTIONS:
1. Identify 8-15 important technical terms, concepts, or definitions
2. Return ONLY a JSON object, no markdown, no explanation
3. Write ALL content in English only
4. Use this exact format:

{"terms":[{"term":"Example Term","definition":"A clear 1-2 sentence definition in English","category":"Concept","relatedTerms":["Related1"],"timestampSeconds":60}]}

Categories can be: Concept, Algorithm, Technology, Protocol, Tool, Programming, Security, or other relevant categories.`;
        // Try each model (NO RETRIES to minimize API calls)
        const genAI = getClient();
        let lastError = null;
        for (const modelName of MODELS_TO_TRY) {
            // Single attempt per model (no retry loop)
            try {
                logger_1.logger.info(`Glossary: Trying ${modelName}`);
                const model = genAI.getGenerativeModel({
                    model: modelName,
                    generationConfig: {
                        temperature: 0.3,
                        topP: 0.9,
                        maxOutputTokens: 8192,
                        responseMimeType: 'application/json',
                    },
                });
                const result = await model.generateContent({
                    contents: [{ role: 'user', parts: [{ text: prompt }] }],
                });
                const text = result.response.text();
                logger_1.logger.info(`Gemini raw response length for glossary: ${text?.length || 0}`);
                // LOG THE ACTUAL RAW TEXT FOR DEBUGGING
                logger_1.logger.info(`Glossary RAW RESPONSE: ${text}`);
                if (!text || text.trim().length === 0) {
                    logger_1.logger.warn(`${modelName} returned empty response, trying next...`);
                    break; // Try next model
                }
                // Enhanced JSON extraction - handle various formats
                let jsonStr = text.trim();
                // Remove markdown code blocks
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
                // Try to find JSON object in the response if direct parse fails
                let parsed;
                try {
                    parsed = JSON.parse(jsonStr);
                }
                catch (parseError) {
                    // Try to extract JSON object using regex
                    const jsonMatch = text.match(/\{[\s\S]*"terms"[\s\S]*\}/);
                    if (jsonMatch) {
                        try {
                            parsed = JSON.parse(jsonMatch[0]);
                            logger_1.logger.info('Glossary: Extracted JSON using regex fallback');
                        }
                        catch (e) {
                            logger_1.logger.error('Glossary JSON parse failed, raw text:', text.slice(0, 800));
                            break; // Try next model
                        }
                    }
                    else {
                        logger_1.logger.error('Glossary JSON parse failed, no JSON found. Raw text:', text.slice(0, 800));
                        break; // Try next model
                    }
                }
                // Process and validate terms
                const terms = (parsed.terms || []).map((t, index) => ({
                    id: `${videoId}-term-${index + 1}`,
                    term: t.term || 'Unknown Term',
                    definition: t.definition || 'Definition not available',
                    category: t.category || 'General',
                    relatedTerms: Array.isArray(t.relatedTerms) ? t.relatedTerms : [],
                    videoTimestamp: typeof t.timestampSeconds === 'number' ? t.timestampSeconds : undefined,
                    timestampFormatted: typeof t.timestampSeconds === 'number'
                        ? this.formatTimestamp(t.timestampSeconds)
                        : undefined
                }));
                // VALIDATION: Ensure we have actual content
                if (terms.length === 0) {
                    logger_1.logger.warn(`${modelName} returned 0 terms, trying next...`);
                    continue; // Try next model
                }
                // Extract unique categories
                const categories = [...new Set(terms.map(t => t.category))].sort();
                const glossary = {
                    terms: terms.sort((a, b) => a.term.localeCompare(b.term)),
                    categories,
                    totalTerms: terms.length,
                    videoId,
                    generatedAt: new Date().toISOString()
                };
                // Cache the result (only if valid)
                this.cache.set(videoId, glossary);
                logger_1.logger.info(`✅ Glossary generated with ${modelName}: ${terms.length} terms in ${categories.length} categories`);
                return glossary;
            }
            catch (error) {
                lastError = error;
                logger_1.logger.warn(`${modelName} failed: ${error?.message || error}`);
                continue; // Try next model
            }
        }
        // All models failed
        logger_1.logger.error('All models failed for glossary generation:', {
            message: lastError?.message || 'Unknown error',
            status: lastError?.status,
            statusText: lastError?.statusText,
        });
        return this.getFallbackGlossary(videoId, videoTitle);
    }
    prepareTranscriptWithTimestamps(transcript) {
        return transcript
            .map((seg) => {
            const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
            const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
            return `[${mm}:${ss}] ${seg.text}`;
        })
            .join('\n');
    }
    formatTimestamp(seconds) {
        const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
        const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    }
    getFallbackGlossary(videoId, videoTitle) {
        logger_1.logger.warn(`Returning fallback glossary for ${videoId}`);
        return {
            terms: [],
            categories: [],
            totalTerms: 0,
            videoId,
            generatedAt: new Date().toISOString()
        };
    }
    // Clear cache for a specific video
    clearCache(videoId) {
        this.cache.delete(videoId);
    }
    // Clear all cache
    clearAllCache() {
        this.cache.clear();
    }
}
exports.GlossaryService = GlossaryService;
exports.glossaryService = GlossaryService.getInstance();
//# sourceMappingURL=glossaryService.js.map