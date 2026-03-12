"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockInterviewService = exports.MockInterviewService = void 0;
const logger_1 = require("../utils/logger");
const generative_ai_1 = require("@google/generative-ai");
function getApiKey() {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
    if (!key) {
        throw new Error('Missing Gemini API key. Set GOOGLE_API_KEY in .env');
    }
    return key;
}
function getClient() {
    return new generative_ai_1.GoogleGenerativeAI(getApiKey());
}
const MODEL_NAME = 'gemini-2.5-flash';
class MockInterviewService {
    constructor() {
        this.cache = new Map();
    }
    static getInstance() {
        if (!MockInterviewService.instance) {
            MockInterviewService.instance = new MockInterviewService();
        }
        return MockInterviewService.instance;
    }
    async generateInterview(field, difficulty = 'medium', questionCount = 5) {
        const cacheKey = `${field}_${difficulty}_${questionCount}`;
        // Check cache first
        if (this.cache.has(cacheKey)) {
            logger_1.logger.info(`Cache hit for mock interview: ${cacheKey}`);
            return this.cache.get(cacheKey);
        }
        logger_1.logger.info(`Generating mock interview for field: ${field}, difficulty: ${difficulty}, questions: ${questionCount}`);
        const prompt = `You are an expert interview coach and recruiter. Generate a comprehensive mock interview for the following field/role: "${field}"

Difficulty Level: ${difficulty}
Number of Questions: ${questionCount}

Create questions that:
1. Cover different aspects: Introduction, Technical Skills, Problem Solving, Behavioral, Scenario-Based
2. Progress from easier to harder questions
3. Are relevant to the specific field/role
4. Include realistic follow-up questions
5. Have actionable tips for answering

For each question, provide:
- The main question
- Category (Introduction/Technical/Problem Solving/Behavioral/Scenario)
- Difficulty level (easy/medium/hard)
- 3-4 specific tips for answering well
- 2-3 expected key points the answer should cover
- 1-2 potential follow-up questions

Output strict JSON format:
{
  "questions": [
    {
      "id": "1",
      "question": "The interview question text",
      "category": "Category name",
      "difficulty": "easy" | "medium" | "hard",
      "tips": ["tip 1", "tip 2", "tip 3", "tip 4"],
      "expectedKeyPoints": ["key point 1", "key point 2", "key point 3"],
      "followUpQuestions": ["follow-up 1", "follow-up 2"]
    }
  ]
}

Make questions realistic, professional, and tailored to ${field}. Ensure variety in question types and difficulty progression.`;
        try {
            const genAI = getClient();
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    topP: 0.9,
                    maxOutputTokens: 4096,
                },
            });
            const text = result.response.text();
            logger_1.logger.info(`Gemini raw response length for interview: ${text?.length || 0}`);
            if (!text || text.trim().length === 0) {
                logger_1.logger.warn(`Empty response for mock interview`);
                return this.getFallbackInterview(field, difficulty, questionCount);
            }
            // Extract JSON
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
                logger_1.logger.error('Interview JSON parse failed:', jsonStr.slice(0, 500));
                return this.getFallbackInterview(field, difficulty, questionCount);
            }
            const questions = (parsed.questions || []).map((q, index) => ({
                id: String(index + 1),
                question: q.question || 'Question not available',
                category: q.category || 'General',
                difficulty: this.validateDifficulty(q.difficulty),
                tips: Array.isArray(q.tips) ? q.tips : [],
                followUpQuestions: Array.isArray(q.followUpQuestions) ? q.followUpQuestions : [],
                expectedKeyPoints: Array.isArray(q.expectedKeyPoints) ? q.expectedKeyPoints : [],
            }));
            const sessionId = `interview_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const interview = {
                sessionId,
                field,
                difficulty,
                questions,
                totalQuestions: questions.length,
                generatedAt: new Date().toISOString(),
            };
            // Cache the result
            this.cache.set(cacheKey, interview);
            logger_1.logger.info(`✅ Mock interview generated: ${questions.length} questions for ${field}`);
            return interview;
        }
        catch (error) {
            logger_1.logger.error('Mock interview generation failed:', {
                message: error?.message,
                status: error?.status,
                stack: error?.stack?.slice(0, 500),
            });
            return this.getFallbackInterview(field, difficulty, questionCount);
        }
    }
    async evaluateAnswer(question, userAnswer, expectedKeyPoints, field) {
        logger_1.logger.info(`Evaluating answer for field: ${field}`);
        const prompt = `You are an expert interview coach evaluating a candidate's answer.

FIELD/ROLE: ${field}
QUESTION: ${question}
EXPECTED KEY POINTS: ${expectedKeyPoints.join(', ')}

CANDIDATE'S ANSWER:
${userAnswer}

Evaluate this answer and provide detailed feedback. Consider:
1. How well they addressed the question
2. Which key points they covered
3. Communication clarity and structure
4. Technical accuracy (if applicable)
5. Areas for improvement

Provide a score from 0-100 based on:
- Relevance (25 points)
- Completeness (25 points)
- Clarity (25 points)
- Technical accuracy (25 points)

