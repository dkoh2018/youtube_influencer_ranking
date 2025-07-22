-- SECTION 1: Teardown existing objects
-- Drop existing views and tables in reverse order of dependency to ensure a clean setup.
DROP VIEW IF EXISTS "public"."top_comments";
DROP VIEW IF EXISTS "public"."video_comment_stats";
DROP VIEW IF EXISTS "public"."influencer_summary";
DROP VIEW IF EXISTS "public"."channel_processing_status";
DROP TABLE IF EXISTS "public"."video_sentiment_analysis";
DROP TABLE IF EXISTS "public"."comments";
DROP TABLE IF EXISTS "public"."video_comment_status";
DROP TABLE IF EXISTS "public"."videos";
DROP TABLE IF EXISTS "public"."influencers";

-- SECTION 2: Create core tables

-- Table for storing influencer channel information
CREATE TABLE "public"."influencers" (
    "id" integer NOT NULL DEFAULT nextval('influencers_id_seq'::regclass),
    "channel_id" character varying NOT NULL,
    "username" character varying NOT NULL,
    "channel_title" character varying NOT NULL,
    "uploads_playlist_id" character varying NOT NULL,
    "total_videos" integer DEFAULT 0,
    "subscriber_count" bigint DEFAULT 0,
    "total_views" bigint DEFAULT 0,
    "last_indexed" timestamp with time zone DEFAULT now(),
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("channel_id"),
    UNIQUE ("username")
);

-- Table for storing video metadata
CREATE TABLE "public"."videos" (
    "id" integer NOT NULL DEFAULT nextval('videos_id_seq'::regclass),
    "video_id" character varying NOT NULL,
    "channel_id" character varying NOT NULL,
    "title" text NOT NULL,
    "published_at" timestamp with time zone NOT NULL,
    "description" text,
    "thumbnail_url" text,
    "duration" character varying,
    "view_count" bigint DEFAULT 0,
    "like_count" integer DEFAULT 0,
    "comment_count" integer DEFAULT 0,
    "indexed_at" timestamp with time zone DEFAULT now(),
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("video_id"),
    FOREIGN KEY ("channel_id") REFERENCES "public"."influencers"("channel_id") ON DELETE CASCADE
);

-- Table for storing video comments
CREATE TABLE "public"."comments" (
    "id" integer NOT NULL DEFAULT nextval('comments_id_seq'::regclass),
    "comment_id" character varying NOT NULL,
    "video_id" character varying NOT NULL,
    "author_name" character varying NOT NULL,
    "author_channel_id" character varying,
    "text_content" text NOT NULL,
    "like_count" integer DEFAULT 0,
    "reply_count" integer DEFAULT 0,
    "published_at" timestamp with time zone NOT NULL,
    "updated_at" timestamp with time zone NOT NULL,
    "indexed_at" timestamp with time zone DEFAULT now(),
    "created_at" timestamp with time zone DEFAULT now(),
    PRIMARY KEY ("id"),
    UNIQUE ("comment_id"),
    FOREIGN KEY ("video_id") REFERENCES "public"."videos"("video_id") ON DELETE CASCADE
);

-- Table to track comment scraping status for each video
CREATE TABLE "public"."video_comment_status" (
    "video_id" text NOT NULL,
    "total_comments_available" integer,
    "is_fully_scraped" boolean DEFAULT false,
    "last_scraped_at" timestamp without time zone DEFAULT now(),
    "max_comments_requested" integer DEFAULT 100,
    PRIMARY KEY ("video_id"),
    FOREIGN KEY ("video_id") REFERENCES "public"."videos"("video_id") ON DELETE CASCADE
);

-- Table for storing sentiment analysis results per video
CREATE TABLE "public"."video_sentiment_analysis" (
    "id" integer NOT NULL DEFAULT nextval('video_sentiment_analysis_id_seq'::regclass),
    "video_id" character varying NOT NULL,
    "channel_id" character varying,
    "total_comments_analyzed" integer NOT NULL,
    "net_sentiment_score" numeric NOT NULL,
    "positive_count" integer NOT NULL,
    "negative_count" integer NOT NULL,
    "neutral_count" integer NOT NULL,
    "themes" jsonb NOT NULL,
    "analyzed_at" timestamp with time zone DEFAULT now(),
    "model_used" character varying DEFAULT 'gpt-4o'::character varying,
    "processing_time_seconds" numeric,
    PRIMARY KEY ("id"),
    UNIQUE ("video_id"),
    FOREIGN KEY ("video_id") REFERENCES "public"."videos"("video_id") ON DELETE CASCADE,
    FOREIGN KEY ("channel_id") REFERENCES "public"."influencers"("channel_id") ON DELETE SET NULL
);

-- SECTION 3: Create views for data aggregation and summary

-- View to monitor the video indexing status for each channel
CREATE OR REPLACE VIEW "public"."channel_processing_status" AS
SELECT
    i.channel_id,
    i.username,
    i.channel_title,
    i.total_videos AS youtube_total_videos,
    COUNT(v.id) AS indexed_videos,
    MAX(v.published_at) AS latest_indexed_video,
    MIN(v.published_at) AS oldest_indexed_video,
    i.last_indexed,
    CASE
        WHEN i.total_videos = 0 THEN 'pending'
        WHEN COUNT(v.id) = i.total_videos THEN 'complete'
        ELSE 'in_progress'
    END AS processing_status,
    (i.total_videos - COUNT(v.id)) AS estimated_missing_videos
FROM
    "public"."influencers" i
LEFT JOIN
    "public"."videos" v ON i.channel_id = v.channel_id
GROUP BY
    i.channel_id, i.username, i.channel_title, i.total_videos, i.last_indexed;

-- View for a high-level summary of each influencer's stats
CREATE OR REPLACE VIEW "public"."influencer_summary" AS
SELECT
    i.username,
    i.channel_title,
    i.subscriber_count,
    i.total_views,
    COUNT(v.id) AS indexed_video_count,
    AVG(v.view_count) AS avg_video_views,
    MAX(v.published_at) AS latest_video_date,
    MAX(i.last_indexed) AS last_indexed
FROM
    "public"."influencers" i
LEFT JOIN
    "public"."videos" v ON i.channel_id = v.channel_id
GROUP BY
    i.username, i.channel_title, i.subscriber_count, i.total_views;

-- View to get statistics about comments for each video
CREATE OR REPLACE VIEW "public"."video_comment_stats" AS
SELECT
    v.video_id,
    v.title AS video_title,
    i.username,
    i.channel_title,
    COUNT(c.id) AS total_comments_indexed,
    AVG(c.like_count) AS avg_comment_likes,
    MAX(c.like_count) AS top_comment_likes,
    MAX(c.published_at) AS latest_comment_date
FROM
    "public"."videos" v
JOIN
    "public"."influencers" i ON v.channel_id = i.channel_id
LEFT JOIN
    "public"."comments" c ON v.video_id = c.video_id
GROUP BY
    v.video_id, v.title, i.username, i.channel_title;

-- View to show the most liked comments across all videos
CREATE OR REPLACE VIEW "public"."top_comments" AS
SELECT
    c.comment_id,
    c.text_content,
    c.like_count,
    c.author_name,
    c.published_at,
    v.title AS video_title,
    i.username AS influencer
FROM
    "public"."comments" c
JOIN
    "public"."videos" v ON c.video_id = v.video_id
JOIN
    "public"."influencers" i ON v.channel_id = i.channel_id
ORDER BY
    c.like_count DESC;

-- SECTION 4: Grant permissions
-- Grant necessary permissions to roles for database interaction.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

-- End of script.
