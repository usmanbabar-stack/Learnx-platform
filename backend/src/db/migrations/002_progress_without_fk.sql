-- Migration: Remove foreign key constraints on user_progress and watch_history
-- This allows tracking progress on videos that may not be in our database yet
-- (e.g., YouTube videos watched directly without being indexed)

-- Drop existing tables and recreate without foreign key on video_id
-- Note: This is safe for dev, but in production you'd want to preserve data

-- First, drop the foreign key constraints if they exist
DO $$
BEGIN
    -- Drop FK from user_progress if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'user_progress_video_id_fkey' 
        AND table_name = 'user_progress'
    ) THEN
        ALTER TABLE user_progress DROP CONSTRAINT user_progress_video_id_fkey;
    END IF;
    
    -- Drop FK from watch_history if exists
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'watch_history_video_id_fkey' 
        AND table_name = 'watch_history'
    ) THEN
        ALTER TABLE watch_history DROP CONSTRAINT watch_history_video_id_fkey;
    END IF;
END $$;

-- Add video_title column to user_progress for display without join
ALTER TABLE user_progress 
ADD COLUMN IF NOT EXISTS video_title VARCHAR(500);

ALTER TABLE user_progress 
ADD COLUMN IF NOT EXISTS video_thumbnail TEXT;

ALTER TABLE user_progress 
ADD COLUMN IF NOT EXISTS video_channel VARCHAR(255);

-- Ensure watch_history doesn't block on missing video
-- Already handled by dropping FK above

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_user_progress_last_watched ON user_progress(user_id, last_watched DESC);
CREATE INDEX IF NOT EXISTS idx_user_progress_completed ON user_progress(user_id, completed);
