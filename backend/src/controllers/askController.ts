import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { videoRepository } from '../repositories/videoRepository';
import { logger } from '../utils/logger';
import { askGemini } from '../services/geminiService';
import { retrieveRelevantChunks, TranscriptSegment } from '../services/transcriptRetrievalService';
import { transcriptOrchestrationService } from '../services/transcriptOrchestrationService';
import { agenticRagService } from '../services/agenticRagService';
import { summaryService } from '../services/summaryService';
import { getRedisClient } from '../config/redis';

function extractContextWindow(transcript: Array<{ text: string; start: number; duration: number }>, currentTime: number, windowSeconds: number = 120): string {
  if (!Array.isArray(transcript) || transcript.length === 0) return '';
  const startTime = Math.max(0, currentTime - Math.floor(windowSeconds / 2));
  const endTime = currentTime + Math.floor(windowSeconds / 2);
  const segments = transcript.filter(seg => (seg.start >= startTime && seg.start <= endTime) || (seg.start < startTime && (seg.start + seg.duration) > startTime));

  return segments
    .map(seg => {
      const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
      const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
      return `[${mm}:${ss}] ${seg.text}`;
    })
    .join('\n');
}

export class AskController {
  async ask(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({ success: false, message: 'Validation errors', errors: errors.array() });
        return;
      }

      const { videoId, question, currentTime } = req.body as { videoId: string; question: string; currentTime?: number };
      const time = typeof currentTime === 'number' && currentTime >= 0 ? currentTime : 0;
      const startTime = Date.now();

      // 🛡️ STEP 1: Pre-filter message BEFORE any expensive processing
      // This catches greetings, off-topic, and inappropriate messages early
      const videoMetaForClassification = await (async () => {
        try {
          const video = await videoRepository.findByVideoId(videoId);
          return video?.metadata?.title || 'Educational Video';
        } catch {
          return 'Educational Video';
        }
      })();

      const messageClassification = await agenticRagService.classifyMessage(question, videoMetaForClassification);
      
      // Handle non-educational messages immediately (no RAG needed)
      if (messageClassification.category === 'greeting') {
        const greetingResponses = [
          `Hello! 👋 I'm here to help you learn from this video. Ask me any question about the content!`,
          `Hi there! 🎓 Ready to help you understand the video. What would you like to know?`,
          `Hey! 😊 I'm your study assistant. Feel free to ask about anything in the video!`,
        ];
        res.status(200).json({
          success: true,
          data: {
            answer: greetingResponses[Math.floor(Math.random() * greetingResponses.length)],
            reasoning: 'Greeting message',
            outOfContext: false,
            metadata: { intentDetected: 'greeting', processingMode: 'instant', processingTime: Date.now() - startTime }
          }
        });
        return;
      }

      if (messageClassification.category === 'inappropriate') {
        res.status(200).json({
          success: true,
          data: {
            answer: `I'm sorry, I can't respond to that message. Please keep our conversation respectful and focused on learning. 🙏\n\nFeel free to ask me any educational questions about the video!`,
            reasoning: 'Inappropriate content filtered',
            outOfContext: true,
            metadata: { intentDetected: 'inappropriate', processingMode: 'filtered', processingTime: Date.now() - startTime }
          }
        });
        return;
      }

      if (messageClassification.category === 'off_topic') {
        res.status(200).json({
          success: true,
          data: {
            answer: `I'm sorry, I can only answer questions related to this video's educational content. 📚\n\nPlease ask me something about what you're learning in the video!`,
            reasoning: 'Off-topic question filtered',
            outOfContext: true,
            metadata: { intentDetected: 'off_topic', processingMode: 'filtered', processingTime: Date.now() - startTime }
          }
        });
        return;
      }

      // ✅ Message is educational - proceed with normal processing
      logger.info(`Message classified as educational, proceeding with RAG`);

      const cacheKey = `ask:${videoId}:${Buffer.from(question).toString('base64').slice(0, 50)}`;
      
