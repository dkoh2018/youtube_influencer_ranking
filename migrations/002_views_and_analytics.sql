-- 002_views_and_analytics.sql
-- Add database views for complex relationships and analytics

-- Influencer rankings view - server-side calculation of complex relationships
CREATE OR REPLACE VIEW influencer_rankings AS
SELECT 
  i.channel_id,
  i.channel_title,
  i.username,
  i.subscriber_count,
  i.total_views,
  i.total_videos,
  COUNT(v.video_id) as indexed_videos,
  AVG(v.view_count) as avg_views_per_video,
  AVG(v.like_count) as avg_likes_per_video,
  AVG(v.comment_count) as avg_comments_per_video,
  COALESCE(AVG(s.net_sentiment_score), 0) as avg_sentiment_score,
  -- Calculated ranking score (server-side calculation!)
  (
    COALESCE(i.subscriber_count, 0) * 0.2 + 
    COALESCE(AVG(v.view_count), 0) * 0.001 + 
    COALESCE(AVG(v.like_count), 0) * 0.1 + 
    COALESCE(AVG(s.net_sentiment_score), 0) * 10000 +
    COALESCE(COUNT(v.video_id), 0) * 100
  ) as ranking_score,
  i.last_indexed
FROM influencers i
LEFT JOIN videos v ON i.channel_id = v.channel_id
LEFT JOIN video_sentiment_analysis s ON v.video_id = s.video_id
GROUP BY i.channel_id, i.channel_title, i.username, i.subscriber_count, i.total_views, i.total_videos, i.last_indexed
ORDER BY ranking_score DESC;

-- Enhanced video comment stats view
CREATE OR REPLACE VIEW video_comment_stats AS
SELECT 
  v.video_id,
  v.title as video_title,
  i.username,
  i.channel_title,
  COUNT(c.comment_id) as total_comments_indexed,
  COALESCE(AVG(c.like_count), 0) as avg_comment_likes,
  COALESCE(MAX(c.like_count), 0) as top_comment_likes,
  MAX(c.published_at) as latest_comment_date,
  v.view_count,
  v.like_count as video_likes,
  v.published_at as video_published_at,
  s.net_sentiment_score,
  s.positive_count,
  s.negative_count
FROM videos v
JOIN influencers i ON v.channel_id = i.channel_id
LEFT JOIN comments c ON v.video_id = c.video_id
LEFT JOIN video_sentiment_analysis s ON v.video_id = s.video_id
GROUP BY v.video_id, v.title, i.username, i.channel_title, v.view_count, v.like_count, v.published_at,
         s.net_sentiment_score, s.positive_count, s.negative_count
ORDER BY total_comments_indexed DESC;

-- Top comments across all videos
CREATE OR REPLACE VIEW top_comments AS
SELECT 
  c.comment_id,
  c.text_content,
  c.like_count,
  c.author_name,
  c.published_at,
  v.title as video_title,
  i.channel_title as influencer,
  v.view_count as video_views,
  s.net_sentiment_score
FROM comments c
JOIN videos v ON c.video_id = v.video_id
JOIN influencers i ON v.channel_id = i.channel_id
LEFT JOIN video_sentiment_analysis s ON v.video_id = s.video_id
WHERE c.like_count > 0
ORDER BY c.like_count DESC;

-- Channel analytics summary view
CREATE OR REPLACE VIEW channel_analytics AS
SELECT 
  i.channel_id,
  i.channel_title,
  i.username,
  i.subscriber_count,
  i.total_views,
  COUNT(v.video_id) as indexed_videos,
  SUM(v.view_count) as total_indexed_views,
  AVG(v.view_count) as avg_video_views,
  COUNT(c.comment_id) as total_comments,
  COUNT(s.video_id) as videos_with_sentiment,
  AVG(s.net_sentiment_score) as avg_sentiment,
  -- Engagement rate calculation
  CASE 
    WHEN i.subscriber_count > 0 THEN 
      (AVG(v.view_count) / i.subscriber_count * 100)
    ELSE 0 
  END as engagement_rate_percent,
  MAX(v.published_at) as latest_video_date,
  i.last_indexed
FROM influencers i
LEFT JOIN videos v ON i.channel_id = v.channel_id
LEFT JOIN comments c ON v.video_id = c.video_id
LEFT JOIN video_sentiment_analysis s ON v.video_id = s.video_id
GROUP BY i.channel_id, i.channel_title, i.username, i.subscriber_count, i.total_views, i.last_indexed
ORDER BY total_indexed_views DESC;

-- Trending videos view (videos with recent high growth)
CREATE OR REPLACE VIEW trending_videos AS
SELECT 
  v.video_id,
  v.title,
  i.channel_title,
  v.view_count,
  v.like_count,
  v.comment_count,
  v.published_at,
  h.view_count_change,
  h.like_count_change,
  h.comment_count_change,
  h.recorded_at as last_updated,
  s.net_sentiment_score
FROM videos v
JOIN influencers i ON v.channel_id = i.channel_id
LEFT JOIN video_sentiment_analysis s ON v.video_id = s.video_id
LEFT JOIN LATERAL (
  SELECT * FROM video_stats_history h2 
  WHERE h2.video_id = v.video_id 
  ORDER BY h2.recorded_at DESC 
  LIMIT 1
) h ON true
WHERE h.view_count_change > 0
ORDER BY h.view_count_change DESC;
