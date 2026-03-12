export type QueryIntent = 'summary_overview' | 'specific_concept' | 'timestamp_reference' | 'comparison' | 'general_knowledge' | 'explanation' | 'greeting' | 'off_topic' | 'inappropriate';
export interface IntentAnalysis {
    intent: QueryIntent;
    requiresRetrieval: boolean;
    requiresFullTranscript: boolean;
    confidence: number;
    reasoning: string;
}
export interface MessageClassification {
    isValid: boolean;
    category: 'educational' | 'greeting' | 'off_topic' | 'inappropriate' | 'unclear';
    reason: string;
}
export declare class AgenticRagService {
    private static instance;
    private constructor();
    static getInstance(): AgenticRagService;
    /**
     * 🛡️ PRE-FILTER: Classify message BEFORE any expensive RAG processing
     * Uses fast Gemini Flash model for robust classification
     */
    classifyMessage(message: string, videoTitle: string): Promise<MessageClassification>;
    /**
     * Quick pattern check for obvious cases (no API call needed)
     */
    private quickPatternCheck;
    analyzeIntent(question: string, videoTitle?: string): Promise<IntentAnalysis>;
    private rulesBasedClassification;
    private llmBasedClassification;
    private performLLMClassification;
}
export declare const agenticRagService: AgenticRagService;
//# sourceMappingURL=agenticRagService.d.ts.map