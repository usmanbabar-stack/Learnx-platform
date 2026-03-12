import { GoogleGenerativeAI } from "@google/generative-ai";
import { logger } from "../utils/logger";

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || "";
  if (!key) {
    throw new Error("Missing Google Gemini API key. Set GOOGLE_API_KEY (preferred) or GEMINI_API_KEY.");
  }
  return key;
}

let client: GoogleGenerativeAI | null = null;

function getClient(): GoogleGenerativeAI {
  if (!client) {
    client = new GoogleGenerativeAI(getApiKey());
  }
  return client;
}

export interface GeminiAskInput {
  question: string;
  transcriptContext: string;
}

export interface GeminiAskOutput {
  answer: string;
  reasoning?: string;
  outOfContext: boolean;
  citations?: Array<{ snippet: string; timestamp?: string }>; // best-effort
}

async function tryGenerate(modelName: string, systemPrompt: string, userPrompt: string, retryCount = 0): Promise<any> {
  const genAI = getClient();
  const model = genAI.getGenerativeModel({ model: modelName });
  
  try {
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: systemPrompt + "\n\n" + userPrompt }] },
      ],
      generationConfig: {
        temperature: 0.7,
        topP: 0.9,
        maxOutputTokens: 4096,  // Increased to prevent cutoff
        candidateCount: 1,
      },
    });
    
    const text = result.response?.text?.() || "";
    
    // If empty and we haven't retried yet, retry once with same model
    if ((!text || text.trim().length < 50) && retryCount < 2) {
      logger.warn(`Model ${modelName} returned short/empty response, retrying (attempt ${retryCount + 1})`);
      await new Promise(r => setTimeout(r, 500)); // Small delay before retry
      return tryGenerate(modelName, systemPrompt, userPrompt, retryCount + 1);
    }
    
    return result;
  } catch (err) {
    // Retry on transient errors
    if (retryCount < 2) {
      const errMsg = err instanceof Error ? err.message : String(err);
      if (errMsg.includes('503') || errMsg.includes('500') || errMsg.includes('timeout') || errMsg.includes('UNAVAILABLE')) {
        logger.warn(`Model ${modelName} transient error, retrying (attempt ${retryCount + 1}): ${errMsg}`);
        await new Promise(r => setTimeout(r, 1000));
        return tryGenerate(modelName, systemPrompt, userPrompt, retryCount + 1);
      }
    }
    throw err;
  }
}

