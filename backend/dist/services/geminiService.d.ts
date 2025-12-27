export interface GeminiAskInput {
    question: string;
    transcriptContext: string;
}
export interface GeminiAskOutput {
    answer: string;
    reasoning?: string;
    outOfContext: boolean;
    citations?: Array<{
        snippet: string;
        timestamp?: string;
    }>;
}
export declare function askGemini(input: GeminiAskInput): Promise<GeminiAskOutput>;
export declare function getEmbeddings(texts: string[], modelName?: string): Promise<number[][]>;
//# sourceMappingURL=geminiService.d.ts.map