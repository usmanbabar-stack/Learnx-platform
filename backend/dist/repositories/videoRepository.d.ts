import { VideoDocument, TranscriptItem, SearchFilters } from '../types/video';
export declare class VideoRepository {
    private pool;
    constructor();
    findByVideoId(videoId: string): Promise<VideoDocument | null>;
    create(video: VideoDocument): Promise<VideoDocument>;
    findBySubject(subject: string, limit?: number): Promise<VideoDocument[]>;
    searchVideos(query: string, filters?: SearchFilters, limit?: number): Promise<VideoDocument[]>;
    getTranscriptByVideoId(videoId: string): Promise<TranscriptItem[]>;
    saveTranscript(videoId: string, segments: TranscriptItem[]): Promise<void>;
    private mapRowToVideoDocument;
}
export declare const videoRepository: VideoRepository;
export interface SavedSummary {
    videoId: string;
    overview: string;
    keyPoints: string[];
    mainTopics: string[];
    keyTimestamps: Array<{
        time: string;
        description: string;
    }>;
    targetAudience: string;
    difficulty: 'beginner' | 'intermediate' | 'advanced';
    estimatedWatchTime: string;
    generationTimeMs?: number;
    createdAt?: Date;
}
export interface SavedGlossary {
    videoId: string;
    terms: Array<{
        id: string;
        term: string;
        definition: string;
        category: string;
        relatedTerms: string[];
        videoTimestamp?: number;
        timestampFormatted?: string;
    }>;
    categories: string[];
    totalTerms: number;
    generationTimeMs?: number;
    createdAt?: Date;
}
export interface SavedQuiz {
    videoId: string;
    questions: Array<{
        id: string;
        question: string;
        options: string[];
        correctAnswer: number;
        explanation: string;
        difficulty: 'easy' | 'medium' | 'hard';
        category: string;
        timestamp?: string;
    }>;
    totalQuestions: number;
    categories: string[];
    generationTimeMs?: number;
    createdAt?: Date;
}
export declare function getSummaryByVideoId(videoId: string): Promise<SavedSummary | null>;
export declare function saveSummary(summary: SavedSummary): Promise<void>;
export declare function getGlossaryByVideoId(videoId: string): Promise<SavedGlossary | null>;
export declare function saveGlossary(glossary: SavedGlossary): Promise<void>;
export declare function deleteGlossary(videoId: string): Promise<boolean>;
export declare function getQuizByVideoId(videoId: string): Promise<SavedQuiz | null>;
export declare function saveQuiz(quiz: SavedQuiz): Promise<void>;
export interface ChatHistoryMessage {
    id: number;
    userId: number;
    videoId: string;
    messageType: 'user' | 'ai';
    content: string;
    videoTime: number;
    createdAt: Date;
}
export declare function getChatHistory(userId: number, videoId: string): Promise<ChatHistoryMessage[]>;
export declare function saveChatMessage(userId: number, videoId: string, messageType: 'user' | 'ai', content: string, videoTime?: number): Promise<ChatHistoryMessage>;
export declare function clearChatHistory(userId: number, videoId: string): Promise<number>;
//# sourceMappingURL=videoRepository.d.ts.map