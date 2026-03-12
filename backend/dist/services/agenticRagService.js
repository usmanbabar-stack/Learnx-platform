"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.agenticRagService = exports.AgenticRagService = void 0;
const logger_1 = require("../utils/logger");
const geminiService_1 = require("./geminiService");
const generative_ai_1 = require("@google/generative-ai");
// Get Gemini client for fast classification
function getGeminiClient() {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || "";
    if (!key)
        throw new Error("Missing Gemini API key");
    return new generative_ai_1.GoogleGenerativeAI(key);
}
class AgenticRagService {
    constructor() { }
    static getInstance() {
        if (!AgenticRagService.instance) {
            AgenticRagService.instance = new AgenticRagService();
        }
        return AgenticRagService.instance;
    }
    /**
     * 🛡️ PRE-FILTER: Classify message BEFORE any expensive RAG processing
     * Uses fast Gemini Flash model for robust classification
     */
    async classifyMessage(message, videoTitle) {
        const startTime = Date.now();
        // Quick pattern check for obvious cases (saves API call)
        const quickCheck = this.quickPatternCheck(message);
        if (quickCheck) {
            logger_1.logger.info(`Quick pattern classification: ${quickCheck.category} in ${Date.now() - startTime}ms`);
            return quickCheck;
        }
        try {
            const client = getGeminiClient();
            const model = client.getGenerativeModel({
                model: "gemini-2.5-flash-lite", // Lightweight model for fast classification
                generationConfig: {
                    maxOutputTokens: 100,
                    temperature: 0.1, // Low temperature for consistent classification
                }
            });
            const prompt = `You are a message classifier for an educational video chatbot. The chatbot helps students learn from video: "${videoTitle}"

Classify this user message into ONE category:

MESSAGE: "${message}"

Categories:
1. EDUCATIONAL - Questions about video content, learning concepts, explanations, summaries, topics discussed in the video
2. GREETING - Simple greetings like hi, hello, thanks, bye (respond: valid but no RAG needed)
3. OFF_TOPIC - Questions unrelated to education/video (personal questions, jokes, weather, news, random chat)
4. INAPPROPRIATE - Profanity, abuse, harassment, harmful content, offensive language

Respond with ONLY ONE WORD: EDUCATIONAL, GREETING, OFF_TOPIC, or INAPPROPRIATE`;
            const result = await model.generateContent(prompt);
            const response = result.response.text().trim().toUpperCase();
            const elapsed = Date.now() - startTime;
            logger_1.logger.info(`LLM message classification: ${response} in ${elapsed}ms`);
            if (response.includes('EDUCATIONAL')) {
                return { isValid: true, category: 'educational', reason: 'Educational question about video' };
            }
            else if (response.includes('GREETING')) {
                return { isValid: true, category: 'greeting', reason: 'Greeting message' };
            }
            else if (response.includes('INAPPROPRIATE')) {
                return { isValid: false, category: 'inappropriate', reason: 'Inappropriate content detected' };
            }
            else if (response.includes('OFF_TOPIC')) {
                return { isValid: false, category: 'off_topic', reason: 'Question not related to video' };
            }
            // Default to educational if unclear (benefit of doubt)
            return { isValid: true, category: 'unclear', reason: 'Could not classify, treating as educational' };
        }
        catch (error) {
            logger_1.logger.warn(`Message classification failed, defaulting to educational:`, error);
            // On error, allow the message through (don't block legitimate questions)
            return { isValid: true, category: 'unclear', reason: 'Classification failed, allowing through' };
        }
    }
    /**
     * Quick pattern check for obvious cases (no API call needed)
     */
    quickPatternCheck(message) {
        const m = message.toLowerCase().trim();
        // Very short messages that are just greetings
        if (/^(hi|hey|hello|thanks?|thank\s*you|bye|ok|okay)[\s!.]*$/i.test(m)) {
            return { isValid: true, category: 'greeting', reason: 'Simple greeting detected' };
        }
        // Obvious profanity (basic check, LLM handles complex cases)
        const profanityPatterns = /\b(fuck|shit|ass|bitch|damn|crap|bastard|dick|cock|pussy)\b/i;
        if (profanityPatterns.test(m)) {
            return { isValid: false, category: 'inappropriate', reason: 'Profanity detected' };
        }
        return null; // Need LLM classification
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
        // 🎯 GREETING/CONVERSATIONAL PATTERNS - Handle first to skip expensive processing
        const greetingPatterns = [
            /^(hi|hey|hello|hii+|heyy+|helloo+)[\s!.]*$/i,
            /^(good\s*(morning|afternoon|evening|night))[\s!.]*$/i,
            /^(what'?s\s*up|sup|yo|howdy)[\s!.]*$/i,
            /^(how\s*(are|r)\s*(you|u|ya))[\s!?]*$/i,
            /^(thanks|thank\s*you|thx|ty)[\s!.]*$/i,
            /^(bye|goodbye|see\s*you|later|cya)[\s!.]*$/i,
            /^(ok|okay|cool|nice|great|awesome|alright)[\s!.]*$/i,
            /^(yes|no|yeah|yep|nope|yup)[\s!.]*$/i,
        ];
        for (const pattern of greetingPatterns) {
            if (pattern.test(q)) {
                return {
                    intent: 'greeting',
                    requiresRetrieval: false,
                    requiresFullTranscript: false,
                    confidence: 0.99,
                    reasoning: 'Pattern matched: conversational/greeting message'
                };
            }
        }
        // 🚫 OFF-TOPIC PATTERNS - Clearly not about the video
        const offTopicPatterns = [
            /^(who\s*(are|r)\s*(you|u))[\s?]*$/i,
            /^(what\s*(are|r)\s*(you|u))[\s?]*$/i,
            /^(what'?s\s*your\s*name)[\s?]*$/i,
            /^(tell\s*me\s*(about\s*yourself|a\s*joke|something\s*funny))/i,
            /^(can\s*you\s*(help|assist)\s*me\s*with\s*(homework|assignment|project|code))/i,
            /weather|news|sports|politics|games?|movie|music|recipe|cook/i,
        ];
        for (const pattern of offTopicPatterns) {
            if (pattern.test(q)) {
                return {
                    intent: 'off_topic',
                    requiresRetrieval: false,
                    requiresFullTranscript: false,
                    confidence: 0.95,
                    reasoning: 'Pattern matched: off-topic question not related to video'
                };
            }
        }
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