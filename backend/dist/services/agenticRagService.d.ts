export type QueryIntent = 'summary_overview' | 'specific_concept' | 'timestamp_reference' | 'comparison' | 'general_knowledge' | 'explanation';
export interface IntentAnalysis {
    intent: QueryIntent;
    requiresRetrieval: boolean;
    requiresFullTranscript: boolean;
    confidence: number;
    reasoning: string;
}
export declare class AgenticRagService {
    private static instance;
    private constructor();
    static getInstance(): AgenticRagService;
    analyzeIntent(question: string, videoTitle?: string): Promise<IntentAnalysis>;
    private rulesBasedClassification;
    private llmBasedClassification;
    private performLLMClassification;
}
export declare const agenticRagService: AgenticRagService;
//# sourceMappingURL=agenticRagService.d.ts.map