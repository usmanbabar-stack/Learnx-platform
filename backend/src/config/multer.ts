import multer from 'multer';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { logger } from '../utils/logger';

const UPLOADS_DIR = process.env.UPLOADS_DIR || join(__dirname, '../../uploads/lectures');

// Ensure uploads directory exists (non-fatal if it can't be created at import time)
if (!existsSync(UPLOADS_DIR)) {
  try {
    mkdirSync(UPLOADS_DIR, { recursive: true });
    logger.info(`Created uploads directory: ${UPLOADS_DIR}`);
  } catch (err: any) {
    logger.warn(`Could not create uploads directory at startup: ${err.message}. ` +
      `Set UPLOADS_DIR env var to a writable path or pre-create the directory.`);
  }
}

// Configure multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    // Generate unique filename with timestamp
    const timestamp = Date.now();
    const sanitizedOriginalName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    const filename = `${timestamp}-${sanitizedOriginalName}`;
    cb(null, filename);
  }
});

// File filter - accept video, audio, and document files
const fileFilter = (req: Express.Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimes = [
    // Video formats
    'video/mp4',
    'video/mpeg',
    'video/quicktime',
    'video/x-msvideo',
    'video/webm',
    'video/x-matroska',
    // Audio formats
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/wave',
    'audio/x-wav',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/aac',
    'audio/flac',
    // Document formats
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // DOCX
    'application/msword', // DOC
    'text/plain',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // PPTX
    'application/vnd.ms-powerpoint', // PPT
    'application/rtf'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    logger.warn(`Rejected file upload: ${file.originalname} (${file.mimetype})`);
    cb(new Error(`Invalid file type: ${file.mimetype}. Allowed: video, audio, PDF, DOCX, TXT, PPT/PPTX`));
  }
};

// Multer instance with configuration
export const uploadLecture = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500 MB limit
  }
});

// Single file upload middleware
export const uploadLectureFile = uploadLecture.single('file');