export async function askGemini(input: GeminiAskInput): Promise<GeminiAskOutput> {
  const systemPrompt = `You are a knowledgeable AI tutor specialized in the subject matter of the video. Your role is to give accurate, technical explanations based on the video content.

RESPONSE RULES:
1. Stay within the technical scope of the video topic (programming, science, etc.)
2. Give precise, educational answers like a subject matter expert would
3. Reference specific parts of the video when explaining concepts
4. Use proper technical terminology appropriate to the subject
5. Keep answers focused and informative (150-250 words)

VIDEO CITATIONS:
When your answer comes from the video, cite it naturally:
- "As explained in the video at around 0:07..."
- "The instructor mentions that..."
- "According to the video..."
- "At timestamp X:XX, the video shows..."

FORMAT RULES (CRITICAL):
- Write in plain text paragraphs only
- NO markdown symbols whatsoever: no **, no ##, no -, no *, no bullets, no numbered lists with dots
- Use natural sentence flow instead of bullet points
- Separate ideas with line breaks between paragraphs
- If listing steps, write them as: "First... Then... Next... Finally..."

CONTENT:
- Base your answer primarily on the video transcript provided
- Add relevant technical context from your knowledge when helpful
- Never refuse to answer
- Be direct and informative, not overly casual`;

  const userPrompt = `VIDEO TRANSCRIPT:
${input.transcriptContext}

QUESTION:
${input.question}

Give a clear, technical answer based on the video content. Reference specific parts of the video when relevant. Write in plain text only with no special formatting symbols.`;

  // Log the prompt being sent (first 500 chars for debugging)
  logger.info(`Gemini prompt preview: ${userPrompt.slice(0, 500)}...`);
  logger.info(`Context length: ${input.transcriptContext.length} chars`);

  const primary = GEMINI_MODEL;
  const fallbacks = [
    primary,
    "gemini-2.5-flash",        // Use 2.5 instead of 2.0 (2.0 quota exhausted)
    "gemma-3-12b-it",          // Gemma as backup
  ];

  let lastErr: unknown = null;
  
  for (const m of fallbacks) {
    try {
      const result = await tryGenerate(m, systemPrompt, userPrompt);
      const text = result.response.text();
      
      // Log the raw response for debugging
      logger.info(`Gemini response preview (${m}): ${text.slice(0, 300)}...`);
      
      // Check if response is empty or too short
      if (!text || text.trim().length < 50) {
        logger.error(`❌ Gemini returned empty/short response with model ${m}`);
        throw new Error('Empty or too short response, trying next model');
      }
      
      // Use text directly (no JSON parsing since we disabled JSON mode)
      let answer = text?.trim() || "";
      
      // Check for truncated response (ends abruptly mid-word or mid-sentence)
      const lastChar = answer.slice(-1);
      const endsCleanly = ['.', '!', '?', ')', '"', "'", '\n'].includes(lastChar);
      if (!endsCleanly && answer.length > 100) {
        // Response might be cut off - try to find last complete sentence
        const lastPeriod = answer.lastIndexOf('. ');
        const lastQuestion = answer.lastIndexOf('? ');
        const lastExclaim = answer.lastIndexOf('! ');
        const lastComplete = Math.max(lastPeriod, lastQuestion, lastExclaim);
        
        if (lastComplete > answer.length * 0.7) {
          // Found a reasonable cutoff point, trim there
          answer = answer.slice(0, lastComplete + 1);
          logger.warn(`Trimmed potentially truncated response at position ${lastComplete}`);
        } else {
          // Response seems badly truncated, try next model
          logger.warn(`❌ Response appears truncated (ends with "${answer.slice(-20)}")`);
          throw new Error('Truncated response, trying next model');
        }
      }
      
      if (answer.length === 0) {
        logger.error(`❌ Gemini returned empty response with model ${m}`);
        throw new Error('Empty response from Gemini');
      }
      
      // Check if it's a refusal
      const lowerAnswer = answer.toLowerCase();
      if (lowerAnswer.includes("could not find an answer") ||
          lowerAnswer.includes("cannot find an answer") ||
          lowerAnswer.includes("don't have enough information") ||
          lowerAnswer.includes("not enough information in the current context")) {
        logger.error(`❌ Gemini refused to answer: "${answer.slice(0, 150)}"`);
        throw new Error('Refusal response, trying next model or retry');
      }
      
      logger.info(`✅ Gemini provided valid answer (${answer.length} chars)`);
      return {
        answer,
        reasoning: "Generated from transcript context",
        outOfContext: false,
        citations: undefined
      };
    } catch (err) {
      lastErr = err;
      logger.warn(`Gemini model ${m} failed: ${err instanceof Error ? err.message : String(err)}`);
      continue;
    }
  }

  // If all models failed, try one last time with simple prompt
  logger.error("All Gemini models failed, trying simple prompt as last resort");
  try {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    
    const simplePrompt = `You are a helpful AI tutor. Answer this question based on the video transcript provided.

Question: ${input.question}

Video Transcript:
${input.transcriptContext.slice(0, 30000)}

Provide a detailed, helpful answer based on the transcript. If the exact topic isn't in the transcript, use related information and supplement with your general knowledge. ALWAYS provide a complete answer.`;

    const result = await model.generateContent(simplePrompt);
    const text = result.response.text();
    
    if (text && text.trim().length > 0) {
      logger.info(`✅ Simple prompt fallback succeeded`);
      return {
        answer: text.trim(),
        reasoning: "Used simple prompt fallback",
        outOfContext: false
      };
    }
  } catch (simpleErr) {
    logger.error("Simple prompt fallback also failed:", simpleErr);
  }

  logger.error("Gemini ask error (all methods failed):", lastErr);
  return {
    answer: "I'm experiencing technical difficulties with the AI service. Please try again in a moment.",
    outOfContext: false,
    reasoning: "All Gemini models failed"
  };
}

// 🚀 OPTIMIZED: Batch embedding helper with parallel processing
export async function getEmbeddings(texts: string[], modelName: string = "gemini-embedding-001"): Promise<number[][]> {
  if (texts.length === 0) return [];
  
  try {
    const genAI = getClient();
    const embModel = genAI.getGenerativeModel({ model: modelName });
    
    const BATCH_SIZE = 25;
    const results: number[][] = [];
    const CONCURRENT_BATCHES = 3;
    const batches: string[][] = [];
    
    for (let i = 0; i < texts.length; i += BATCH_SIZE) {
      batches.push(texts.slice(i, i + BATCH_SIZE));
    }
    
    for (let b = 0; b < batches.length; b += CONCURRENT_BATCHES) {
      const concurrentBatches = batches.slice(b, b + CONCURRENT_BATCHES);
      
      const batchPromises = concurrentBatches.map(async (batch) => {
        const itemPromises = batch.map(async (t) => {
          try {
            const r = await embModel.embedContent(t);
            const values = r?.embedding?.values;
            if (!values || values.length === 0) {
              logger.warn(`Embedding returned empty values for text: "${t.substring(0, 50)}..."`);
              return [];
            }
            return values;
          } catch (e) {
            logger.warn(`Single embedding failed: ${e}`);
            return [];
          }
        });
        return Promise.all(itemPromises);
      });
      
      const concurrentResults = await Promise.all(batchPromises);
      for (const batchResult of concurrentResults) {
        results.push(...batchResult);
      }
    }
    
    const emptyCount = results.filter(r => r.length === 0).length;
    if (emptyCount > 0) {
      logger.warn(`${emptyCount}/${results.length} embeddings returned empty`);
    }
    
    return results;
  } catch (e) {
    logger.error("Embedding generation failed: %o", e);
    return texts.map(() => []);
  }
}