      // Try Redis cache first (if available)
      try {
        const redisClient = getRedisClient();
        const cached = await redisClient?.get(cacheKey);
        if (cached) {
          logger.info(`Cache hit for question on ${videoId}`);
          res.json({ success: true, data: JSON.parse(cached), cached: true });
          return;
        }
      } catch {}

      // 🚀 OPTIMIZATION: Run video metadata fetch and transcript fetch in PARALLEL
      // This saves significant time vs sequential fetching
      let title = videoMetaForClassification; // Reuse from classification
      let channel = '';
      let transcriptQuality: any;

      const [videoResult, transcriptResult] = await Promise.allSettled([
        // Video metadata fetch
        (async () => {
          try {
            const video = await videoRepository.findByVideoId(videoId);
            if (video?.metadata) {
              return { title: video.metadata.title, channel: video.metadata.channel || '' };
            }
          } catch (dbError) {
            logger.warn(`DB query failed, continuing without DB: ${dbError}`);
          }
          return { title: 'Unknown Video', channel: '' };
        })(),
        
        // Transcript fetch (the critical path)
        transcriptOrchestrationService.getHighQualityTranscript(videoId)
      ]);

      // Extract video metadata
      if (videoResult.status === 'fulfilled') {
        title = videoResult.value.title || title;
        channel = videoResult.value.channel || channel;
      }

      // Handle transcript result
      if (transcriptResult.status === 'rejected') {
        logger.error(`Failed to get transcript for ${videoId}:`, transcriptResult.reason);
        res.status(200).json({
          success: true,
          data: {
            answer: "I apologize, but I encountered an error fetching the transcript for this video. This might be due to:\n\n• Network connectivity issues\n• The video being unavailable or private\n• Temporary service issues\n\nPlease try again in a moment, or try a different video.",
            outOfContext: true,
            reasoning: "Transcript fetch error",
            metadata: {
              intentDetected: 'transcript_error',
              processingMode: 'error_handling',
              error: process.env.NODE_ENV === 'development' ? String(transcriptResult.reason) : undefined
            }
          }
        });
        return;
      }

      transcriptQuality = transcriptResult.value;

      logger.info(`Processing question for video: ${videoId} - "${title}"`);

      if (!transcriptQuality || transcriptQuality.segments.length === 0) {
        // No transcript available (no captions or yt-dlp/whisper failed).
        // Instead of giving up, answer using general knowledge so the user
        // still gets value, but clearly mark that it's not grounded in the video.
        logger.warn(`No transcript available for videoId: ${videoId}, falling back to general-knowledge answer`);

        const generalResponse = await askGemini({
          question,
          transcriptContext: `Video Title: ${title}\n\nNote: There is no transcript available for this video (no captions or transcript extraction failed).\nAnswer the student's question using your general knowledge.\nMake it very clear that your answer is NOT directly based on this specific video, but is a general explanation of the topic.`
        });

        const elapsedNoTranscript = Date.now() - startTime;
        logger.info(`Question answered without transcript in ${elapsedNoTranscript}ms (general_knowledge_no_transcript)`);

        res.status(200).json({
          success: true,
          data: {
            ...generalResponse,
            outOfContext: true,
            metadata: {
              intentDetected: 'no_transcript',
              processingMode: 'general_knowledge_no_transcript',
              hasTranscript: false,
              processingTime: elapsedNoTranscript
            }
          }
        });
        return;
      }

      logger.info(`Transcript loaded: ${transcriptQuality.wordCount} words, source: ${transcriptQuality.source}, confidence: ${transcriptQuality.confidence}`);

      const intentAnalysis = await agenticRagService.analyzeIntent(question, title);
      logger.info(`Intent: ${intentAnalysis.intent}, retrieval: ${intentAnalysis.requiresRetrieval}, fullTranscript: ${intentAnalysis.requiresFullTranscript}`);

      let response: any;

