export interface MockInterviewSession {
    sessionId: string;
    userId: number;
    field: string;
    difficulty: string;
    questions: any;
    totalQuestions: number;
    createdAt: Date;
    completedAt?: Date;
    overallScore?: number;
}
export interface MockInterviewResponse {
    id: number;
    sessionId: string;
    questionId: string;
    questionText: string;
    userAnswer: string;
    feedback: any;
    score: number;
    answeredAt: Date;
}
export declare class MockInterviewRepository {
    private pool;
    constructor();
    createSession(session: Omit<MockInterviewSession, 'createdAt' | 'completedAt' | 'overallScore'>): Promise<MockInterviewSession>;
    getSessionById(sessionId: string): Promise<MockInterviewSession | null>;
    getUserSessions(userId: number, limit?: number): Promise<MockInterviewSession[]>;
    saveResponse(response: Omit<MockInterviewResponse, 'id' | 'answeredAt'>): Promise<MockInterviewResponse>;
    getSessionResponses(sessionId: string): Promise<MockInterviewResponse[]>;
    completeSession(sessionId: string, overallScore: number): Promise<void>;
    getUserStats(userId: number): Promise<{
        totalSessions: number;
        averageScore: number;
        totalQuestionsAnswered: number;
        fieldDistribution: {
            field: string;
            count: number;
        }[];
    }>;
    private mapRowToSession;
    private mapRowToResponse;
}
export declare const mockInterviewRepository: MockInterviewRepository;
//# sourceMappingURL=mockInterviewRepository.d.ts.map