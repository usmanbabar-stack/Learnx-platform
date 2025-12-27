import { logger } from '../utils/logger';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TranscriptSegment } from './transcriptOrchestrationService';

// Use dedicated GOOGLE_API_KEY_2 for Summary/Glossary (separate from chatbot)
function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY_2 || process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || '';
  if (!key) {
    throw new Error('Missing Gemini API key. Set GOOGLE_API_KEY_2 in .env');
  }
  return key;
}

// Always create fresh client to pick up any API key changes
function getClient(): GoogleGenerativeAI {
  return new GoogleGenerativeAI(getApiKey());
}

// SINGLE MODEL ONLY - to ensure max 1 API call per glossary request
// gemini-2.5-flash has quota available
const MODELS_TO_TRY = [
  'gemini-2.5-flash',           // Only model - 1 API call max
];

// NO RETRIES - to minimize API calls
const MAX_TRANSCRIPT_CHARS = 20000; // ~5000 tokens input

// Delay helper for retry logic
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export interface GlossaryTerm {
  id: string;
  term: string;
  definition: string;
  category: string;
  relatedTerms: string[];
  videoTimestamp?: number;
  timestampFormatted?: string;
}

export interface VideoGlossary {
  terms: GlossaryTerm[];
  categories: string[];
  totalTerms: number;
  videoId: string;
  generatedAt: string;
}

export class GlossaryService {
  private static instance: GlossaryService;
  private cache: Map<string, VideoGlossary> = new Map();
  // Track in-flight requests to prevent duplicate API calls
  private inFlightRequests: Map<string, Promise<VideoGlossary>> = new Map();

  private constructor() {}

  static getInstance(): GlossaryService {
    if (!GlossaryService.instance) {
      GlossaryService.instance = new GlossaryService();
    }
    return GlossaryService.instance;
  }

  async generateGlossary(
    transcript: TranscriptSegment[],
    videoId: string,
    videoTitle: string
  ): Promise<VideoGlossary> {
    // Check cache first
    const cached = this.cache.get(videoId);
    if (cached) {
      logger.info(`Returning cached glossary for ${videoId}`);
      return cached;
    }

    // If request is already in-flight, return the same promise (deduplication)
    if (this.inFlightRequests.has(videoId)) {
      logger.info(`Glossary request already in-flight for ${videoId}, returning existing promise`);
      return this.inFlightRequests.get(videoId)!;
    }
    
    // Create the actual request promise
    const requestPromise = this.doGenerateGlossary(transcript, videoId, videoTitle);
    this.inFlightRequests.set(videoId, requestPromise);
    
    try {
      const result = await requestPromise;
      this.cache.set(videoId, result);
      return result;
    } finally {
      this.inFlightRequests.delete(videoId);
    }
  }