Output strict JSON format:
{
  "score": 75,
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "improvements": ["improvement 1", "improvement 2", "improvement 3"],
  "detailedFeedback": "A paragraph of detailed constructive feedback",
  "keyPointsCovered": ["key point 1", "key point 2"],
  "keyPointsMissed": ["missed point 1"],
  "suggestedAnswer": "A brief example of a strong answer (2-3 sentences)"
}

Be constructive, specific, and encouraging in your feedback.`;
        try {
            const genAI = getClient();
            const model = genAI.getGenerativeModel({ model: MODEL_NAME });
            const result = await model.generateContent({
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.4,
                    topP: 0.9,
                    maxOutputTokens: 2048,
                },
            });
            const text = result.response.text();
            // Extract JSON
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
            const parsed = JSON.parse(jsonStr);
            const feedback = {
                score: Math.min(100, Math.max(0, parsed.score || 0)),
                strengths: Array.isArray(parsed.strengths) ? parsed.strengths : [],
                improvements: Array.isArray(parsed.improvements) ? parsed.improvements : [],
                detailedFeedback: parsed.detailedFeedback || 'Good effort! Keep practicing.',
                keyPointsCovered: Array.isArray(parsed.keyPointsCovered) ? parsed.keyPointsCovered : [],
                keyPointsMissed: Array.isArray(parsed.keyPointsMissed) ? parsed.keyPointsMissed : [],
                suggestedAnswer: parsed.suggestedAnswer,
            };
            logger_1.logger.info(`✅ Answer evaluated with score: ${feedback.score}`);
            return feedback;
        }
        catch (error) {
            logger_1.logger.error('Answer evaluation failed:', error);
            return this.getFallbackFeedback();
        }
    }
    validateDifficulty(diff) {
        if (['easy', 'medium', 'hard'].includes(diff)) {
            return diff;
        }
        return 'medium';
    }
    getFallbackInterview(field, difficulty, questionCount) {
        logger_1.logger.warn(`Returning fallback interview for ${field}`);
        const fallbackQuestions = [
            {
                id: '1',
                question: `Tell me about yourself and your background in ${field}.`,
                category: 'Introduction',
                difficulty: 'easy',
                tips: [
                    'Keep it concise (2-3 minutes)',
                    'Focus on relevant experience',
                    'Mention key projects or achievements',
                    'Connect your background to the role',
                ],
                expectedKeyPoints: [
                    'Professional background summary',
                    'Relevant skills and experience',
                    'Career motivation',
                ],
                followUpQuestions: [
                    'What attracted you to this field?',
                    'What are your strongest skills?',
                ],
            },
            {
                id: '2',
                question: `What interests you most about working in ${field}?`,
                category: 'Behavioral',
                difficulty: 'easy',
                tips: [
                    'Show genuine passion',
                    'Mention specific aspects you enjoy',
                    'Connect to your values',
                    'Relate to the company/role',
                ],
                expectedKeyPoints: [
                    'Genuine interest in the field',
                    'Specific aspects that motivate you',
                    'Long-term career goals',
                ],
                followUpQuestions: [
                    'Where do you see yourself in 5 years?',
                ],
            },
            {
                id: '3',
                question: `Describe a challenging project you worked on in ${field}. How did you overcome obstacles?`,
                category: 'Problem Solving',
                difficulty: 'medium',
                tips: [
                    'Use the STAR method (Situation, Task, Action, Result)',
                    'Focus on your specific contributions',
                    'Highlight problem-solving skills',
                    'Quantify results if possible',
                ],
                expectedKeyPoints: [
                    'Clear problem description',
                    'Your approach to solving it',
                    'Results achieved',
                ],
                followUpQuestions: [
                    'What would you do differently?',
                    'What did you learn from this experience?',
                ],
            },
        ];
        return {
            sessionId: `fallback_${Date.now()}`,
            field,
            difficulty,
            questions: fallbackQuestions.slice(0, questionCount),
            totalQuestions: fallbackQuestions.length,
            generatedAt: new Date().toISOString(),
        };
    }
    getFallbackFeedback() {
        return {
            score: 70,
            strengths: [
                'You provided a structured response',
                'You addressed the main question',
            ],
            improvements: [
                'Try to include more specific examples',
                'Consider elaborating on key points',
                'Structure your answer more clearly',
            ],
            detailedFeedback: 'Your answer shows understanding of the topic. To improve, try to provide more specific examples and structure your response using frameworks like STAR (Situation, Task, Action, Result). Practice answering similar questions to build confidence.',
            keyPointsCovered: [],
            keyPointsMissed: [],
            suggestedAnswer: 'A strong answer would include specific examples from your experience, clear structure, and demonstrate both technical knowledge and soft skills.',
        };
    }
    clearCache(field) {
        if (field) {
            const keysToDelete = Array.from(this.cache.keys()).filter(key => key.startsWith(field));
            keysToDelete.forEach(key => this.cache.delete(key));
            logger_1.logger.info(`Cleared cache for field: ${field}`);
        }
        else {
            this.cache.clear();
            logger_1.logger.info('Cleared entire mock interview cache');
        }
    }
}
exports.MockInterviewService = MockInterviewService;
exports.mockInterviewService = MockInterviewService.getInstance();
//# sourceMappingURL=mockInterviewService.js.map