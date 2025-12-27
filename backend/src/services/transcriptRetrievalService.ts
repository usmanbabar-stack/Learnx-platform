import { logger } from "../utils/logger";
import { getEmbeddings } from "./geminiService";
import { qdrantService } from "./qdrantService";

export interface TranscriptSegment {
  text: string;
  start: number;
  duration: number;
}

export interface TranscriptChunk {
  text: string;
  start: number;
  end: number;
  index: number;
}

interface ChunkOptions {
  segmentsPerChunk?: number;
  overlapSegments?: number;
}

interface RetrieveOptions {
  k?: number;
  useEmbeddings?: boolean;
  useQdrant?: boolean; // Use Qdrant vector search
  currentTime?: number;
  videoId?: string; // Required for Qdrant search
}

export function chunkTranscript(
  transcript: TranscriptSegment[],
  options: ChunkOptions = {}
): TranscriptChunk[] {
  const segmentsPerChunk = Math.max(1, options.segmentsPerChunk ?? Number(process.env.RAG_CHUNK_SIZE_SEGS || 12));
  const overlap = Math.max(0, options.overlapSegments ?? Number(process.env.RAG_CHUNK_OVERLAP_SEGS || 3));

  const chunks: TranscriptChunk[] = [];
  let index = 0;

  for (let i = 0; i < transcript.length; i += (segmentsPerChunk - overlap)) {
    const slice = transcript.slice(i, i + segmentsPerChunk);
    if (slice.length === 0) continue;
    const text = slice.map(s => s.text).join(" ");
    const start = slice[0].start;
    const end = slice[slice.length - 1].start + slice[slice.length - 1].duration;
    chunks.push({ text, start, end, index: index++ });
  }

  return chunks;
}

function computeLexicalScore(query: string, text: string): number {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  const words = q.split(/\s+/).filter(w => w.length > 2); // Filter stopwords
  let score = 0;
  
  // Exact phrase match - high score
  if (t.includes(q)) score += 10;
  
  // Word matching - more lenient scoring
  for (const w of words) {
    if (t.includes(w)) {
      const occurrences = t.split(w).length - 1;
      score += Math.min(occurrences, 5) * 2.5; // Increased from 1.2 to 2.5
    }
  }
  
  // Partial word matching for technical terms
  for (const w of words) {
    if (w.length > 4) { // Only for longer words
      const partial = w.slice(0, Math.floor(w.length * 0.7)); // 70% of word
      if (t.includes(partial) && !t.includes(w)) {
        score += 1.5; // Partial match bonus
      }
    }
  }
  
  return score;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function retrieveRelevantChunks(
  transcript: TranscriptSegment[],
  query: string,
  opts: RetrieveOptions = {}
): Promise<{ contextText: string; topChunks: TranscriptChunk[] }> {
  const k = Math.max(1, opts.k ?? Number(process.env.RAG_MAX_CHUNKS || 10));
  const useQdrant = opts.useQdrant ?? String(process.env.USE_QDRANT || "true").toLowerCase() === "true";
  const useEmb = Boolean(
    String((opts.useEmbeddings ?? (process.env.USE_EMBEDDINGS || "false"))).toLowerCase() === "true"
  );
  const currentTime = typeof opts.currentTime === 'number' ? opts.currentTime : undefined;
  const timeBonusSec = Number(process.env.RAG_TIME_BONUS_SEC || 60);
  const videoId = opts.videoId;

  // Try Qdrant vector search first (fastest and most accurate)
  if (useQdrant && videoId) {
    try {
      const qdrantResults = await qdrantService.searchChunks(videoId, query, k * 2, 0.3);
      
      if (qdrantResults.length > 0) {
        logger.info(`✅ Qdrant found ${qdrantResults.length} chunks for ${videoId}`);
        
        // Convert Qdrant chunks to TranscriptChunk format
        let topChunks: TranscriptChunk[] = qdrantResults.map(r => r.chunk);
        
        // Apply time proximity bonus if currentTime is provided
        if (typeof currentTime === 'number') {
          const chunksWithScores = topChunks.map(ch => {
            const center = (ch.start + ch.end) / 2;
            const dist = Math.abs(center - currentTime);
            const timeBonus = dist <= timeBonusSec ? (timeBonusSec - dist) / timeBonusSec : 0;
            const qdrantScore = qdrantResults.find(r => r.chunk.index === ch.index)?.score || 0;
            return { chunk: ch, score: qdrantScore + timeBonus };
          }).sort((a, b) => b.score - a.score).slice(0, k);
          
          topChunks = chunksWithScores.map(c => c.chunk);
        } else {
          topChunks = topChunks.slice(0, k);
        }
        
        // Sort by start time for readability
        topChunks.sort((a, b) => a.start - b.start);
        
        const serialized = topChunks.map(c => {
          const mm = Math.floor(c.start / 60).toString().padStart(2, '0');
          const ss = Math.floor(c.start % 60).toString().padStart(2, '0');
          return `[#${c.index} @ ${mm}:${ss}]\n${c.text}`;
        }).join("\n\n---\n\n");
        
        const maxChars = Number(process.env.RAG_MAX_CONTEXT_CHARS || 20000);
        const contextText = serialized.length > maxChars ? serialized.slice(0, maxChars) : serialized;
        
        return { contextText, topChunks };
      }
    } catch (error) {
      logger.warn("Qdrant search failed, falling back to in-memory search:", error);
    }
  }

  // Fallback to in-memory chunking and scoring (original method)
  const chunks = chunkTranscript(transcript);
  if (chunks.length === 0) return { contextText: "", topChunks: [] };

  // Lexical base score
  const baseScores = chunks.map(ch => ({ ch, score: computeLexicalScore(query, ch.text) }));

  // Optional recency/time proximity bonus
  if (typeof currentTime === 'number') {
    for (const s of baseScores) {
      const center = (s.ch.start + s.ch.end) / 2;
      const dist = Math.abs(center - currentTime);
      if (dist <= timeBonusSec) {
        s.score += (timeBonusSec - dist) / timeBonusSec; // up to +1 near current time
      }
    }
  }

  // Optional embeddings rerank (if not using Qdrant)
  if (useEmb && !useQdrant) {
    try {
      const model = process.env.EMBEDDING_MODEL || "text-embedding-004";
      const qEmb = await getEmbeddings([query], model);
      const cEmb = await getEmbeddings(chunks.map(c => c.text), model);
      if (qEmb.length === 1 && cEmb.length === chunks.length) {
        for (let i = 0; i < baseScores.length; i++) {
          const sim = cosineSimilarity(qEmb[0], cEmb[i]);
          baseScores[i].score += sim * 5; // weight embedding similarity
        }
      }
    } catch (e) {
      logger.warn("Embedding rerank failed, continuing with lexical only: %o", e);
    }
  }

  // Select top-k
  const top = baseScores
    .sort((a, b) => b.score - a.score)
    .slice(0, k)
    .map(s => s.ch)
    .sort((a, b) => a.start - b.start);

  const serialized = top.map(c => {
    const mm = Math.floor(c.start / 60).toString().padStart(2, '0');
    const ss = Math.floor(c.start % 60).toString().padStart(2, '0');
    return `[#${c.index} @ ${mm}:${ss}]\n${c.text}`;
  }).join("\n\n---\n\n");

  // Cap overall context length to protect LLM input size
  const maxChars = Number(process.env.RAG_MAX_CONTEXT_CHARS || 20000);
  const contextText = serialized.length > maxChars ? serialized.slice(0, maxChars) : serialized;

  return { contextText, topChunks: top };
}


