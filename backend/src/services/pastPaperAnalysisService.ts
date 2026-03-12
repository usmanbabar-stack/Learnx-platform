import { GoogleGenerativeAI } from "@google/generative-ai";
import { getPostgresPool } from "../config/postgres";
import { logger } from "../utils/logger";
import * as fs from 'fs/promises';
import * as path from 'path';
// @ts-ignore - pdf-parse doesn't have TypeScript definitions
import pdfParse from 'pdf-parse';
import mammoth from 'mammoth';
// @ts-ignore - textract doesn't have TypeScript definitions
import textract from 'textract';
import { promisify } from 'util';

const textractExtract = promisify(textract.fromFileWithPath) as (filePath: string) => Promise<string>;

const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

function getApiKey(): string {
  const key = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY || "";
  if (!key) {
    throw new Error("Missing Google Gemini API key");
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

interface ExtractedQuestion {
  question_number: string;
  question_text: string;
  question_type: 'multiple-choice' | 'true-false' | 'short-answer' | 'essay' | 'numerical' | 'diagram' | 'other';
  topic: string;
  subtopic?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  marks?: number;
  bloom_taxonomy: 'remember' | 'understand' | 'apply' | 'analyze' | 'evaluate' | 'create';
  keywords: string[];
}

interface PatternAnalysis {
  topic_frequency: { [topic: string]: number };
  difficulty_distribution: { easy: number; medium: number; hard: number };
  question_type_distribution: { [type: string]: number };
  bloom_distribution: { [level: string]: number };
  patterns: Array<{
    pattern_type: string;
    description: string;
    frequency: number;
    importance: 'high' | 'medium' | 'low';
  }>;
  weak_areas: Array<{
    topic: string;
    frequency: number;
    recommendation: string;
  }>;
  strong_areas: Array<{
    topic: string;
    coverage: string;
  }>;
  recommendations: Array<{
    priority: 'high' | 'medium' | 'low';
    area: string;
    action: string;
  }>;
}

class PastPaperAnalysisService {
  /**
   * Extract text from uploaded file based on type
   */
  async extractTextFromFile(filePath: string, fileType: string): Promise<string> {
    try {
      logger.info(`Extracting text from ${fileType} file: ${filePath}`);

      switch (fileType.toLowerCase()) {
        case 'pdf': {
          const dataBuffer = await fs.readFile(filePath);
          const pdfData = await pdfParse(dataBuffer);
          return pdfData.text;
        }

        case 'docx': {
          const result = await mammoth.extractRawText({ path: filePath });
          return result.value;
        }

        case 'text':
        case 'txt': {
          const text = await fs.readFile(filePath, 'utf-8');
          return text;
        }

        case 'image':
        case 'jpg':
        case 'jpeg':
        case 'png': {
          // For images, we'll use Gemini Vision API
          return await this.extractTextFromImage(filePath);
        }

        default: {
          // Try textract as fallback
          try {
            const text = await textractExtract(filePath);
            return text;
          } catch (error) {
            logger.error(`Textract failed for ${fileType}:`, error);
            throw new Error(`Unsupported file type: ${fileType}`);
          }
        }
      }
    } catch (error) {
      logger.error(`Text extraction failed for ${filePath}:`, error);
      throw error;
    }
  }

  /**
   * Use Gemini Vision to extract text from images (OCR)
   */
  async extractTextFromImage(imagePath: string): Promise<string> {
    try {
      const genAI = getClient();
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      // Read image as base64
      const imageBuffer = await fs.readFile(imagePath);
      const base64Image = imageBuffer.toString('base64');
      const mimeType = this.getMimeType(imagePath);

      const prompt = `Extract all text from this exam paper image. Preserve the structure, question numbers, and formatting as much as possible. Output only the extracted text.`;

      const result = await model.generateContent([
        { text: prompt },
        {
          inlineData: {
            data: base64Image,
            mimeType
          }
        }
      ]);

      const text = result.response.text();
      logger.info(`Extracted ${text.length} characters from image via OCR`);
      return text;
    } catch (error) {
      logger.error('Image OCR failed:', error);
      throw new Error('Failed to extract text from image');
    }
  }

  /**
   * Get MIME type based on file extension
   */
  getMimeType(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes: { [key: string]: string } = {
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.webp': 'image/webp',
      '.pdf': 'application/pdf'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }

  /**
   * Extract questions from paper text using AI
   */
  async extractQuestions(paperText: string, examName: string): Promise<ExtractedQuestion[]> {
    try {
      logger.info(`Extracting questions from paper: ${examName}`);

      const genAI = getClient();
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      const prompt = `You are an expert exam analyzer. Extract all questions from this past exam paper and analyze each one.

EXAM PAPER TEXT:
${paperText}

For each question identified, extract:
1. Question number (e.g., "Q1", "1a", "Question 3")
2. Full question text
3. Question type (multiple-choice, true-false, short-answer, essay, numerical, diagram, or other)
4. Academic topic (e.g., "Data Structures", "Algorithms", "Calculus", "Physics", etc.)
5. Subtopic if applicable
6. Difficulty level (easy, medium, or hard)
7. Marks/points if mentioned
8. Bloom's taxonomy level (remember, understand, apply, analyze, evaluate, or create)
9. Important keywords from the question

Output your analysis as a JSON array. Each question should be a JSON object with these exact fields:
{
  "question_number": "string",
  "question_text": "string",
  "question_type": "string",
  "topic": "string",
  "subtopic": "string or null",
  "difficulty": "string",
  "marks": number or null,
  "bloom_taxonomy": "string",
  "keywords": ["string", "string", ...]
}

CRITICAL: Return ONLY valid JSON array, no markdown formatting, no explanations. Start with [ and end with ].`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          topP: 0.9,
          maxOutputTokens: 65536,
        },
      });

      let responseText = result.response.text().trim();
      
      // Remove markdown code blocks if present
      responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
      
      // Additional cleanup: remove any trailing commas, fix common JSON issues
      responseText = responseText
        .replace(/,(\s*[}\]])/g, '$1')  // Remove trailing commas
        .trim();
      
      // Try to extract JSON array if it's embedded in text
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        responseText = jsonMatch[0];
      }
      
      // Parse JSON with fallback repair for truncated responses
      const questions: ExtractedQuestion[] = this.safeParseJSON(responseText, examName);
      
      logger.info(`Extracted ${questions.length} questions from paper`);
      return questions;
    } catch (error) {
      logger.error('Question extraction failed:', error);
      // Return empty array instead of throwing to allow partial processing
      return [];
    }
  }

  /**
   * Safely parse JSON, repairing truncated responses from AI
   */
  private safeParseJSON(text: string, context: string): any[] {
    // First try direct parse
    try {
      return JSON.parse(text);
    } catch (firstError) {
      logger.warn(`Direct JSON parse failed for ${context}, attempting repair...`);
    }

    // Try to repair truncated JSON
    let repaired = text;
    
    // If truncated mid-string, close the string
    // Count unescaped quotes
    let inString = false;
    let lastCompleteItem = -1;
    for (let i = 0; i < repaired.length; i++) {
      if (repaired[i] === '\\') { i++; continue; }
      if (repaired[i] === '"') inString = !inString;
      // Track position after each complete object in array
      if (!inString && repaired[i] === '}') {
        // Check if next non-whitespace is , or ]
        const rest = repaired.substring(i + 1).trimStart();
        if (rest.startsWith(',') || rest.startsWith(']') || rest === '') {
          lastCompleteItem = i;
        }
      }
    }

    // Truncate to last complete JSON object and close the array
    if (lastCompleteItem > 0) {
      repaired = repaired.substring(0, lastCompleteItem + 1);
      // Remove any trailing comma
      repaired = repaired.replace(/,\s*$/, '');
      // Close the array if needed
      if (!repaired.trimEnd().endsWith(']')) {
        repaired += ']';
      }
    }

    try {
      const parsed = JSON.parse(repaired);
      logger.info(`JSON repair succeeded for ${context}, recovered ${parsed.length} items`);
      return parsed;
    } catch (secondError) {
      logger.error(`JSON repair also failed for ${context}. Raw response (first 500 chars): ${text.substring(0, 500)}`);
      return [];
    }
  }

  /**
   * Analyze patterns across multiple papers
   */
  async analyzePatterns(sessionId: number): Promise<PatternAnalysis> {
    try {
      const pool = getPostgresPool();
      
      // Get all questions for this session
      const questionsResult = await pool.query(`
        SELECT eq.*
        FROM extracted_questions eq
        JOIN past_papers pp ON eq.paper_id = pp.id
        JOIN session_papers sp ON pp.id = sp.paper_id
        WHERE sp.session_id = $1
      `, [sessionId]);

      const questions = questionsResult.rows;

      if (questions.length === 0) {
        throw new Error('No questions found for analysis');
      }

      logger.info(`Analyzing ${questions.length} questions for session ${sessionId}`);

      // Calculate basic statistics
      const topicFrequency: { [topic: string]: number } = {};
      const difficultyDist = { easy: 0, medium: 0, hard: 0 };
      const typeDist: { [type: string]: number } = {};
      const bloomDist: { [level: string]: number } = {};

      questions.forEach((q: any) => {
        // Topic frequency
        if (q.topic) {
          topicFrequency[q.topic] = (topicFrequency[q.topic] || 0) + 1;
        }

        // Difficulty distribution
        if (q.difficulty) {
          difficultyDist[q.difficulty as 'easy' | 'medium' | 'hard']++;
        }

        // Question type distribution
        if (q.question_type) {
          typeDist[q.question_type] = (typeDist[q.question_type] || 0) + 1;
        }

        // Bloom's taxonomy distribution
        if (q.bloom_taxonomy) {
          bloomDist[q.bloom_taxonomy] = (bloomDist[q.bloom_taxonomy] || 0) + 1;
        }
      });

      // Use AI to generate deeper insights
      const insights = await this.generateAIInsights(questions, topicFrequency, difficultyDist, bloomDist);

      return {
        topic_frequency: topicFrequency,
        difficulty_distribution: difficultyDist,
        question_type_distribution: typeDist,
        bloom_distribution: bloomDist,
        patterns: insights.patterns,
        weak_areas: insights.weak_areas,
        strong_areas: insights.strong_areas,
        recommendations: insights.recommendations
      };
    } catch (error) {
      logger.error('Pattern analysis failed:', error);
      throw error;
    }
  }

  /**
   * Generate AI-powered insights and recommendations
   */
  async generateAIInsights(
    questions: any[],
    topicFrequency: { [topic: string]: number },
    difficultyDist: { easy: number; medium: number; hard: number },
    bloomDist: { [level: string]: number }
  ): Promise<{
    patterns: any[];
    weak_areas: any[];
    strong_areas: any[];
    recommendations: any[];
  }> {
    try {
      const genAI = getClient();
      const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

      // Prepare data summary for AI
      const topicSummary = Object.entries(topicFrequency)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([topic, count]) => `${topic}: ${count} questions`)
        .join('\n');

      const sampleQuestions = questions.slice(0, 10).map((q, idx) => 
        `${idx + 1}. [${q.topic}] ${q.question_text.substring(0, 150)}...`
      ).join('\n\n');

      const prompt = `You are an expert educational analyst. Analyze these past exam papers and provide actionable insights for a student.

DATA SUMMARY:
Total Questions: ${questions.length}
Difficulty Distribution: Easy ${difficultyDist.easy}, Medium ${difficultyDist.medium}, Hard ${difficultyDist.hard}
Bloom's Taxonomy: ${JSON.stringify(bloomDist)}

TOP TOPICS BY FREQUENCY:
${topicSummary}

SAMPLE QUESTIONS:
${sampleQuestions}

Analyze and provide:
1. PATTERNS: What patterns do you see in the exam papers? (e.g., "70% of questions focus on applied knowledge", "Algorithms appear in every paper")
2. WEAK AREAS: Topics that appear frequently (student should prioritize these)
3. STRONG AREAS: Topics with good coverage/variety
4. RECOMMENDATIONS: Specific study actions the student should take

Output as JSON with this structure:
{
  "patterns": [
    { "pattern_type": "string", "description": "string", "frequency": number, "importance": "high|medium|low" }
  ],
  "weak_areas": [
    { "topic": "string", "frequency": number, "recommendation": "string" }
  ],
  "strong_areas": [
    { "topic": "string", "coverage": "string" }
  ],
  "recommendations": [
    { "priority": "high|medium|low", "area": "string", "action": "string" }
  ]
}

Return ONLY valid JSON, no markdown, no explanations.`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 4096,
        },
      });

      let responseText = result.response.text().trim();
      responseText = responseText.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
      
      const insights = JSON.parse(responseText);
      logger.info('Generated AI insights successfully');
      
      return insights;
    } catch (error) {
      logger.error('AI insights generation failed:', error);
      // Return default structure
      return {
        patterns: [],
        weak_areas: Object.entries(topicFrequency)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([topic, frequency]) => ({
            topic,
            frequency,
            recommendation: `Focus on ${topic} - appears ${frequency} times`
          })),
        strong_areas: [],
        recommendations: [
          {
            priority: 'high' as const,
            area: 'General Study',
            action: 'Review past papers thoroughly'
          }
        ]
      };
    }
  }

  /**
   * Generate practice question set from extracted questions
   */
  async generatePracticeSet(sessionId: number, count: number = 20): Promise<any[]> {
    try {
      const pool = getPostgresPool();
      
      // Get diverse set of questions (mix of difficulties and topics)
      const result = await pool.query(`
        WITH ranked_questions AS (
          SELECT 
            eq.*,
            ROW_NUMBER() OVER (PARTITION BY eq.topic, eq.difficulty ORDER BY RANDOM()) as rn
          FROM extracted_questions eq
          JOIN past_papers pp ON eq.paper_id = pp.id
          JOIN session_papers sp ON pp.id = sp.paper_id
          WHERE sp.session_id = $1
        )
        SELECT * FROM ranked_questions
        WHERE rn <= 2
        ORDER BY RANDOM()
        LIMIT $2
      `, [sessionId, count]);

      return result.rows;
    } catch (error) {
      logger.error('Practice set generation failed:', error);
      return [];
    }
  }

  /**
   * Process a single uploaded paper
   */
  async processPaper(paperId: number): Promise<void> {
    const pool = getPostgresPool();
    
    try {
      // Get paper details
      const paperResult = await pool.query(
        'SELECT * FROM past_papers WHERE id = $1',
        [paperId]
      );

      if (paperResult.rows.length === 0) {
        throw new Error(`Paper ${paperId} not found`);
      }

      const paper = paperResult.rows[0];
      
      // Update status to processing
      await pool.query(
        'UPDATE past_papers SET processing_status = $1 WHERE id = $2',
        ['processing', paperId]
      );

      // Extract text from file
      const extractedText = await this.extractTextFromFile(paper.file_path, paper.file_type);

      // Extract questions using AI
      const questions = await this.extractQuestions(extractedText, paper.filename);

      // Save questions to database
      if (questions.length > 0) {
        const values: any[] = [];
        const placeholders: string[] = [];
        
        questions.forEach((q, idx) => {
          const baseIdx = idx * 8;
          placeholders.push(
            `($${baseIdx + 1}, $${baseIdx + 2}, $${baseIdx + 3}, $${baseIdx + 4}, $${baseIdx + 5}, $${baseIdx + 6}, $${baseIdx + 7}, $${baseIdx + 8})`
          );
          
          // Normalize enum values to lowercase to match DB check constraints
          const validBloom = ['remember', 'understand', 'apply', 'analyze', 'evaluate', 'create'];
          const validDifficulty = ['easy', 'medium', 'hard'];
          const validQType = ['multiple-choice', 'true-false', 'short-answer', 'essay', 'numerical', 'diagram', 'other'];
          const bloom = validBloom.includes(q.bloom_taxonomy?.toLowerCase()) ? q.bloom_taxonomy.toLowerCase() : 'understand';
          const difficulty = validDifficulty.includes(q.difficulty?.toLowerCase()) ? q.difficulty.toLowerCase() : 'medium';
          const rawQType = (q.question_type || 'other').toLowerCase().replace(/_/g, '-');
          const qType = validQType.includes(rawQType) ? rawQType : 'other';
          
          values.push(
            paperId,
            q.question_number,
            q.question_text,
            qType,
            q.topic,
            q.subtopic || null,
            difficulty,
            bloom
          );
        });

        await pool.query(
          `INSERT INTO extracted_questions 
           (paper_id, question_number, question_text, question_type, topic, subtopic, difficulty, bloom_taxonomy)
           VALUES ${placeholders.join(', ')}`,
          values
        );

        // Update paper with question count
        await pool.query(
          'UPDATE past_papers SET total_questions_extracted = $1, processing_status = $2 WHERE id = $3',
          [questions.length, 'completed', paperId]
        );

        logger.info(`Successfully processed paper ${paperId}: ${questions.length} questions extracted`);
      } else {
        await pool.query(
          'UPDATE past_papers SET processing_status = $1 WHERE id = $2',
          ['completed', paperId]
        );
        logger.warn(`No questions extracted from paper ${paperId}`);
      }
    } catch (error) {
      logger.error(`Paper processing failed for ${paperId}:`, error);
      await pool.query(
        'UPDATE past_papers SET processing_status = $1 WHERE id = $2',
        ['failed', paperId]
      );
      throw error;
    }
  }
}

export const pastPaperAnalysisService = new PastPaperAnalysisService();
