-- Video Summaries table (SHARED per video - not per user)
-- Generated once by LLM, cached for all users
CREATE TABLE IF NOT EXISTS video_summaries (
    id SERIAL PRIMARY KEY,
    video_id VARCHAR(11) UNIQUE NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    overview TEXT NOT NULL,
    key_points JSONB NOT NULL DEFAULT '[]',
    main_topics JSONB NOT NULL DEFAULT '[]',
    key_timestamps JSONB NOT NULL DEFAULT '[]',
    target_audience VARCHAR(255),
    difficulty VARCHAR(20) CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    estimated_watch_time VARCHAR(50),
    generation_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by video_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_summaries_video_id ON video_summaries(video_id);

-- Video Glossaries table (SHARED per video - not per user)
-- Generated once by LLM, cached for all users
CREATE TABLE IF NOT EXISTS video_glossaries (
    id SERIAL PRIMARY KEY,
    video_id VARCHAR(11) UNIQUE NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    terms JSONB NOT NULL DEFAULT '[]',
    categories JSONB NOT NULL DEFAULT '[]',
    total_terms INTEGER DEFAULT 0,
    generation_time_ms INTEGER,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Index for fast lookup by video_id
CREATE UNIQUE INDEX IF NOT EXISTS idx_video_glossaries_video_id ON video_glossaries(video_id);

-- Triggers for updated_at
CREATE TRIGGER update_video_summaries_updated_at BEFORE UPDATE ON video_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_video_glossaries_updated_at BEFORE UPDATE ON video_glossaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
