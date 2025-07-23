-- 004_cleanup_and_consolidate.sql
-- Remove duplicate views and replace with improved versions

-- Drop the old basic ranking view (replace with better math)
DROP VIEW IF EXISTS influencer_rankings;

-- Drop any other duplicate views
DROP VIEW IF EXISTS influencer_summary;

-- Create the improved ranking as the main one (remove v2 suffix)
CREATE OR REPLACE VIEW influencer_rankings AS
WITH stats AS (
  -- Calculate basic metrics first
  SELECT 
    i.channel_id,
    i.channel_title,
    i.username,
    i.subscriber_count,
    COUNT(v.video_id) as video_count,
    AVG(v.view_count) as avg_views,
    AVG(v.like_count) as avg_likes,
    AVG(v.comment_count) as avg_comments,
    AVG(s.net_sentiment_score) as avg_sentiment,
    -- Engagement metrics
    CASE 
      WHEN i.subscriber_count > 0 THEN AVG(v.view_count) / i.subscriber_count 
      ELSE 0 
    END as engagement_rate,
    CASE 
      WHEN AVG(v.view_count) > 0 THEN AVG(v.like_count) / AVG(v.view_count) 
      ELSE 0 
    END as like_rate,
    CASE 
      WHEN AVG(v.view_count) > 0 THEN AVG(v.comment_count) / AVG(v.view_count) 
      ELSE 0 
    END as comment_rate,
    -- Consistency (lower variance = more consistent)
    CASE 
      WHEN COUNT(v.video_id) > 1 THEN 
        1.0 / (1.0 + STDDEV(v.view_count) / NULLIF(AVG(v.view_count), 0))
      ELSE 1.0 
    END as consistency_score,
    i.last_indexed
  FROM influencers i
  LEFT JOIN videos v ON i.channel_id = v.channel_id
  LEFT JOIN video_sentiment_analysis s ON v.video_id = s.video_id
  GROUP BY i.channel_id, i.channel_title, i.username, i.subscriber_count, i.last_indexed
),
growth_stats AS (
  -- Calculate growth separately
  SELECT 
    channel_id,
    AVG(subscriber_count_change) as recent_growth_30d
  FROM influencer_stats_history 
  WHERE recorded_at > (CURRENT_DATE - 30)
  GROUP BY channel_id
),
percentiles AS (
  -- Calculate percentile ranks for normalization (0-1 scale)
  SELECT 
    s.*,
    COALESCE(g.recent_growth_30d, 0) as recent_subscriber_growth,
    -- Normalize to 0-1 scale using percentile rank
    PERCENT_RANK() OVER (ORDER BY s.subscriber_count) as subscriber_percentile,
    PERCENT_RANK() OVER (ORDER BY s.avg_views) as views_percentile,
    PERCENT_RANK() OVER (ORDER BY s.engagement_rate) as engagement_percentile,
    PERCENT_RANK() OVER (ORDER BY s.like_rate) as like_percentile,
    PERCENT_RANK() OVER (ORDER BY s.comment_rate) as comment_percentile,
    PERCENT_RANK() OVER (ORDER BY s.avg_sentiment) as sentiment_percentile,
    PERCENT_RANK() OVER (ORDER BY COALESCE(g.recent_growth_30d, 0)) as growth_percentile,
    PERCENT_RANK() OVER (ORDER BY s.consistency_score) as consistency_percentile
  FROM stats s
  LEFT JOIN growth_stats g ON s.channel_id = g.channel_id
)
SELECT 
  *,
  -- Improved ranking score (all metrics normalized 0-1)
  (
    subscriber_percentile * 0.15 +        -- Size matters, but not everything
    views_percentile * 0.20 +             -- Average view performance
    engagement_percentile * 0.25 +        -- Views/subscribers ratio (most important)
    like_percentile * 0.15 +              -- Like engagement
    comment_percentile * 0.10 +           -- Comment engagement  
    sentiment_percentile * 0.05 +         -- Sentiment (small weight)
    growth_percentile * 0.20 +            -- Recent growth (important)
    consistency_percentile * 0.10         -- Consistency bonus
  ) * 100 as normalized_ranking_score
FROM percentiles
ORDER BY normalized_ranking_score DESC;

-- Also drop the v2 version since we replaced the main one
DROP VIEW IF EXISTS influencer_rankings_v2;