  private async doGenerateGlossary(
    transcript: TranscriptSegment[],
    videoId: string,
    videoTitle: string
  ): Promise<VideoGlossary> {

    if (!transcript || transcript.length === 0) {
      throw new Error('Cannot generate glossary: transcript is empty');
    }

    const fullText = this.prepareTranscriptWithTimestamps(transcript);
    const wordCount = fullText.split(' ').length;

    logger.info(`Generating glossary for "${videoTitle}": ${wordCount} words`);

    const prompt = `Extract key terms from this educational video transcript and return ONLY valid JSON.

IMPORTANT: Always respond in ENGLISH only. Do not use Hindi, Hinglish, or any other language. Even if the transcript contains non-English words, your definitions and terms must be 100% in English.

VIDEO TITLE: ${videoTitle}

TRANSCRIPT:
${fullText.slice(0, MAX_TRANSCRIPT_CHARS)}

INSTRUCTIONS:
1. Identify 8-15 important technical terms, concepts, or definitions
2. Return ONLY a JSON object, no markdown, no explanation
3. Write ALL content in English only
4. Use this exact format:

{"terms":[{"term":"Example Term","definition":"A clear 1-2 sentence definition in English","category":"Concept","relatedTerms":["Related1"],"timestampSeconds":60}]}

Categories can be: Concept, Algorithm, Technology, Protocol, Tool, Programming, Security, or other relevant categories.`;

    // Try each model (NO RETRIES to minimize API calls)
    const genAI = getClient();
    let lastError: any = null;
    
    for (const modelName of MODELS_TO_TRY) {
      // Single attempt per model (no retry loop)
      try {
        logger.info(`Glossary: Trying ${modelName}`);
        
        const model = genAI.getGenerativeModel({ 
          model: modelName,
          generationConfig: {
            temperature: 0.3,
            topP: 0.9,
            maxOutputTokens: 8192,
            responseMimeType: 'application/json',
          },
        });

          const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
          });

          const text = result.response.text();
          
          logger.info(`Gemini raw response length for glossary: ${text?.length || 0}`);
          
          // LOG THE ACTUAL RAW TEXT FOR DEBUGGING
          logger.info(`Glossary RAW RESPONSE: ${text}`);
          
          if (!text || text.trim().length === 0) {
            logger.warn(`${modelName} returned empty response, trying next...`);
            break; // Try next model
          }

          // Enhanced JSON extraction - handle various formats
          let jsonStr = text.trim();
          
          // Remove markdown code blocks
          if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.slice(7);
          } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.slice(3);
          }
          if (jsonStr.endsWith('```')) {
            jsonStr = jsonStr.slice(0, -3);
          }
          jsonStr = jsonStr.trim();
          
          // Try to find JSON object in the response if direct parse fails
          let parsed;
          try {
            parsed = JSON.parse(jsonStr);
          } catch (parseError) {
            // Try to extract JSON object using regex
            const jsonMatch = text.match(/\{[\s\S]*"terms"[\s\S]*\}/);
            if (jsonMatch) {
              try {
                parsed = JSON.parse(jsonMatch[0]);
                logger.info('Glossary: Extracted JSON using regex fallback');
              } catch (e) {
                logger.error('Glossary JSON parse failed, raw text:', text.slice(0, 800));
                break; // Try next model
              }
            } else {
              logger.error('Glossary JSON parse failed, no JSON found. Raw text:', text.slice(0, 800));
              break; // Try next model
            }
          }

          // Process and validate terms
          const terms: GlossaryTerm[] = (parsed.terms || []).map((t: any, index: number) => ({
            id: `${videoId}-term-${index + 1}`,
            term: t.term || 'Unknown Term',
            definition: t.definition || 'Definition not available',
            category: t.category || 'General',
            relatedTerms: Array.isArray(t.relatedTerms) ? t.relatedTerms : [],
            videoTimestamp: typeof t.timestampSeconds === 'number' ? t.timestampSeconds : undefined,
            timestampFormatted: typeof t.timestampSeconds === 'number' 
              ? this.formatTimestamp(t.timestampSeconds) 
              : undefined
          }));

          // VALIDATION: Ensure we have actual content
          if (terms.length === 0) {
            logger.warn(`${modelName} returned 0 terms, trying next...`);
            continue; // Try next model
          }

          // Extract unique categories
          const categories = [...new Set(terms.map(t => t.category))].sort();

          const glossary: VideoGlossary = {
            terms: terms.sort((a, b) => a.term.localeCompare(b.term)),
            categories,
            totalTerms: terms.length,
            videoId,
            generatedAt: new Date().toISOString()
          };

          // Cache the result (only if valid)
          this.cache.set(videoId, glossary);

          logger.info(`✅ Glossary generated with ${modelName}: ${terms.length} terms in ${categories.length} categories`);
          return glossary;

        } catch (error: any) {
          lastError = error;
          logger.warn(`${modelName} failed: ${error?.message || error}`);
          continue; // Try next model
        }
    }

    // All models failed
    logger.error('All models failed for glossary generation:', {
      message: lastError?.message || 'Unknown error',
      status: lastError?.status,
      statusText: lastError?.statusText,
    });
    return this.getFallbackGlossary(videoId, videoTitle);
  }

  private prepareTranscriptWithTimestamps(transcript: TranscriptSegment[]): string {
    return transcript
      .map((seg) => {
        const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
        const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
        return `[${mm}:${ss}] ${seg.text}`;
      })
      .join('\n');
  }

  private formatTimestamp(seconds: number): string {
    const mm = Math.floor(seconds / 60).toString().padStart(2, '0');
    const ss = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${mm}:${ss}`;
  }

  private getFallbackGlossary(videoId: string, videoTitle: string): VideoGlossary {
    logger.warn(`Returning fallback glossary for ${videoId}`);
    return {
      terms: [],
      categories: [],
      totalTerms: 0,
      videoId,
      generatedAt: new Date().toISOString()
    };
  }

  // Clear cache for a specific video
  clearCache(videoId: string): void {
    this.cache.delete(videoId);
  }

  // Clear all cache
  clearAllCache(): void {
    this.cache.clear();
  }
}

export const glossaryService = GlossaryService.getInstance();