      if (intentAnalysis.intent === 'summary_overview') {
        logger.info(`Generating comprehensive summary for ${videoId}`);
        const summary = await summaryService.generateComprehensiveSummary(
          transcriptQuality.segments,
          title,
          channel
        );

        const answer = `**Video Overview:**\n${summary.overview}\n\n**Main Topics:**\n${summary.mainTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}\n\n**Key Takeaways:**\n${summary.keyPoints.map((p, i) => `• ${p}`).join('\n')}\n\n**Key Moments:**\n${summary.keyTimestamps.slice(0, 5).map(kt => `• ${kt.time} - ${kt.description}`).join('\n')}\n\n**Target Audience:** ${summary.targetAudience}\n**Difficulty:** ${summary.difficulty}\n**Watch Time:** ${summary.estimatedWatchTime}`;

        response = {
          answer,
          reasoning: 'Comprehensive summary generated from full transcript',
          outOfContext: false,
          citations: summary.keyTimestamps.map(kt => ({
            snippet: kt.description,
            timestamp: kt.time
          })),
          metadata: {
            intentDetected: 'summary_overview',
            processingMode: 'full_transcript_summary'
          }
        };
      } else if (intentAnalysis.requiresFullTranscript) {
        logger.info(`Using full transcript context for ${videoId}`);
        const fullText = transcriptQuality.segments
          .map((seg: { text: string; start: number; duration: number }, idx: number) => {
            if (idx % 10 === 0) {
              const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
              const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
              return `\n[${mm}:${ss}] ${seg.text}`;
            }
            return seg.text;
          })
          .join(' ')
          .slice(0, 40000);

        const preface = `Video Title: ${title}\nChannel: ${channel}\n\nFull Video Transcript:\n`;
        response = await askGemini({ question, transcriptContext: `${preface}${fullText}` });
        response.metadata = {
          intentDetected: intentAnalysis.intent,
          processingMode: 'full_transcript'
        };
      } else if (intentAnalysis.requiresRetrieval) {
        logger.info(`Using RAG retrieval for ${videoId}`);
        
        // Get MORE chunks for better coverage (using Qdrant for fast vector search)
        const { contextText, topChunks } = await retrieveRelevantChunks(
          transcriptQuality.segments,
          question,
          {
            k: Number(process.env.RAG_MAX_CHUNKS || 10),
            useQdrant: true, // Use Qdrant for fast vector search
            useEmbeddings: String(process.env.USE_EMBEDDINGS || 'false').toLowerCase() === 'true',
            currentTime: time,
            videoId: videoId, // Required for Qdrant video-scoped search
          }
        );

        logger.info(`RAG context: ${contextText.length} chars, ${topChunks.length} chunks`);

        // If RAG returned very little context, use FULL transcript instead
        let finalContext = contextText;
        let usedFullTranscript = false;
        
        if (contextText.length < 500 || topChunks.length < 3) {
          logger.warn(`RAG context too small (${contextText.length} chars), using FULL transcript`);
          finalContext = transcriptQuality.segments
            .map((seg: { text: string; start: number; duration: number }, idx: number) => {
              if (idx % 5 === 0) {
                const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
                const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
                return `\n[${mm}:${ss}] ${seg.text}`;
              }
              return seg.text;
            })
            .join(' ')
            .slice(0, 40000); // Limit to 40K chars to fit in context
          usedFullTranscript = true;
        }

        const preface = `Video Title: ${title}\nChannel: ${channel}\n\n**CRITICAL INSTRUCTIONS - READ CAREFULLY:**
- You MUST answer the question using the transcript below
- DO NOT say "I could not find", "I cannot find", "I don't have information", or "not enough information"
- Find ANY related content in the transcript (even if not exact match) and use it as foundation
- Base your answer on transcript content (70%) + general knowledge (30%)
- If transcript mentions related concepts (e.g., "visiting nodes" for "BFS"), USE THAT as your foundation
- ALWAYS provide a complete, helpful answer
- Use citations with timestamps when referencing transcript

${usedFullTranscript ? 'Full Video Transcript:' : 'Most Relevant Transcript Segments:'}\n`;
        
        response = await askGemini({ question, transcriptContext: `${preface}${finalContext}` });
        
        // Post-process: catch refusals/empty and force better answer
        if (!response.answer || response.answer.trim().length === 0 || (
          response.answer.toLowerCase().includes("could not find") ||
          response.answer.toLowerCase().includes("cannot find") ||
          response.answer.toLowerCase().includes("don't have") ||
          response.answer.toLowerCase().includes("not enough information") ||
          response.answer.toLowerCase().includes("current context")
        )) {
          logger.warn(`⚠️ LLM refused to answer, using full transcript fallback`);
          
          // Force use of full transcript
          const fullContext = transcriptQuality.segments
            .map((seg: { text: string; start: number; duration: number }, idx: number) => {
              if (idx % 5 === 0) {
                const mm = Math.floor(seg.start / 60).toString().padStart(2, '0');
                const ss = Math.floor(seg.start % 60).toString().padStart(2, '0');
                return `\n[${mm}:${ss}] ${seg.text}`;
              }
              return seg.text;
            })
            .join(' ')
            .slice(0, 50000);
            
          const forcedPreface = `Video Title: ${title}\n\n**ABSOLUTE REQUIREMENT: You MUST provide a helpful answer to this question. The full transcript is below. Find ANY related information and answer the question. This is a requirement, not optional.**\n\nFull Transcript:\n`;
          
          response = await askGemini({ question, transcriptContext: `${forcedPreface}${fullContext}` });
          response.metadata = { ...response.metadata, retriedWithFullTranscript: true };
        }

        if (!usedFullTranscript) {
          response.citations = topChunks.map(c => ({
            snippet: c.text.slice(0, 200) + (c.text.length > 200 ? '…' : ''),
            timestamp: `${Math.floor(c.start / 60)}:${Math.floor(c.start % 60).toString().padStart(2, '0')}`
          }));
        }

        response.metadata = {
          intentDetected: intentAnalysis.intent,
          processingMode: usedFullTranscript ? 'full_transcript_fallback' : 'rag_retrieval',
          chunksRetrieved: topChunks.length,
          usedFullTranscript
        };
      } else {
        logger.info(`General knowledge mode for ${videoId}`);
        response = await askGemini({
          question,
          transcriptContext: `Video Title: ${title}\n\nNote: This question appears unrelated to the video content. Provide a brief answer and suggest staying focused on the video topic.`
        });
        response.outOfContext = true;
        response.metadata = {
          intentDetected: intentAnalysis.intent,
          processingMode: 'general_knowledge'
        };
      }

      const elapsed = Date.now() - startTime;
      logger.info(`Question answered in ${elapsed}ms (mode: ${response.metadata?.processingMode})`);

      response.processingTime = elapsed;
      response.transcriptQuality = {
        source: transcriptQuality.source,
        confidence: transcriptQuality.confidence,
        wordCount: transcriptQuality.wordCount
      };

      try {
        const redisClient = getRedisClient();
        await redisClient?.setEx(cacheKey, 3600, JSON.stringify(response));
      } catch {}

      res.json({ success: true, data: response });
    } catch (error) {
      logger.error('Error in /api/ask:', error);
      
      // Provide helpful error message instead of generic error
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      res.status(200).json({
        success: true,
        data: {
          answer: "I apologize, but I encountered an error processing your question. This might be due to:\n\n• Network connectivity issues\n• API rate limiting\n• Transcript processing timeout\n\nPlease try asking your question again. If the issue persists, try a different video.",
          outOfContext: true,
          reasoning: `Error: ${errorMessage.slice(0, 100)}`,
          metadata: {
            intentDetected: 'error',
            processingMode: 'error_recovery',
            error: process.env.NODE_ENV === 'development' ? errorMessage : undefined
          }
        }
      });
    }
  }
}

export const askController = new AskController();


