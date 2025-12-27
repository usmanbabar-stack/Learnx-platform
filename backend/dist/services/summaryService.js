"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.summaryService = exports.SummaryService = void 0;
const logger_1 = require("../utils/logger");
const generative_ai_1 = require("@google/generative-ai");
function getApiKey() {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || '';
    if (!key) {
        throw new Error('Missing Google Gemini API key');
    }
    return key;
}
let client = null;
function getClient() {
    if (!client) {
        client = new generative_ai_1.GoogleGenerativeAI(getApiKey());
    }
    return client;
}
class SummaryService {
    constructor() { }
    static getInstance() {
        if (!SummaryService.instance) {
            SummaryService.instance = new SummaryService();
        }
        return SummaryService.instance;
    }
    async generateComprehensiveSummary(transcript, videoTitle, videoChannel) {
        if (!transcript || transcript.length === 0) {
            throw new Error('Cannot generate summary: transcript is empty');
        }
        const fullText = this.prepareTranscriptForSummary(transcript);
        const wordCount = fullText.split(' ').length;
        logger_1.logger.info(`Generating summary for transcript: ${wordCount} words, ${transcript.length} segments`);
        const systemPrompt = `You are an expert educational content analyzer. Generate a comprehensive, structured summary of this YouTube educational video.

**CRITICAL INSTRUCTIONS:**
- Base your ENTIRE summary on the provided transcript
- Do NOT hallucinate or add information not in the transcript
- Extract key learning points, main topics, and structure
- Identify important timestamps and what happens at those points
- Assess difficulty level and target audience based on language/complexity

**Video Title:** ${videoTitle}${videoChannel ? `\n**Channel:** ${videoChannel}` : ''}

**Full Transcript:**
${fullText.slice(0, 50000)}

Output strict JSON:
{
  "overview": "2-3 sentence comprehensive overview of what the video covers",
  "keyPoints": ["array of 5-7 main learning points/takeaways"],
  "mainTopics": ["array of 3-5 primary topics/concepts discussed"],
  "keyTimestamps": [
    {
      "time": "MM:SS format",
      "description": "What happens/is explained at this point"
    }
  ],
  "targetAudience": "Who this video is for (e.g., 'Beginners in web development', 'Intermediate Python programmers')",
  "difficulty": "beginner" | "intermediate" | "advanced",
  "estimatedWatchTime": "X minutes"
}`;
        try {
            const genAI = getClient();
            const model = genAI.getGenerativeModel({
                model: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
            });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: systemPrompt }] }],
                generationConfig: {
                    temperature: 0.2,
                    topP: 0.8,
                    maxOutputTokens: 2048,
                    responseMimeType: 'application/json',
                },
            });
            const text = result.response.text();
            const parsed = JSON.parse(text);
            const summary = {
                overview: parsed.overview || 'Summary not available',
                keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints : [],
                mainTopics: Array.isArray(parsed.mainTopics) ? parsed.mainTopics : [],
                keyTimestamps: Array.isArray(parsed.keyTimestamps) ? parsed.keyTimestamps : [],
                targetAudience: parsed.targetAudience || 'General audience',
                difficulty: this.validateDifficulty(parsed.difficulty),
                estimatedWatchTime: parsed.estimatedWatchTime || this.calculateWatchTime(transcript)
            };
            logger_1.logger.info(`Summary generated successfully: ${summary.keyPoints.length} key points, ${summary.mainTopics.length} topics`);
            return summary;
        }
        catch (error) {
            logger_1.logger.error('Failed to generate summary:', error);
            throw new Error('Summary generation failed');
        }
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