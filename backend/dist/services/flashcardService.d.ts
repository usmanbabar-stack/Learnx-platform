import { TranscriptSegment } from './transcriptOrchestrationService';
export interface Flashcard {
    id: string;
    question: string;
    answer: string;
    category: string;
    difficulty: 'easy' | 'medium' | 'hard';
    timestamp?: string;
}
export interface FlashcardDeck {
    videoId: string;
    videoTitle: string;
    cards: Flashcard[];
    totalCards: number;
    categories: string[];
    generatedAt: string;
}
export declare class FlashcardService {
    private static instance;
    private cache;
    private inFlightRequests;
    private constructor();
    static getInstance(): FlashcardService;
    generateFlashcards(transcript: TranscriptSegment[], videoId: string, videoTitle: string, cardCount?: number): Promise<FlashcardDeck>;
    private doGenerateFlashcards;
    private prepareTranscriptWithTimestamps;
    private validateDifficulty;
    private getFallbackFlashcards;
}
export declare const flashcardService: FlashcardService;
//# sourceMappingURL=flashcardService.d.ts.map