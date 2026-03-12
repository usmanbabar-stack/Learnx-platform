-- Migration: Mock Interview Sessions
-- Creates tables for storing mock interview sessions and responses

-- Table: mock_interview_sessions
CREATE TABLE IF NOT EXISTS mock_interview_sessions (
  session_id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  field VARCHAR(255) NOT NULL,
  difficulty VARCHAR(50) NOT NULL,
  questions JSONB NOT NULL,
  total_questions INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  overall_score INTEGER,
  
  -- Indexes
  CONSTRAINT valid_difficulty CHECK (difficulty IN ('easy', 'medium', 'hard', 'mixed'))
);

CREATE INDEX IF NOT EXISTS idx_interview_sessions_user ON mock_interview_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_created ON mock_interview_sessions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interview_sessions_field ON mock_interview_sessions(field);

-- Table: mock_interview_responses
CREATE TABLE IF NOT EXISTS mock_interview_responses (
  id SERIAL PRIMARY KEY,
  session_id VARCHAR(100) REFERENCES mock_interview_sessions(session_id) ON DELETE CASCADE,
  question_id VARCHAR(50) NOT NULL,
  question_text TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  feedback JSONB NOT NULL,
  score INTEGER NOT NULL,
  answered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Constraints
  CONSTRAINT valid_score CHECK (score >= 0 AND score <= 100)
);

CREATE INDEX IF NOT EXISTS idx_interview_responses_session ON mock_interview_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_interview_responses_answered ON mock_interview_responses(answered_at DESC);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_interview_session_completed()
RETURNS TRIGGER AS $$
BEGIN
  NEW.completed_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Note: We'll manually set completed_at when interview finishes, no automatic trigger needed

COMMENT ON TABLE mock_interview_sessions IS 'Stores mock interview sessions and generated questions';
COMMENT ON TABLE mock_interview_responses IS 'Stores user responses and AI feedback for interview questions';
