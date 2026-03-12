import { promises as fs } from 'fs';
// Use require for pdf-parse and mammoth (CommonJS modules without proper types)
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const textract = require('textract');
import { logger } from '../utils/logger';

export interface DocumentExtractionResult {
  text: string;
  wordCount: number;
  pageCount?: number;
  title?: string;
}

export class DocumentProcessingService {
  /**
   * Extract text from PDF files
   */
  async extractFromPDF(filePath: string): Promise<DocumentExtractionResult> {
    try {
      logger.info(`Extracting text from PDF: ${filePath}`);
      
      const dataBuffer = await fs.readFile(filePath);
      const data = await pdfParse(dataBuffer);

      const text = data.text.trim();
      const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;

      logger.info(`PDF extraction complete: ${wordCount} words, ${data.numpages} pages`);

      return {
        text,
        wordCount,
        pageCount: data.numpages,
        title: data.info?.Title || undefined
      };
    } catch (error) {
      logger.error('PDF extraction error:', error);
      throw new Error('Failed to extract text from PDF file');
    }
  }

  /**
   * Extract text from DOCX files
   */
  async extractFromDOCX(filePath: string): Promise<DocumentExtractionResult> {
    try {
      logger.info(`Extracting text from DOCX: ${filePath}`);
      
      const result = await mammoth.extractRawText({ path: filePath });
      const text = result.value.trim();
      const wordCount = text.split(/\s+/).filter((w: string) => w.length > 0).length;

      if (result.messages.length > 0) {
        logger.warn('DOCX extraction warnings:', result.messages);
      }

      logger.info(`DOCX extraction complete: ${wordCount} words`);

      return {
        text,
        wordCount
      };
    } catch (error) {
      logger.error('DOCX extraction error:', error);
      throw new Error('Failed to extract text from DOCX file');
    }
  }

  /**
   * Extract text from plain text files
   */
  async extractFromText(filePath: string): Promise<DocumentExtractionResult> {
    try {
      logger.info(`Reading text file: ${filePath}`);
      
      const text = await fs.readFile(filePath, 'utf-8');
      const cleanText = text.trim();
      const wordCount = cleanText.split(/\s+/).filter((w: string) => w.length > 0).length;

      logger.info(`Text file read complete: ${wordCount} words`);

      return {
        text: cleanText,
        wordCount
      };
    } catch (error) {
      logger.error('Text file reading error:', error);
      throw new Error('Failed to read text file');
    }
  }

  /**
   * Extract text from PowerPoint files (PPTX)
   * Note: This is a simplified version - may need additional libraries for complex PPT files
   */
  async extractFromPPTX(filePath: string): Promise<DocumentExtractionResult> {
    try {
      logger.info(`Extracting text from PPTX: ${filePath}`);
      
      // Using textract as fallback for PowerPoint
      const textract = require('textract');
      
      return new Promise((resolve, reject) => {
        textract.fromFileWithPath(filePath, { preserveLineBreaks: true }, (error: any, text: string) => {
          if (error) {
            logger.error('PPTX extraction error:', error);
            reject(new Error('Failed to extract text from PowerPoint file'));
            return;
          }

          const cleanText = text.trim();
          const wordCount = cleanText.split(/\s+/).filter((w: string) => w.length > 0).length;

          logger.info(`PPTX extraction complete: ${wordCount} words`);

          resolve({
            text: cleanText,
            wordCount
          });
        });
      });
    } catch (error) {
      logger.error('PPTX extraction error:', error);
      throw new Error('Failed to extract text from PowerPoint file');
    }
  }

  /**
   * Auto-detect file type and extract text
   */
  async extractText(filePath: string, mimeType: string): Promise<DocumentExtractionResult> {
    logger.info(`Processing file: ${filePath} (${mimeType})`);

    if (mimeType === 'application/pdf') {
      return this.extractFromPDF(filePath);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return this.extractFromDOCX(filePath);
    } else if (mimeType === 'text/plain') {
      return this.extractFromText(filePath);
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      mimeType === 'application/vnd.ms-powerpoint'
    ) {
      return this.extractFromPPTX(filePath);
    } else {
      throw new Error(`Unsupported document type: ${mimeType}`);
    }
  }

  /**
   * Check if file is a document (vs audio/video)
   */
  isDocumentFile(mimeType: string): boolean {
    const documentMimes = [
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/vnd.ms-powerpoint',
      'application/rtf'
    ];

    return documentMimes.includes(mimeType);
  }

  /**
   * Check if file is audio/video
   */
  isMediaFile(mimeType: string): boolean {
    return mimeType.startsWith('audio/') || mimeType.startsWith('video/');
  }
}

export const documentProcessingService = new DocumentProcessingService();
