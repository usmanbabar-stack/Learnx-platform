-- Migration: Past Paper Analyzer
-- Creates tables for storing student-uploaded past papers, extracted questions, and analysis results

-- Table: past_papers
CREATE TABLE IF NOT EXISTS past_papers (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  file_path VARCHAR(1000) NOT NULL,
  file_type VARCHAR(20) NOT NULL CHECK (file_type IN ('pdf', 'image', 'text', 'docx')),
  file_size BIGINT,
  upload_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processing_status VARCHAR(20) DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  exam_name VARCHAR(500),
  exam_year VARCHAR(10),
  subject VARCHAR(100),
  total_questions_extracted INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for past_papers
CREATE INDEX IF NOT EXISTS idx_past_papers_student_id ON past_papers(student_id);
CREATE INDEX IF NOT EXISTS idx_past_papers_status ON past_papers(processing_status);
CREATE INDEX IF NOT EXISTS idx_past_papers_subject ON past_papers(subject);
CREATE INDEX IF NOT EXISTS idx_past_papers_upload_date ON past_papers(upload_date DESC);

-- Table: extracted_questions
CREATE TABLE IF NOT EXISTS extracted_questions (
  id SERIAL PRIMARY KEY,
  paper_id INTEGER NOT NULL REFERENCES past_papers(id) ON DELETE CASCADE,
  question_number VARCHAR(20),
  question_text TEXT NOT NULL,
  question_type VARCHAR(50) CHECK (question_type IN ('multiple-choice', 'true-false', 'short-answer', 'essay', 'numerical', 'diagram', 'other')),
  topic VARCHAR(200),
  subtopic VARCHAR(200),
  difficulty VARCHAR(20) CHECK (difficulty IN ('easy', 'medium', 'hard')),
  marks INTEGER,
  bloom_taxonomy VARCHAR(50) CHECK (bloom_taxonomy IN ('remember', 'understand', 'apply', 'analyze', 'evaluate', 'create')),
  keywords TEXT[], -- Array of keywords for search
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for extracted_questions
CREATE INDEX IF NOT EXISTS idx_extracted_questions_paper_id ON extracted_questions(paper_id);
CREATE INDEX IF NOT EXISTS idx_extracted_questions_topic ON extracted_questions(topic);
CREATE INDEX IF NOT EXISTS idx_extracted_questions_difficulty ON extracted_questions(difficulty);
CREATE INDEX IF NOT EXISTS idx_extracted_questions_type ON extracted_questions(question_type);
CREATE INDEX IF NOT EXISTS idx_extracted_questions_keywords ON extracted_questions USING gin(keywords);

-- Full-text search on question text
CREATE INDEX IF NOT EXISTS idx_extracted_questions_text_gin ON extracted_questions USING gin(to_tsvector('english', question_text));

-- Table: paper_analysis_sessions
-- Stores analysis results for a batch of papers uploaded together
CREATE TABLE IF NOT EXISTS paper_analysis_sessions (
  id SERIAL PRIMARY KEY,
  student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_name VARCHAR(500),
  total_papers INTEGER NOT NULL,
  total_questions INTEGER NOT NULL,
  analysis_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(20) DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  
  -- Analysis Results (stored as JSONB for flexibility)
  topic_frequency JSONB, -- { "topic_name": count, ... }
  difficulty_distribution JSONB, -- { "easy": count, "medium": count, "hard": count }
  question_type_distribution JSONB, -- { "multiple-choice": count, ... }
  bloom_distribution JSONB, -- { "remember": count, "understand": count, ... }
  
  -- Pattern Analysis
  patterns JSONB, -- Array of detected patterns
  recommendations JSONB, -- AI-generated study recommendations
  weak_areas JSONB, -- Topics that appear frequently (need focus)
  strong_areas JSONB, -- Topics covered well
  
  -- Practice Sets
  practice_questions JSONB, -- Curated practice questions from the papers
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for paper_analysis_sessions
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_student_id ON paper_analysis_sessions(student_id);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_date ON paper_analysis_sessions(analysis_date DESC);
CREATE INDEX IF NOT EXISTS idx_analysis_sessions_status ON paper_analysis_sessions(status);

-- Junction table: Links papers to analysis sessions
CREATE TABLE IF NOT EXISTS session_papers (
  id SERIAL PRIMARY KEY,
  session_id INTEGER NOT NULL REFERENCES paper_analysis_sessions(id) ON DELETE CASCADE,
  paper_id INTEGER NOT NULL REFERENCES past_papers(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(session_id, paper_id)
);

-- Indexes for session_papers
CREATE INDEX IF NOT EXISTS idx_session_papers_session_id ON session_papers(session_id);
CREATE INDEX IF NOT EXISTS idx_session_papers_paper_id ON session_papers(paper_id);

-- Table: learning_resource_links
-- Stores links between extracted questions and relevant learning resources (lectures, videos)
CREATE TABLE IF NOT EXISTS question_resource_links (
  id SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES extracted_questions(id) ON DELETE CASCADE,
  resource_type VARCHAR(50) NOT NULL CHECK (resource_type IN ('lecture', 'video', 'youtube', 'external')),
  resource_id INTEGER, -- lecture_id or video_id if internal
  resource_title VARCHAR(500),
  resource_url VARCHAR(1000),
  relevance_score FLOAT CHECK (relevance_score >= 0 AND relevance_score <= 1),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for question_resource_links
CREATE INDEX IF NOT EXISTS idx_question_links_question_id ON question_resource_links(question_id);
CREATE INDEX IF NOT EXISTS idx_question_links_resource_type ON question_resource_links(resource_type);
CREATE INDEX IF NOT EXISTS idx_question_links_relevance ON question_resource_links(relevance_score DESC);

-- Trigger to update past_papers updated_at timestamp
CREATE TRIGGER update_past_papers_updated_at BEFORE UPDATE ON past_papers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to update paper_analysis_sessions updated_at timestamp
CREATE TRIGGER update_analysis_sessions_updated_at BEFORE UPDATE ON paper_analysis_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- View: Student past paper statistics
CREATE OR REPLACE VIEW student_paper_stats AS
SELECT 
  u.id as student_id,
  u.first_name,
  u.last_name,
  u.email,
  COUNT(DISTINCT pp.id) as total_papers_uploaded,
  COUNT(DISTINCT pp.id) FILTER (WHERE pp.processing_status = 'completed') as completed_papers,
  COUNT(DISTINCT eq.id) as total_questions_extracted,
  COUNT(DISTINCT pas.id) as total_analysis_sessions,
  MAX(pp.upload_date) as last_upload_date
FROM users u
LEFT JOIN past_papers pp ON u.id = pp.student_id
LEFT JOIN extracted_questions eq ON pp.id = eq.paper_id
LEFT JOIN paper_analysis_sessions pas ON u.id = pas.student_id
WHERE u.role = 'student'
GROUP BY u.id, u.first_name, u.last_name, u.email;

-- View: Topic frequency across all papers for a student
CREATE OR REPLACE VIEW topic_frequency_view AS
SELECT 
  eq.topic,
  COUNT(*) as question_count,
  pp.student_id,
  pp.subject,
  ARRAY_AGG(DISTINCT eq.difficulty) as difficulties,
  ARRAY_AGG(DISTINCT eq.question_type) as question_types
FROM extracted_questions eq
JOIN past_papers pp ON eq.paper_id = pp.id
WHERE eq.topic IS NOT NULL
GROUP BY eq.topic, pp.student_id, pp.subject
ORDER BY question_count DESC;

-- View: Analysis session summary
CREATE OR REPLACE VIEW analysis_session_summary AS
SELECT 
  pas.id as session_id,
  pas.student_id,
  pas.session_name,
  pas.total_papers,
  pas.total_questions,
  pas.analysis_date,
  pas.status,
  COUNT(DISTINCT sp.paper_id) as linked_papers,
  u.first_name,
  u.last_name,
  u.email
FROM paper_analysis_sessions pas
JOIN users u ON pas.student_id = u.id
LEFT JOIN session_papers sp ON pas.id = sp.session_id
GROUP BY pas.id, pas.student_id, pas.session_name, pas.total_papers, pas.total_questions, 
         pas.analysis_date, pas.status, u.first_name, u.last_name, u.email;
