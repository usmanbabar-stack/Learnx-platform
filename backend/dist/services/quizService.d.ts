import { TranscriptSegment } from './transcriptOrchestrationService';
export interface QuizQuestion {
    id: string;
    question: string;
    options: string[];
    correctAnswer: number;
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
export declare class QuizService {
    private static instance;
    private cache;
    private inFlightRequests;
    private constructor();
    static getInstance(): QuizService;
    generateQuiz(transcript: TranscriptSegment[], videoId: string, videoTitle: string, questionCount?: number): Promise<Quiz>;
    private doGenerateQuiz;
    private validateDifficulty;
    private prepareTranscriptWithTimestamps;
    private getFallbackQuiz;
    clearCache(videoId?: string): void;
}
export declare const quizService: QuizService;
//# sourceMappingURL=quizService.d.ts.map