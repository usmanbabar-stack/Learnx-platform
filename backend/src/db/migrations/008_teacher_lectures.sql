-- Migration: Teacher Lectures and Generated Content
-- Creates tables for storing teacher-uploaded lectures, generated notes, and question banks

-- Table: lectures
CREATE TABLE IF NOT EXISTS lectures (
  id SERIAL PRIMARY KEY,
  teacher_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  file_path VARCHAR(1000) NOT NULL,
  file_size BIGINT,
  duration VARCHAR(20),
  transcript_text TEXT,
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed', 'draft')),
  subject VARCHAR(100) CHECK (subject IN (
    'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
    'Engineering', 'Business', 'Economics', 'Psychology', 'History',
    'Literature', 'Art', 'Music', 'Language Learning', 'Medicine',
    'Law', 'Philosophy', 'Other'
  )),
  difficulty VARCHAR(20) DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
  visibility VARCHAR(20) DEFAULT 'private' CHECK (visibility IN ('private', 'public', 'unlisted')),
  view_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for lectures
CREATE INDEX IF NOT EXISTS idx_lectures_teacher_id ON lectures(teacher_id);
CREATE INDEX IF NOT EXISTS idx_lectures_status ON lectures(status);
CREATE INDEX IF NOT EXISTS idx_lectures_subject ON lectures(subject);
CREATE INDEX IF NOT EXISTS idx_lectures_created_at ON lectures(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lectures_visibility ON lectures(visibility);

-- Full-text search on lecture title and description
CREATE INDEX IF NOT EXISTS idx_lectures_title_gin ON lectures USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_lectures_transcript_gin ON lectures USING gin(to_tsvector('english', COALESCE(transcript_text, '')));

-- Table: generated_notes
CREATE TABLE IF NOT EXISTS generated_notes (
  id SERIAL PRIMARY KEY,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  summary_type VARCHAR(20) DEFAULT 'detailed' CHECK (summary_type IN ('detailed', 'quick', 'outline')),
  word_count INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for generated_notes
CREATE INDEX IF NOT EXISTS idx_generated_notes_lecture_id ON generated_notes(lecture_id);
CREATE INDEX IF NOT EXISTS idx_generated_notes_summary_type ON generated_notes(summary_type);

-- Table: question_banks
CREATE TABLE IF NOT EXISTS question_banks (
  id SERIAL PRIMARY KEY,
  lecture_id INTEGER NOT NULL REFERENCES lectures(id) ON DELETE CASCADE,
  questions JSONB NOT NULL,
  difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard', 'mixed')),
  total_questions INTEGER NOT NULL,
  question_type VARCHAR(50) DEFAULT 'multiple-choice' CHECK (question_type IN ('multiple-choice', 'true-false', 'short-answer', 'essay', 'mixed')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for question_banks
CREATE INDEX IF NOT EXISTS idx_question_banks_lecture_id ON question_banks(lecture_id);
CREATE INDEX IF NOT EXISTS idx_question_banks_difficulty ON question_banks(difficulty);

-- Trigger to update lectures updated_at timestamp
CREATE TRIGGER update_lectures_updated_at BEFORE UPDATE ON lectures
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View: Teacher lecture statistics
CREATE OR REPLACE VIEW teacher_lecture_stats AS
SELECT 
  u.id as teacher_id,
  u.first_name,
  u.last_name,
  u.email,
  COUNT(l.id) as total_lectures,
  COUNT(l.id) FILTER (WHERE l.status = 'completed') as completed_lectures,
  COUNT(l.id) FILTER (WHERE l.status = 'processing') as processing_lectures,
  SUM(l.view_count) as total_views,
  COUNT(DISTINCT gn.id) as total_notes,
  COUNT(DISTINCT qb.id) as total_question_banks
FROM users u
LEFT JOIN lectures l ON u.id = l.teacher_id
LEFT JOIN generated_notes gn ON l.id = gn.lecture_id
LEFT JOIN question_banks qb ON l.id = qb.lecture_id
WHERE u.role = 'teacher'
GROUP BY u.id, u.first_name, u.last_name, u.email;
