"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.askGemini = askGemini;
exports.getEmbeddings = getEmbeddings;
const generative_ai_1 = require("@google/generative-ai");
const logger_1 = require("../utils/logger");
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";
function getApiKey() {
    const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_CLOUD_API_KEY || "";
    if (!key) {
        throw new Error("Missing Google Gemini API key. Set GOOGLE_API_KEY (preferred) or GEMINI_API_KEY.");
    }
    return key;
}
let client = null;
function getClient() {
    if (!client) {
        client = new generative_ai_1.GoogleGenerativeAI(getApiKey());
    }
    return client;
}
async function tryGenerate(modelName, systemPrompt, userPrompt) {
    const genAI = getClient();
    const model = genAI.getGenerativeModel({ model: modelName });
    return await model.generateContent({
        contents: [
            { role: "user", parts: [{ text: systemPrompt }] },
            { role: "user", parts: [{ text: userPrompt }] },
        ],
        generationConfig: {
            temperature: 0.5,
            topP: 0.95,
            maxOutputTokens: 2048,
            candidateCount: 1,
        },
    });
}
async function askGemini(input) {
    const systemPrompt = `You are a very friendly AI tutor. Your job is to explain things in **very simple words** and **a lot of detail**, like you are teaching a complete beginner.

CRITICAL STYLE RULES (ALWAYS FOLLOW THESE):
- Use short, clear sentences
- Avoid heavy jargon; if you must use a term, explain it in simple words
- Whenever the question asks \"how\" or \"step by step\", ALWAYS answer in a **numbered step-by-step list**
- Give concrete mini‑examples to make ideas clear
- Aim for a detailed answer (at least 8–12 sentences or 8–12 bullet points), not just 2–3 lines

CONTENT RULES:
- Use the video transcript as your main source of truth when it is relevant
- If the exact thing is not in the transcript, find the closest related ideas and build from them
- Add your own knowledge to fill gaps and give intuition

YOU MUST NEVER:
- Say \"I could not find an answer\" or \"there is not enough information\"
- Answer in only 1–2 short lines for conceptual questions

Your goal is: **make the student really understand the idea in simple language with step‑by‑step explanation and examples**.`;
    const userPrompt = `Video Transcript (context from the video):
${input.transcriptContext}

Student's Question:
${input.question}

Now write your answer:
- First, one short, simple overview (2–3 sentences)
- Then, a clear numbered step‑by‑step explanation
- Then, a tiny concrete example to make it real
- Use simple language so a beginner can follow.`;
    // Log the prompt being sent (first 500 chars for debugging)
    logger_1.logger.info(`Gemini prompt preview: ${userPrompt.slice(0, 500)}...`);
    logger_1.logger.info(`Context length: ${input.transcriptContext.length} chars`);
    const primary = GEMINI_MODEL;
    const fallbacks = [
        primary,
        "gemini-2.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-1.5-flash",
        "gemini-1.5-pro-latest",
        "gemini-1.5-pro-002",
    ];
    let lastErr = null;
    for (const m of fallbacks) {
        try {
            const result = await tryGenerate(m, systemPrompt, userPrompt);
            const text = result.response.text();
            // Log the raw response for debugging
            logger_1.logger.info(`Gemini response preview: ${text.slice(0, 300)}...`);
            // Check if response is empty
            if (!text || text.trim().length === 0) {
                logger_1.logger.error(`❌ Gemini returned empty response with model ${m}`);
                throw new Error('Empty response, trying next model');
            }
            // Use text directly (no JSON parsing since we disabled JSON mode)
            const answer = text?.trim() || "";
            if (answer.length === 0) {
                logger_1.logger.error(`❌ Gemini returned empty response with model ${m}`);
                throw new Error('Empty response from Gemini');
            }
            // Check if it's a refusal
            const lowerAnswer = answer.toLowerCase();
            if (lowerAnswer.includes("could not find an answer") ||
                lowerAnswer.includes("cannot find an answer") ||
                lowerAnswer.includes("don't have enough information") ||
                lowerAnswer.includes("not enough information in the current context")) {
                logger_1.logger.error(`❌ Gemini refused to answer: "${answer.slice(0, 150)}"`);
                throw new Error('Refusal response, trying next model or retry');
            }
            logger_1.logger.info(`✅ Gemini provided valid answer (${answer.length} chars)`);
            return {
                answer,
                reasoning: "Generated from transcript context",
                outOfContext: false,
                citations: undefined
            };
        }
        catch (err) {
            lastErr = err;
            logger_1.logger.warn(`Gemini model ${m} failed: ${err instanceof Error ? err.message : String(err)}`);
            continue;
        }
    }
    // If all models failed, try one last time with simple prompt
    logger_1.logger.error("All Gemini models failed, trying simple prompt as last resort");
    try {
        const genAI = getClient();
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const simplePrompt = `You are a helpful AI tutor. Answer this question based on the video transcript provided.

Question: ${input.question}

Video Transcript:
${input.transcriptContext.slice(0, 30000)}

Provide a detailed, helpful answer based on the transcript. If the exact topic isn't in the transcript, use related information and supplement with your general knowledge. ALWAYS provide a complete answer.`;
        const result = await model.generateContent(simplePrompt);
        const text = result.response.text();
        if (text && text.trim().length > 0) {
            logger_1.logger.info(`✅ Simple prompt fallback succeeded`);
            return {
                answer: text.trim(),
                reasoning: "Used simple prompt fallback",
                outOfContext: false
            };
        }
    }
    catch (simpleErr) {
        logger_1.logger.error("Simple prompt fallback also failed:", simpleErr);
    }
    logger_1.logger.error("Gemini ask error (all methods failed):", lastErr);
    return {
        answer: "I'm experiencing technical difficulties with the AI service. Please try again in a moment.",
        outOfContext: false,
        reasoning: "All Gemini models failed"
    };
}
// 🚀 OPTIMIZED: Batch embedding helper with parallel processing
async function getEmbeddings(texts, modelName = "text-embedding-004") {
    if (texts.length === 0)
        return [];
    try {
        const genAI = getClient();
        const embModel = genAI.getGenerativeModel({ model: modelName });
        // ⚡ OPTIMIZED: Increased from 10 to 25 for faster throughput
        // Gemini embedding API can handle higher concurrency
        const BATCH_SIZE = 25;
        const results = [];
        // ⚡ Process multiple batches concurrently (up to 3 at a time)
        const CONCURRENT_BATCHES = 3;
        const batches = [];
        for (let i = 0; i < texts.length; i += BATCH_SIZE) {
            batches.push(texts.slice(i, i + BATCH_SIZE));
        }
        for (let b = 0; b < batches.length; b += CONCURRENT_BATCHES) {
            const concurrentBatches = batches.slice(b, b + CONCURRENT_BATCHES);
            const batchPromises = concurrentBatches.map(async (batch) => {
                // Process items within each batch in parallel
                const itemPromises = batch.map(async (t) => {
                    try {
                        const r = await embModel.embedContent({ content: { parts: [{ text: t }] } });
                        return r?.embedding?.values || r?.embedding?.value || [];
                    }
                    catch (e) {
                        logger_1.logger.warn(`Single embedding failed, returning empty: ${e}`);
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
        return results;
    }
    catch (e) {
        logger_1.logger.warn("Embedding generation failed: %o", e);
        return texts.map(() => []);
    }
}
//# sourceMappingURL=geminiService.js.map