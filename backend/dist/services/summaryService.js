"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryService = exports.SummaryService = void 0;
const logger_1 = require("../utils/logger");
const generative_ai_1 = require("@google/generative-ai");
function getApiKey() {
    // Use dedicated GOOGLE_API_KEY_2 for Summary/Glossary (separate from chatbot)
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
// SINGLE MODEL ONLY - to ensure max 1 API call per summary request
// gemini-2.5-flash has quota available
const MODELS_TO_TRY = [
    'gemini-2.5-flash', // Only model - 1 API call max
];
// Limit transcript size to reduce token usage (approx 4 chars = 1 token)
const MAX_TRANSCRIPT_CHARS = 25000; // ~6000 tokens input
// NO RETRIES - to minimize API calls (was causing 40+ requests)
// Delay helper for retry logic
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
class SummaryService {
    constructor() {
        // Track in-flight requests to prevent duplicate API calls
        this.inFlightRequests = new Map();
        // Cache successful results
        this.cache = new Map();
    }
    static getInstance() {
        if (!SummaryService.instance) {
            SummaryService.instance = new SummaryService();
        }
        return SummaryService.instance;
    }
    async generateComprehensiveSummary(transcript, videoTitle, videoChannel) {
        // Create a unique key for this request
        const cacheKey = `summary_${videoTitle}_${transcript.length}`;
        // Return cached result if available
        if (this.cache.has(cacheKey)) {
            logger_1.logger.info(`Returning cached summary for: ${videoTitle}`);
            return this.cache.get(cacheKey);
        }
        // If request is already in-flight, return the same promise (deduplication)
        if (this.inFlightRequests.has(cacheKey)) {
            logger_1.logger.info(`Summary request already in-flight for: ${videoTitle}, returning existing promise`);
            return this.inFlightRequests.get(cacheKey);
        }
        // Create the actual request promise
        const requestPromise = this.doGenerateSummary(transcript, videoTitle, videoChannel, cacheKey);
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
    async doGenerateSummary(transcript, videoTitle, videoChannel, cacheKey) {
        if (!transcript || transcript.length === 0) {
            throw new Error('Cannot generate summary: transcript is empty');
        }
        const fullText = this.prepareTranscriptForSummary(transcript);
        const wordCount = fullText.split(' ').length;
        logger_1.logger.info(`Generating summary for transcript: ${wordCount} words, ${transcript.length} segments`);
        const systemPrompt = `You are an expert educational content analyzer. Generate a structured summary of this YouTube video.

IMPORTANT: Always respond in ENGLISH only. Do not use Hindi, Hinglish, or any other language. Even if the transcript contains non-English text, your response must be 100% in English.

**Video Title:** ${videoTitle}${videoChannel ? `\n**Channel:** ${videoChannel}` : ''}

**Transcript (${wordCount} words, trimmed for efficiency):**
${fullText.slice(0, MAX_TRANSCRIPT_CHARS)}

Output strict JSON (in English only):
{
  "overview": "2-3 sentence overview of what the video covers",
  "keyPoints": ["array of 4-6 main learning points"],
  "mainTopics": ["array of 3-4 primary topics discussed"],
  "keyTimestamps": [
    {
      "time": "MM:SS format",
      "description": "What happens at this point"
    }
  ],
  "targetAudience": "Who this video is for",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimatedWatchTime": "X minutes"
}`;
        // Try each model (NO RETRIES to minimize API calls)
        const genAI = getClient();
        let lastError = null;
        for (const modelName of MODELS_TO_TRY) {
            // Single attempt per model (no retry loop)
            try {
                logger_1.logger.info(`Summary: Trying ${modelName}`);
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
                    contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                });
                const text = result.response.text();
                logger_1.logger.info(`Gemini raw response length: ${text?.length || 0}`);
                if (!text || text.trim().length === 0) {
                    logger_1.logger.warn(`${modelName} returned empty response, trying next...`);
                    break; // Try next model
                }
                // Extract JSON from response (handle markdown code blocks)
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
                    logger_1.logger.error('JSON parse failed, raw text:', jsonStr.slice(0, 500));
                    break; // Try next model
                }
                const summary = {
                    overview: parsed.overview || 'Summary not available',
                    keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                    mainTopics: Array.isArray(parsed.mainTopics) ? parsed.mainTopics : [],
                    keyTimestamps: Array.isArray(parsed.keyTimestamps) ? parsed.keyTimestamps : [],
                    targetAudience: parsed.targetAudience || 'General audience',
                    difficulty: this.validateDifficulty(parsed.difficulty),
                    estimatedWatchTime: parsed.estimatedWatchTime || this.calculateWatchTime(transcript)
                };
                // VALIDATION: Ensure we have actual content
                if (!summary.overview || summary.keyPoints.length === 0) {
                    logger_1.logger.warn(`${modelName} returned incomplete summary, trying next...`);
                    continue; // Try next model
                }
                logger_1.logger.info(`✅ Summary generated with ${modelName}: ${summary.keyPoints.length} key points, ${summary.mainTopics.length} topics`);
                return summary;
            }
            catch (error) {
                lastError = error;
                logger_1.logger.warn(`${modelName} failed: ${error?.message || error}`);
                continue; // Try next model
            }
        }
        // All models failed
        logger_1.logger.error('All models failed for summary generation:', lastError?.message || 'Unknown error');
        return this.getFallbackSummary(transcript, videoTitle);
    }
    prepareTranscriptForSummary(transcript) {
        return transcript
            .map((seg, idx) => {
            if (idx % 5 === 0) {
                const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
                const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
                return `\n[${mm}:${ss}] ${seg.text}`;
            }
            return seg.text;
        })
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();
    }
    validateDifficulty(diff) {
        if (['beginner', 'intermediate', 'advanced'].includes(diff)) {
            return diff;
        }
        return 'intermediate';
    }
    calculateWatchTime(transcript) {
        if (transcript.length === 0)
            return 'Unknown';
        const lastSeg = transcript[transcript.length - 1];
        const totalSeconds = lastSeg.start + lastSeg.duration;
        const minutes = Math.ceil(totalSeconds / 60);
        return `${minutes} minutes`;
    }
    getFallbackSummary(transcript, videoTitle) {
        // Generate a basic summary from the transcript when API fails
        const fullText = transcript.map(s => s.text).join(' ');
        const words = fullText.split(' ').slice(0, 100).join(' ');
        const watchTime = this.calculateWatchTime(transcript);
        return {
            overview: `This video "${videoTitle}" covers educational content. ${words.slice(0, 200)}...`,
            keyPoints: ['Content based on video transcript', 'AI summary temporarily unavailable'],
            mainTopics: [videoTitle.split(/[-|:]/).map(s => s.trim()).filter(s => s.length > 0)[0] || 'Educational Content'],
            keyTimestamps: [
                { time: '00:00', description: 'Video start' },
                { time: this.formatTime(transcript.length > 0 ? transcript[Math.floor(transcript.length / 2)].start : 0), description: 'Mid-point' }
            ],
            targetAudience: 'General learners',
            difficulty: 'intermediate',
            estimatedWatchTime: watchTime
        };
    }
    formatTime(seconds) {
        const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
        const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
        return `${mm}:${ss}`;
    }
    async generateQuickSummary(transcript) {
        if (!transcript || transcript.length === 0) {
            return 'Transcript not available for this video.';
        }
        const sampleSegments = this.sampleTranscript(transcript, 100);
        const sampleText = sampleSegments.map(s => s.text).join(' ');
        try {
            const genAI = getClient();
            const model = genAI.getGenerativeModel({
                model: 'gemini-1.5-flash-8b'
            });
            const prompt = `Provide a concise 2-3 sentence summary of this video based on the transcript:\n\n${sampleText.slice(0, 10000)}`;
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 256,
                },
            });
            return result.response.text().trim();
        }
        catch (error) {
            logger_1.logger.error('Quick summary generation failed:', error);
            return 'Unable to generate summary at this time.';
        }
    }
    sampleTranscript(transcript, maxSegments) {
        if (transcript.length <= maxSegments)
            return transcript;
        const interval = Math.floor(transcript.length / maxSegments);
        const sampled = [];
        for (let i = 0; i < transcript.length; i += interval) {
            sampled.push(transcript[i]);
            if (sampled.length >= maxSegments)
                break;
        }
        return sampled;
    }
}
exports.SummaryService = SummaryService;
exports.summaryService = SummaryService.getInstance();
//# sourceMappingURL=summaryService.js.map