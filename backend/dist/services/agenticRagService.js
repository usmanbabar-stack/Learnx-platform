"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agenticRagService = exports.AgenticRagService = void 0;
const logger_1 = require("../utils/logger");
const geminiService_1 = require("./geminiService");
class AgenticRagService {
    constructor() { }
    static getInstance() {
        if (!AgenticRagService.instance) {
            AgenticRagService.instance = new AgenticRagService();
        }
        return AgenticRagService.instance;
    }
    async analyzeIntent(question, videoTitle) {
        const rulesBasedIntent = this.rulesBasedClassification(question);
        // Fast path: in most cases, rules-based is good enough and MUCH faster
        const useLLM = String(process.env.AGENTIC_INTENT_USE_LLM || 'false').toLowerCase() === 'true';
        if (!useLLM || rulesBasedIntent.confidence >= 0.75) {
            logger_1.logger.info(`Rules-based intent: ${rulesBasedIntent.intent} (${Math.round(rulesBasedIntent.confidence * 100)}%)`);
            return rulesBasedIntent;
        }
        const startTime = Date.now();
        const llmIntent = await this.llmBasedClassification(question, videoTitle);
        const elapsed = Date.now() - startTime;
        logger_1.logger.info(`LLM intent analysis: ${llmIntent.intent}, retrieval: ${llmIntent.requiresRetrieval}, ${elapsed}ms`);
        return llmIntent;
    }
    rulesBasedClassification(question) {
        const q = question.toLowerCase().trim();
        const summaryPatterns = [
            /^(give|provide|show|tell).*(summary|overview|gist|brief|main points?|key takeaways?)/i,
            /^(what('?s| is).*(this )?video (about|discussing|covering))/i,
            /^(summarize|overview|tldr|tl;dr)/i,
            /^(what (does|did) (he|she|they|the (speaker|presenter|instructor)) (talk|discuss|explain|cover))/i,
            /^(main (topic|idea|point|concept)s? (of|in|from) (this|the) video)/i
        ];
        for (const pattern of summaryPatterns) {
            if (pattern.test(q)) {
                return {
                    intent: 'summary_overview',
                    requiresRetrieval: false,
                    requiresFullTranscript: true,
                    confidence: 0.95,
                    reasoning: 'Pattern matched: user explicitly requested summary/overview'
                };
            }
        }
        const timestampPatterns = [
            /at\s+\d+:\d+/i,
            /\d+\s+(minute|second|min|sec)s?\s+(in|mark)/i,
            /(beginning|start|intro|opening|end|ending|conclusion)/i,
            /(what (does|did) (he|she|they) (say|mention|explain)) at/i
        ];
        for (const pattern of timestampPatterns) {
            if (pattern.test(q)) {
                return {
                    intent: 'timestamp_reference',
                    requiresRetrieval: true,
                    requiresFullTranscript: false,
                    confidence: 0.90,
                    reasoning: 'Pattern matched: user referenced specific timestamp/section'
                };
            }
        }
        const specificConceptPatterns = [
            /^(what|explain|define|describe|how (does|do|did)).*\?$/i,
            /^(why|when|where|who)/i,
            /(can you|could you).*(explain|clarify|elaborate|tell)/i,
            /^(i (don't|do not) understand)/i,
            /(example|demonstrate|show me|illustrate)/i
        ];
        for (const pattern of specificConceptPatterns) {
            if (pattern.test(q)) {
                return {
                    intent: 'specific_concept',
                    requiresRetrieval: true,
                    requiresFullTranscript: false,
                    confidence: 0.80,
                    reasoning: 'Pattern matched: user asking about specific concept/detail'
                };
            }
        }
        return {
            intent: 'specific_concept',
            requiresRetrieval: true,
            requiresFullTranscript: false,
            confidence: 0.50,
            reasoning: 'Default fallback: treat as specific question requiring retrieval'
        };
    }
    async llmBasedClassification(question, videoTitle) {
        try {
            // Add timeout to prevent hanging
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Intent classification timeout')), 5000));
            const classificationPromise = this.performLLMClassification(question, videoTitle);
            return await Promise.race([classificationPromise, timeoutPromise]);
        }
        catch (error) {
            logger_1.logger.error('LLM intent classification failed:', error);
            return {
                intent: 'specific_concept',
                requiresRetrieval: true,
                requiresFullTranscript: false,
                confidence: 0.6,
                reasoning: 'Fallback: LLM classification failed'
            };
        }
    }
    async performLLMClassification(question, videoTitle) {
        try {
            const systemPrompt = `You are an intent classifier for a video Q&A system. Analyze the user's question and classify it.

Output strict JSON:
{
  "intent": "summary_overview" | "specific_concept" | "timestamp_reference" | "comparison" | "explanation",
  "requiresRetrieval": boolean,
  "requiresFullTranscript": boolean,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

Intent definitions:
- summary_overview: User wants overall summary, main points, or what the video covers
  → requiresRetrieval=false, requiresFullTranscript=true
- specific_concept: User asks about a specific term, idea, or detail mentioned in video
  → requiresRetrieval=true, requiresFullTranscript=false
- timestamp_reference: User mentions specific time/section
  → requiresRetrieval=true, requiresFullTranscript=false
- explanation: User wants clarification on something from video
  → requiresRetrieval=true, requiresFullTranscript=false
- comparison: User compares concepts or asks "difference between"
  → requiresRetrieval=true, requiresFullTranscript=false`;
            const userPrompt = `Question: "${question}"${videoTitle ? `\nVideo title: "${videoTitle}"` : ''}

Classify this question's intent.`;
            const response = await (0, geminiService_1.askGemini)({
                question: userPrompt,
                transcriptContext: systemPrompt
            });
            // Handle case where response.answer might not be valid JSON
            let parsed;
            try {
                parsed = JSON.parse(response.answer);
            }
            catch (parseError) {
                logger_1.logger.warn('Failed to parse LLM intent response, using fallback:', response.answer?.slice(0, 100));
                // Return default intent
                return {
                    intent: 'specific_concept',
                    requiresRetrieval: true,
                    requiresFullTranscript: false,
                    confidence: 0.5,
                    reasoning: 'JSON parse failed, using default'
                };
            }
            return {
                intent: parsed.intent || 'specific_concept',
                requiresRetrieval: parsed.requiresRetrieval !== false,
                requiresFullTranscript: parsed.requiresFullTranscript === true,
                confidence: parsed.confidence || 0.7,
                reasoning: parsed.reasoning || 'LLM classification'
            };
        }
        catch (error) {
            logger_1.logger.error('LLM intent classification failed:', error);
            return {
                intent: 'specific_concept',
                requiresRetrieval: true,
                requiresFullTranscript: false,
                confidence: 0.6,
                reasoning: 'Fallback: LLM classification failed'
            };
        }
    }
}
exports.AgenticRagService = AgenticRagService;
exports.agenticRagService = AgenticRagService.getInstance();
//# sourceMappingURL=agenticRagService.js.map