-- Video Quizzes table (SHARED per video - not per user)
-- Generated once by LLM, cached for all users
CREATE TABLE IF NOT EXISTS video_quizzes (
    id SERIAL PRIMARY KEY,
    video_id VARCHAR(11) UNIQUE NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    questions JSONB NOT NULL DEFAULT '[]',
    total_questions INTEGER DEFAULT 0,
    categories JSONB NOT NULL DEFAULT '[]',
    generation_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by video_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_quizzes_video_id ON video_quizzes(video_id);

-- Trigger for updated_at
CREATE TRIGGER update_video_quizzes_updated_at BEFORE UPDATE ON video_quizzes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
