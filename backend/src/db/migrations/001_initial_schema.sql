-- PostgreSQL Schema for LearnX Platform
-- Optimized for fast inserts and retrievals with proper indexing

-- Users table (for authentication)
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    role VARCHAR(20) DEFAULT 'student' CHECK (role IN ('student', 'teacher', 'admin')),
    institution VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for users
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- Videos table (main video metadata)
CREATE TABLE IF NOT EXISTS videos (
    id SERIAL PRIMARY KEY,
    video_id VARCHAR(11) UNIQUE NOT NULL,
    title VARCHAR(500) NOT NULL,
    channel VARCHAR(255) NOT NULL,
    description TEXT,
    duration VARCHAR(20) NOT NULL,
    views VARCHAR(50) DEFAULT '0',
    likes VARCHAR(50) DEFAULT '0',
    upload_date VARCHAR(50) NOT NULL,
    category VARCHAR(100) DEFAULT 'Education',
    thumbnail TEXT NOT NULL,
    url TEXT NOT NULL,
    subject VARCHAR(100) NOT NULL CHECK (subject IN (
        'Computer Science', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
        'Engineering', 'Business', 'Economics', 'Psychology', 'History',
        'Literature', 'Art', 'Music', 'Language Learning', 'Medicine',
        'Law', 'Philosophy', 'Other'
    )),
    difficulty VARCHAR(20) DEFAULT 'intermediate' CHECK (difficulty IN ('beginner', 'intermediate', 'advanced')),
    language VARCHAR(10) DEFAULT 'en',
    is_educational BOOLEAN DEFAULT true,
    quality_score DECIMAL(3,1) DEFAULT 5.0 CHECK (quality_score >= 0 AND quality_score <= 10),
    scraped_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Critical indexes for fast video queries
CREATE UNIQUE INDEX IF NOT EXISTS idx_videos_video_id ON videos(video_id);
CREATE INDEX IF NOT EXISTS idx_videos_subject ON videos(subject);
CREATE INDEX IF NOT EXISTS idx_videos_difficulty ON videos(difficulty);
CREATE INDEX IF NOT EXISTS idx_videos_quality_score ON videos(quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_videos_created_at ON videos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_is_educational ON videos(is_educational) WHERE is_educational = true;

-- Full-text search index (PostgreSQL GIN index for fast text search)
CREATE INDEX IF NOT EXISTS idx_videos_title_gin ON videos USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_videos_description_gin ON videos USING gin(to_tsvector('english', description));

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_videos_subject_quality ON videos(subject, quality_score DESC);
CREATE INDEX IF NOT EXISTS idx_videos_subject_difficulty ON videos(subject, difficulty);

-- Video search keywords (for enhanced search)
CREATE TABLE IF NOT EXISTS video_keywords (
    id SERIAL PRIMARY KEY,
    video_id VARCHAR(11) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    keyword VARCHAR(100) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id, keyword)
);

-- Indexes for keywords
CREATE INDEX IF NOT EXISTS idx_video_keywords_video_id ON video_keywords(video_id);
CREATE INDEX IF NOT EXISTS idx_video_keywords_keyword ON video_keywords(keyword);

-- Transcript items (normalized for efficient storage)
CREATE TABLE IF NOT EXISTS transcript_items (
    id SERIAL PRIMARY KEY,
    video_id VARCHAR(11) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    start_time DECIMAL(10,3) NOT NULL,
    duration DECIMAL(10,3) NOT NULL,
    sequence_order INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(video_id, sequence_order)
);

-- Critical indexes for transcript queries
CREATE INDEX IF NOT EXISTS idx_transcript_items_video_id ON transcript_items(video_id);
CREATE INDEX IF NOT EXISTS idx_transcript_items_video_sequence ON transcript_items(video_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_transcript_items_start_time ON transcript_items(video_id, start_time);

-- Full-text search on transcript text
CREATE INDEX IF NOT EXISTS idx_transcript_items_text_gin ON transcript_items USING gin(to_tsvector('english', text));

-- User progress tracking
CREATE TABLE IF NOT EXISTS user_progress (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id VARCHAR(11) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    progress_time DECIMAL(10,3) DEFAULT 0,
    total_duration DECIMAL(10,3) DEFAULT 0,
    completed BOOLEAN DEFAULT false,
    last_watched TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, video_id)
);

-- Indexes for user progress
CREATE INDEX IF NOT EXISTS idx_user_progress_user_id ON user_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_video_id ON user_progress(video_id);
CREATE INDEX IF NOT EXISTS idx_user_progress_user_video ON user_progress(user_id, video_id);

-- Watch history (for analytics)
CREATE TABLE IF NOT EXISTS watch_history (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    video_id VARCHAR(11) NOT NULL REFERENCES videos(video_id) ON DELETE CASCADE,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    duration DECIMAL(10,3) NOT NULL,
    action VARCHAR(20) NOT NULL CHECK (action IN ('play', 'pause', 'seek', 'complete')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for watch history
CREATE INDEX IF NOT EXISTS idx_watch_history_user_id ON watch_history(user_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_video_id ON watch_history(video_id);
CREATE INDEX IF NOT EXISTS idx_watch_history_timestamp ON watch_history(timestamp DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_videos_updated_at BEFORE UPDATE ON videos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_progress_updated_at BEFORE UPDATE ON user_progress
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

