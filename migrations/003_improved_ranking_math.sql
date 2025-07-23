-- 003_improved_ranking_math_fixed.sql
-- Improved mathematical models for better influencer ranking

-- Improved influencer rankings with normalized scoring
CREATE OR REPLACE VIEW influencer_rankings_v2 AS
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
  -- Calculate growth separately to avoid complex subqueries
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

-- Simplified growth analysis
CREATE OR REPLACE VIEW growth_analysis AS
SELECT 
  i.channel_id,
  i.channel_title,
  i.subscriber_count,
  -- Growth over different periods
  COALESCE(h7.growth_7d, 0) as subscribers_7d,
  COALESCE(h30.growth_30d, 0) as subscribers_30d,
  COALESCE(h30.avg_daily_growth, 0) as daily_subscriber_velocity
FROM influencers i
LEFT JOIN (
  SELECT 
    channel_id,
    SUM(subscriber_count_change) as growth_7d
  FROM influencer_stats_history 
  WHERE recorded_at > (CURRENT_DATE - 7)
  GROUP BY channel_id
) h7 ON i.channel_id = h7.channel_id
LEFT JOIN (
  SELECT 
    channel_id,
    SUM(subscriber_count_change) as growth_30d,
    AVG(subscriber_count_change) as avg_daily_growth
  FROM influencer_stats_history 
  WHERE recorded_at > (CURRENT_DATE - 30)
  GROUP BY channel_id
) h30 ON i.channel_id = h30.channel_id
ORDER BY daily_subscriber_velocity DESC;

-- Simplified performance consistency analysis
CREATE OR REPLACE VIEW performance_consistency AS
WITH channel_averages AS (
  SELECT 
    v.channel_id,
    i.channel_title,
    COUNT(v.video_id) as total_videos,
    AVG(v.view_count) as avg_views,
    STDDEV(v.view_count) as view_stddev,
    -- Recent vs overall performance (last 30 days)
    AVG(CASE WHEN v.published_at > (CURRENT_DATE - 30) THEN v.view_count END) as recent_avg_views
  FROM videos v
  JOIN influencers i ON v.channel_id = i.channel_id
  GROUP BY v.channel_id, i.channel_title
  HAVING COUNT(v.video_id) >= 3
),
hit_analysis AS (
  SELECT 
    v.channel_id,
    COUNT(CASE WHEN v.view_count > ca.avg_views THEN 1 END) as videos_above_average,
    COUNT(*) as total_videos_for_hits
  FROM videos v
  JOIN channel_averages ca ON v.channel_id = ca.channel_id
  GROUP BY v.channel_id
)
SELECT 
  ca.channel_id,
  ca.channel_title,
  ca.total_videos,
  ca.avg_views,
  ca.view_stddev,
  -- Coefficient of variation (lower = more consistent)
  CASE 
    WHEN ca.avg_views > 0 THEN ca.view_stddev / ca.avg_views
    ELSE 0 
  END as view_consistency_cv,
  -- What percentage of videos are "hits" (above average)
  (ha.videos_above_average * 100.0 / ha.total_videos_for_hits) as hit_rate_percent,
  -- Recent performance vs overall average
  CASE 
    WHEN ca.avg_views > 0 THEN ca.recent_avg_views / ca.avg_views
    ELSE 0
  END as recent_performance_ratio
FROM channel_averages ca
JOIN hit_analysis ha ON ca.channel_id = ha.channel_id
ORDER BY view_consistency_cv ASC;
