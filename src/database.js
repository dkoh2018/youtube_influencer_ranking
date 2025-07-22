const { createClient } = require('@supabase/supabase-js');
const { DEFAULT_CONFIG } = require('../config/defaults');

class Database {
  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_KEY
    );
  }

  // Initialize database schema
  async initializeSchema() {
    console.log('Database schema should be created in Supabase dashboard');
    console.log('Run the SQL commands from schema.sql file');
  }

  // Store influencer channel data with statistics
  async storeInfluencer(channelData) {
    const { data, error } = await this.supabase
      .from('influencers')
      .upsert({
        channel_id: channelData.channelId,
        username: channelData.username,
        channel_title: channelData.channelTitle,
        uploads_playlist_id: channelData.uploadsPlaylistId,
        total_videos: channelData.totalVideos || 0,
        subscriber_count: channelData.subscriberCount || 0,
        total_views: channelData.totalViews || 0,
        last_indexed: new Date().toISOString()
      }, {
        onConflict: 'channel_id'
      });

    if (error) throw error;
    return data;
  }

  // Store video data with statistics
  async storeVideos(channelId, videos) {
    const videoData = videos.map(video => ({
      video_id: video.videoId,
      channel_id: channelId,
      title: video.title,
      published_at: video.publishedAt,
      description: video.description?.substring(0, 1000), // Limit description length
      thumbnail_url: video.thumbnails?.medium?.url || video.thumbnails?.default?.url,
      duration: video.duration || null,
      view_count: video.viewCount || 0,
      comment_count: video.commentCount || 0,
      indexed_at: new Date().toISOString()
    }));

    const { data, error } = await this.supabase
      .from('videos')
      .upsert(videoData, {
        onConflict: 'video_id'
      });

    if (error) throw error;
    return data;
  }

  // Get all influencers
  async getInfluencers() {
    const { data, error } = await this.supabase
      .from('influencers')
      .select('*')
      .order('total_videos', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Get videos for a specific influencer
  async getInfluencerVideos(channelId, limit = null) {
    // If a specific limit is requested, use simple query
    if (limit && limit > 0) {
      const { data, error } = await this.supabase
        .from('videos')
        .select('*')
        .eq('channel_id', channelId)
        .order('published_at', { ascending: false })
        .limit(limit);
      
      if (error) throw error;
      return this.convertVideoData(data);
    }
    
    // For unlimited queries, fetch all videos in batches
    const allVideos = [];
    const batchSize = 1000;
    let hasMore = true;
    let rangeStart = 0;
    
    while (hasMore) {
      const { data, error } = await this.supabase
        .from('videos')
        .select('*')
        .eq('channel_id', channelId)
        .order('published_at', { ascending: false })
        .range(rangeStart, rangeStart + batchSize - 1);
      
      if (error) throw error;
      
      if (data.length === 0) {
        hasMore = false;
      } else {
        allVideos.push(...data);
        rangeStart += batchSize;
        hasMore = data.length === batchSize; // Continue if we got a full batch
      }
    }
    
    return this.convertVideoData(allVideos);
  }
  
  // Helper method to convert video data
  convertVideoData(data) {
    // Convert snake_case to camelCase for consistency
    return data.map(video => ({
      ...video,
      videoId: video.video_id,
      channelId: video.channel_id,
      publishedAt: video.published_at,
      channelTitle: video.channel_title
    }));
  }

  // Get video count by channel
  async getVideoCountsByChannel() {
    const { data, error } = await this.supabase
      .from('videos')
      .select('channel_id, count(*)')
      .group('channel_id');

    if (error) throw error;
    return data;
  }

  // Check processing status and what videos we already have
  async getProcessingStatus(channelId) {
    const { data, error } = await this.supabase
      .from('channel_processing_status')
      .select('*')
      .eq('channel_id', channelId)
      .single();

    if (error) {
      console.log('Channel not found in database, will process all videos');
      return {
        needsProcessing: true,
        existingVideoIds: [],
        status: 'never_processed'
      };
    }

    const lastIndexed = new Date(data.last_indexed);
    const now = new Date();
    const ageHours = (now - lastIndexed) / (1000 * 60 * 60);

    return {
      needsProcessing: ageHours > 24 || data.processing_status !== 'fully_processed',
      existingVideoIds: await this.getExistingVideoIds(channelId),
      status: data.processing_status,
      indexedVideos: data.indexed_videos,
      totalVideos: data.youtube_total_videos,
      latestVideo: data.latest_indexed_video,
      ageHours: ageHours,
      subscriber_count: data.subscriber_count,
      total_views: data.total_views,
      youtube_total_videos: data.youtube_total_videos
    };
  }

  // Get video IDs we already have for this channel
  async getExistingVideoIds(channelId) {
    const { data, error } = await this.supabase
      .from('videos')
      .select('video_id')
      .eq('channel_id', channelId)
      .limit(DEFAULT_CONFIG.maxDatabaseQueryLimit); // High limit for prolific creators

    if (error) return [];
    return data.map(item => item.video_id);
  }

  // Filter out videos we already have (COST OPTIMIZATION)
  filterNewVideos(allVideos, existingVideoIds) {
    const newVideos = allVideos.filter(video => !existingVideoIds.includes(video.videoId));
    const skippedCount = allVideos.length - newVideos.length;
    
    if (skippedCount > 0) {
      console.log(`   Cost saved: Skipped ${skippedCount} existing videos`);
    }
    
    return newVideos;
  }

  // Get leaderboard data
  async getLeaderboard() {
    const { data, error } = await this.supabase
      .from('influencers')
      .select(`
        *,
        videos:videos(count)
      `)
      .order('total_videos', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Analytics: Get recent video trends
  async getRecentVideoTrends(days = 30) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const { data, error } = await this.supabase
      .from('videos')
      .select(`
        channel_id,
        published_at,
        influencers:channel_id(channel_title, username)
      `)
      .gte('published_at', startDate.toISOString())
      .order('published_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // COMMENT METHODS

  // Store comments for videos
  async storeComments(comments) {
    if (!comments || comments.length === 0) return [];

    const commentData = comments.map(comment => ({
      comment_id: comment.commentId,
      video_id: comment.videoId,
      author_name: comment.authorName,
      author_channel_id: comment.authorChannelId,
      text_content: comment.textContent,
      like_count: comment.likeCount,
      reply_count: comment.replyCount,
      published_at: comment.publishedAt,
      updated_at: comment.updatedAt,
      indexed_at: new Date().toISOString()
    }));

    const { data, error } = await this.supabase
      .from('comments')
      .upsert(commentData, {
        onConflict: 'comment_id'
      });

    if (error) throw error;
    return data;
  }

  // Get existing comment IDs for a video
  async getExistingCommentIds(videoId) {
    const { data, error } = await this.supabase
      .from('comments')
      .select('comment_id')
      .eq('video_id', videoId);

    if (error) return [];
    return data.map(item => item.comment_id);
  }

  // Get comment statistics
  async getCommentStats() {
    const { data, error } = await this.supabase
      .from('video_comment_stats')
      .select('*')
      .order('total_comments_indexed', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Get top comments across all videos
  async getTopComments(limit = DEFAULT_CONFIG.maxVideosPerQuery) {
    const { data, error } = await this.supabase
      .from('top_comments')
      .select('*')
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // Get comments for a specific video
  async getVideoComments(videoId, limit = 100) {
    const { data, error } = await this.supabase
      .from('comments')
      .select('*')
      .eq('video_id', videoId)
      .order('published_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // Check which videos already have comments indexed
  async getVideosWithComments(channelId) {
    const { data, error } = await this.supabase
      .from('videos')
      .select(`
        video_id,
        title,
        published_at,
        comments:comments(count)
      `)
      .eq('channel_id', channelId)
      .order('published_at', { ascending: false });

    if (error) throw error;
    return data.map(video => ({
      videoId: video.video_id,  // Convert to camelCase
      title: video.title,
      publishedAt: video.published_at,
      hasComments: video.comments[0]?.count > 0
    }));
  }

  // Check which videos already have comments indexed (OPTIMIZATION)
  async filterVideosWithoutComments(videoIds) {
    if (!videoIds || videoIds.length === 0) {
      return [];
    }

    const { data, error } = await this.supabase
      .from('comments')
      .select('video_id')
      .in('video_id', videoIds);

    if (error) {
      console.error('Error checking for existing comments:', error.message);
      return videoIds; // On error, try to process all to be safe
    }

    const videosWithComments = new Set(data.map(item => item.video_id));
    const videosWithoutComments = videoIds.filter(id => !videosWithComments.has(id));

    if (videosWithComments.size > 0) {
        console.log(`   Skipping comment fetch for ${videosWithComments.size} videos that are already indexed.`);
    }

    return videosWithoutComments;
  }
}

module.exports = Database;
