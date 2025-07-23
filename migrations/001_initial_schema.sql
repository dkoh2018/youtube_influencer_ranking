-- 001_initial_schema.sql
-- This represents your current database structure based on what exists

-- Main influencers table
CREATE TABLE IF NOT EXISTS influencers (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR NOT NULL UNIQUE,
  username VARCHAR,
  channel_title VARCHAR,
  uploads_playlist_id VARCHAR,
  total_videos INTEGER DEFAULT 0,
  subscriber_count INTEGER DEFAULT 0,
  total_views BIGINT DEFAULT 0,
  last_indexed TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Videos table with stats
CREATE TABLE IF NOT EXISTS videos (
  id SERIAL PRIMARY KEY,
  video_id VARCHAR NOT NULL UNIQUE,
  channel_id VARCHAR NOT NULL REFERENCES influencers(channel_id),
  title TEXT,
  published_at TIMESTAMPTZ,
  description TEXT,
  thumbnail_url VARCHAR,
  duration VARCHAR,
  view_count BIGINT DEFAULT 0,
  like_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  stats_updated_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Comments table
CREATE TABLE IF NOT EXISTS comments (
  id SERIAL PRIMARY KEY,
  comment_id VARCHAR NOT NULL UNIQUE,
  video_id VARCHAR NOT NULL REFERENCES videos(video_id),
  author_name VARCHAR,
  author_channel_id VARCHAR,
  text_content TEXT,
  like_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  published_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  indexed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sentiment analysis results
CREATE TABLE IF NOT EXISTS video_sentiment_analysis (
  id SERIAL PRIMARY KEY,
  video_id VARCHAR NOT NULL UNIQUE REFERENCES videos(video_id),
  channel_id VARCHAR NOT NULL REFERENCES influencers(channel_id),
  total_comments_analyzed INTEGER,
  net_sentiment_score DECIMAL(4,3),
  positive_count INTEGER DEFAULT 0,
  negative_count INTEGER DEFAULT 0,
  neutral_count INTEGER DEFAULT 0,
  themes JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  model_used VARCHAR,
  processing_time_seconds DECIMAL(6,2)
);

-- Video stats history for tracking changes
CREATE TABLE IF NOT EXISTS video_stats_history (
  id SERIAL PRIMARY KEY,
  video_id VARCHAR NOT NULL REFERENCES videos(video_id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  view_count BIGINT,
  like_count INTEGER,
  comment_count INTEGER,
  previous_view_count BIGINT,
  previous_like_count INTEGER,
  previous_comment_count INTEGER,
  view_count_change BIGINT,
  like_count_change INTEGER,
  comment_count_change INTEGER
);

-- Influencer stats history for growth tracking
CREATE TABLE IF NOT EXISTS influencer_stats_history (
  id SERIAL PRIMARY KEY,
  channel_id VARCHAR NOT NULL REFERENCES influencers(channel_id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  subscriber_count INTEGER,
  total_views BIGINT,
  total_videos INTEGER,
  previous_subscriber_count INTEGER,
  previous_total_views BIGINT,
  previous_total_videos INTEGER,
  subscriber_count_change INTEGER,
  total_views_change BIGINT,
  total_videos_change INTEGER
);

-- Video comment processing status
CREATE TABLE IF NOT EXISTS video_comment_status (
  video_id VARCHAR PRIMARY KEY REFERENCES videos(video_id),
  total_comments_available INTEGER,
  is_fully_scraped BOOLEAN DEFAULT FALSE,
  last_scraped_at TIMESTAMPTZ DEFAULT NOW(),
  max_comments_requested INTEGER
);

-- Channel processing status
CREATE TABLE IF NOT EXISTS channel_processing_status (
  channel_id VARCHAR PRIMARY KEY REFERENCES influencers(channel_id),
  username VARCHAR,
  channel_title VARCHAR,
  youtube_total_videos INTEGER,
  indexed_videos INTEGER DEFAULT 0,
  latest_indexed_video VARCHAR,
  oldest_indexed_video VARCHAR,
  last_indexed TIMESTAMPTZ,
  processing_status VARCHAR DEFAULT 'never_processed',
  estimated_missing_videos INTEGER DEFAULT 0
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_videos_channel_id ON videos(channel_id);
CREATE INDEX IF NOT EXISTS idx_videos_published_at ON videos(published_at);
CREATE INDEX IF NOT EXISTS idx_comments_video_id ON comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_published_at ON comments(published_at);
CREATE INDEX IF NOT EXISTS idx_sentiment_channel_id ON video_sentiment_analysis(channel_id);
CREATE INDEX IF NOT EXISTS idx_stats_history_video_id ON video_stats_history(video_id);
CREATE INDEX IF NOT EXISTS idx_influencer_history_channel_id ON influencer_stats_history(channel_id);
