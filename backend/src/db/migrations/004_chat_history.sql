-- Chat History Table for storing user-video chat conversations
-- Stores last 5 messages per user-video combination

CREATE TABLE IF NOT EXISTS chat_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  video_id VARCHAR(50) NOT NULL,
  message_type VARCHAR(10) NOT NULL CHECK (message_type IN ('user', 'ai')),
  content TEXT NOT NULL,
  video_time INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Index for fast lookups by user and video
  CONSTRAINT chat_history_user_video_idx UNIQUE (id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_chat_history_user_video ON chat_history(user_id, video_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_created_at ON chat_history(created_at DESC);

-- Function to automatically limit chat history to last 5 message pairs (10 messages)
-- This keeps only the most recent conversations
CREATE OR REPLACE FUNCTION limit_chat_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Delete old messages keeping only last 10 (5 user + 5 AI)
  DELETE FROM chat_history
  WHERE id IN (
    SELECT id FROM chat_history
    WHERE user_id = NEW.user_id AND video_id = NEW.video_id
    ORDER BY created_at DESC
    OFFSET 10
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to auto-cleanup old messages
DROP TRIGGER IF EXISTS trigger_limit_chat_history ON chat_history;
CREATE TRIGGER trigger_limit_chat_history
AFTER INSERT ON chat_history
FOR EACH ROW
EXECUTE FUNCTION limit_chat_history();
