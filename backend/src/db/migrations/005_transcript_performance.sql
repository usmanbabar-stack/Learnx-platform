-- Migration 005: Performance optimizations for transcript retrieval
-- Purpose: Speed up transcript existence checks and add partial indexes

-- ⚡ Add partial index for faster "has transcript" checks
-- This index dramatically speeds up queries checking if a video has transcripts
CREATE INDEX IF NOT EXISTS idx_transcript_items_video_exists 
ON transcript_items(video_id) 
WHERE text IS NOT NULL AND text != '';

-- ⚡ Add index for transcript count queries (used in glossary/summary generation)
CREATE INDEX IF NOT EXISTS idx_transcript_items_count
ON transcript_items(video_id, id);

-- ⚡ Add covering index for common transcript retrieval pattern
-- This allows index-only scans without touching the table
CREATE INDEX IF NOT EXISTS idx_transcript_items_covering
ON transcript_items(video_id, sequence_order, start_time, duration, text);

-- ⚡ Optimize video_summaries lookups
CREATE INDEX IF NOT EXISTS idx_video_summaries_video_id
ON video_summaries(video_id);

-- ⚡ Optimize video_glossaries lookups  
CREATE INDEX IF NOT EXISTS idx_video_glossaries_video_id
ON video_glossaries(video_id);

-- Add statistics for better query planning
ANALYZE transcript_items;
ANALYZE videos;
ANALYZE video_summaries;
ANALYZE video_glossaries;
