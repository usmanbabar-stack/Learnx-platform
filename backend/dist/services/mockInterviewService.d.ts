export interface InterviewQuestion {
    id: string;
    question: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    tips: string[];
    followUpQuestions?: string[];
    expectedKeyPoints?: string[];
}
export interface MockInterview {
    sessionId: string;
    field: string;
    difficulty: string;
    questions: InterviewQuestion[];
    totalQuestions: number;
    generatedAt: string;
}
export interface AnswerFeedback {
    score: number;
    strengths: string[];
    improvements: string[];
    detailedFeedback: string;
    keyPointsCovered: string[];
    keyPointsMissed: string[];
    suggestedAnswer?: string;
}
export declare class MockInterviewService {
    private static instance;
    private cache;
    private constructor();
    static getInstance(): MockInterviewService;
    generateInterview(field: string, difficulty?: string, questionCount?: number): Promise<MockInterview>;
    evaluateAnswer(question: string, userAnswer: string, expectedKeyPoints: string[], field: string): Promise<AnswerFeedback>;
    private validateDifficulty;
    private getFallbackInterview;
    private getFallbackFeedback;
    clearCache(field?: string): void;
}
export declare const mockInterviewService: MockInterviewService;
//# sourceMappingURL=mockInterviewService.d.ts.map