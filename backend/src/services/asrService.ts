import axios from 'axios';
import FormData from 'form-data';
import { createReadStream, statSync } from 'fs';
import { logger } from '../utils/logger';

const ASR_SERVER_URL = process.env.ASR_SERVER_URL || 'http://asr-server:8000';

interface TranscriptSegment {
  text: string;
  start: number;
  end: number;
}

interface TranscriptResult {
  segments: TranscriptSegment[];
  fullText: string;
  duration: number;
  wordCount: number;
}

export class ASRService {
  /**
   * Transcribe an audio/video file using the local ASR server
   * @param filePath Path to the audio/video file on disk
   * @param language Language code (en-US, en-IN, etc.)
   * @returns Transcript segments and full text
   */
  async transcribe(filePath: string, language: string = 'en-US'): Promise<TranscriptResult> {
    try {
      logger.info(`Starting transcription for file: ${filePath} (language: ${language})`);

      // Check if file exists
      const stats = statSync(filePath);
      const fileSizeMB = (stats.size / (1024 * 1024)).toFixed(2);
      logger.info(`File size: ${fileSizeMB} MB`);

      // Create form data
      const form = new FormData();
      form.append('file', createReadStream(filePath));
      form.append('language', language);
      form.append('response_format', 'verbose_json');

      // Call ASR server
      const response = await axios.post(`${ASR_SERVER_URL}/transcribe`, form, {
        headers: {
          ...form.getHeaders()
        },
        timeout: 10 * 60 * 1000, // 10 minute timeout for large files
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      });

      const segments: TranscriptSegment[] = response.data.segments || [];
      
      // Combine all segment texts
      const fullText = segments.map(seg => seg.text).join(' ').trim();
      
      // Calculate duration and word count
      const duration = segments.length > 0 
        ? segments[segments.length - 1].end 
        : 0;
      
      const wordCount = fullText.split(/\s+/).filter(w => w.length > 0).length;

      logger.info(
        `Transcription completed: ${segments.length} segments, ` +
        `${wordCount} words, ${duration.toFixed(2)}s duration`
      );

      return {
        segments,
        fullText,
        duration,
        wordCount
      };
    } catch (error: any) {
      if (error.response) {
        logger.error(`ASR server error (${error.response.status}):`, error.response.data);
        throw new Error(`ASR server failed: ${error.response.data?.error || error.response.statusText}`);
      } else if (error.code === 'ECONNREFUSED') {
        logger.error('Cannot connect to ASR server');
        throw new Error('ASR server is not available. Please ensure it is running.');
      } else if (error.code === 'ENOENT') {
        logger.error('File not found:', filePath);
        throw new Error('Audio file not found');
      } else {
        logger.error('Transcription error:', error);
        throw new Error(`Transcription failed: ${error.message}`);
      }
    }
  }

  /**
   * Format duration in seconds to HH:MM:SS string
   */
  formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    } else {
      return `${minutes}:${secs.toString().padStart(2, '0')}`;
    }
  }

  /**
   * Check if ASR server is available
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await axios.get(`${ASR_SERVER_URL}/`, {
        timeout: 5000
      });
      return response.status === 200;
    } catch {
      return false;
    }
  }
}

export const asrService = new ASRService();
