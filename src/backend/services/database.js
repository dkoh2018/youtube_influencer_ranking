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
    // First get existing data to track changes
    const { data: existingInfluencer } = await this.supabase
      .from('influencers')
      .select('subscriber_count, total_views, total_videos')
      .eq('channel_id', channelData.channelId)
      .single();

    // Check if stats changed and store history
    if (existingInfluencer && (
      existingInfluencer.subscriber_count !== (channelData.subscriberCount || 0) ||
      existingInfluencer.total_views !== (channelData.totalViews || 0) ||
      existingInfluencer.total_videos !== (channelData.totalVideos || 0)
    )) {
      await this.storeInfluencerStatsHistory({
        channel_id: channelData.channelId,
        old_stats: existingInfluencer,
        new_stats: {
          subscriber_count: channelData.subscriberCount || 0,
          total_views: channelData.totalViews || 0,
          total_videos: channelData.totalVideos || 0
        }
      });
    }

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
      like_count: video.likeCount || 0,
      comment_count: video.commentCount || 0,
      stats_updated_at: new Date().toISOString(),
      indexed_at: new Date().toISOString()
    }));

    // First, get existing videos to track changes
    const videoIds = videos.map(v => v.videoId);
    const { data: existingVideos } = await this.supabase
      .from('videos')
      .select('video_id, view_count, like_count, comment_count')
      .in('video_id', videoIds);

    const existingMap = new Map();
    existingVideos?.forEach(v => existingMap.set(v.video_id, v));

    // Store historical data for changed videos
    const changedVideos = [];
    videoData.forEach(video => {
      const existing = existingMap.get(video.video_id);
      if (existing && (
        existing.view_count !== video.view_count || 
        existing.like_count !== video.like_count || 
        existing.comment_count !== video.comment_count
      )) {
        changedVideos.push({
          video_id: video.video_id,
          old_stats: existing,
          new_stats: {
            view_count: video.view_count,
            like_count: video.like_count,
            comment_count: video.comment_count
          }
        });
      }
    });

    // Store historical snapshots
    if (changedVideos.length > 0) {
      await this.storeVideoStatsHistory(changedVideos);
    }

    const { data, error } = await this.supabase
      .from('videos')
      .upsert(videoData, {
        onConflict: 'video_id'
      });

    if (error) throw error;
    
    console.log(`   ✅ Updated ${videoData.length} videos (${changedVideos.length} had stat changes)`);
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

  // Store comments for videos (with duplicate detection)
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

    // Use upsert with onConflict to handle duplicates automatically
    const { data, error } = await this.supabase
      .from('comments')
      .upsert(commentData, {
        onConflict: 'comment_id'
      });

    if (error) {
      console.error('❌ ERROR SAVING COMMENTS:', error);
      throw error;
    }
    
    // Log duplicate detection info
    const uniqueComments = commentData.length;
    console.log(`   ✅ SAVED ${uniqueComments} comments to database (duplicates automatically handled)`);
    
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



  // Get comment counts for videos (INCREMENTAL COMMENTS)
  async getVideoCommentCounts(videoIds) {
    if (!videoIds || videoIds.length === 0) {
      return new Map();
    }

    // Initialize counts map
    const commentCounts = new Map();
    videoIds.forEach(videoId => commentCounts.set(videoId, 0));

    // Fetch all comments with proper pagination to avoid Supabase limits
    let allComments = [];
    let from = 0;
    const pageSize = 1000;

    while (true) {
      const { data, error } = await this.supabase
        .from('comments')
        .select('video_id')
        .in('video_id', videoIds)
        .range(from, from + pageSize - 1);

      if (error) {
        console.error('❌ ERROR getting comment counts:', error.message);
        return commentCounts;
      }

      if (!data || data.length === 0) {
        break; // No more data
      }

      allComments.push(...data);
      
      // If we got less than pageSize, we've reached the end
      if (data.length < pageSize) {
        break;
      }
      
      from += pageSize;
    }

    // Count comments per video from all fetched data
    allComments.forEach(comment => {
      const videoId = comment.video_id;
      commentCounts.set(videoId, (commentCounts.get(videoId) || 0) + 1);
    });

    // Debug: Log comment counts found
    console.log(`   🔍 DEBUG: Found ${allComments.length} existing comments in database for ${videoIds.length} videos`);

    return commentCounts;
  }

  // Calculate which videos need additional comments (SMART INCREMENTAL)
  async getVideosNeedingMoreComments(videos, targetCommentsPerVideo) {
    const videoIds = videos.map(v => v.videoId);
    const commentCounts = await this.getVideoCommentCounts(videoIds);
    const commentStatus = await this.getVideoCommentStatus(videoIds);
    
    const videosNeedingComments = [];
    let totalSkipped = 0;

    videos.forEach(video => {
      const existingCount = commentCounts.get(video.videoId) || 0;
      const status = commentStatus.get(video.videoId);
      
      // Check if we need more comments
      const needed = Math.max(0, targetCommentsPerVideo - existingCount);
      
      if (needed > 0) {
        // Skip if video is fully scraped and we already have all available comments
        if (status?.is_fully_scraped && existingCount >= (status.total_comments_available || 0)) {
          totalSkipped++;
          console.log(`   Skipping ${video.title}: only has ${status.total_comments_available} comments (already scraped)`);
          return;
        }
        
        // Skip if we previously targeted higher number and video was fully scraped
        if (status?.is_fully_scraped && (status.max_comments_requested || 0) >= targetCommentsPerVideo) {
          totalSkipped++;
          console.log(`   Skipping ${video.title}: previously scraped ${status.max_comments_requested} target (has ${status.total_comments_available})`);
          return;
        }

        videosNeedingComments.push({
          ...video,
          existingComments: existingCount,
          commentsNeeded: needed,
          isPartiallyScraped: status?.is_fully_scraped || false,
          totalAvailable: status?.total_comments_available
        });
      } else {
        totalSkipped++;
      }
    });

    if (totalSkipped > 0) {
      console.log(`   Skipping comment fetch for ${totalSkipped} videos that already have enough comments.`);
    }

    return videosNeedingComments;
  }

  // Get comment processing status for videos
  async getVideoCommentStatus(videoIds) {
    if (!videoIds || videoIds.length === 0) {
      return new Map();
    }

    const { data, error } = await this.supabase
      .from('video_comment_status')
      .select('*')
      .in('video_id', videoIds);

    if (error) {
      console.error('⚠️  video_comment_status table not found (this is expected on first run):', error.message);
      return new Map(); // Return empty map, system will work without status tracking
    }

    const statusMap = new Map();
    data?.forEach(status => {
      statusMap.set(status.video_id, status);
    });

    return statusMap;
  }

  // Update video comment processing status
  async updateVideoCommentStatus(videoId, totalCommentsFound, isFullyScraped, targetRequested) {
    const { error } = await this.supabase
      .from('video_comment_status')
      .upsert({
        video_id: videoId,
        total_comments_available: totalCommentsFound,
        is_fully_scraped: isFullyScraped,
        max_comments_requested: targetRequested,
        last_scraped_at: new Date().toISOString()
      }, {
        onConflict: 'video_id'
      });

    if (error) {
      console.error('⚠️  Could not update video status (table may not exist):', error.message);
      // Don't throw - this is optional optimization
    }
  }

  // SENTIMENT ANALYSIS METHODS

  // Save sentiment analysis results
  async saveSentimentAnalysis(analysisResult) {
    const { summary, themes } = analysisResult.analysis;
    
    const sentimentData = {
      video_id: analysisResult.videoId,
      channel_id: analysisResult.channelId, // Add channel_id for direct access
      total_comments_analyzed: summary.total_comments_analyzed,
      net_sentiment_score: summary.net_sentiment_score,
      positive_count: summary.positive_count,
      negative_count: summary.negative_count,
      neutral_count: summary.neutral_count,
      themes: { themes }, // Store themes array as JSONB
      analyzed_at: analysisResult.analyzedAt,
      model_used: analysisResult.model,
      processing_time_seconds: parseFloat(analysisResult.processingTime?.replace('s', '')) || null
    };

    const { data, error } = await this.supabase
      .from('video_sentiment_analysis')
      .upsert(sentimentData, {
        onConflict: 'video_id'
      });

    if (error) {
      console.error('❌ ERROR SAVING SENTIMENT ANALYSIS:', error);
      throw error;
    }
    
    console.log(`   ✅ SAVED sentiment analysis for video ${analysisResult.videoId}`);
    return data;
  }

  // Get sentiment analysis for a video
  async getSentimentAnalysis(videoId) {
    const { data, error } = await this.supabase
      .from('video_sentiment_analysis')
      .select('*')
      .eq('video_id', videoId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No rows found
        return null;
      }
      throw error;
    }
    
    return data;
  }

  // Get all sentiment analyses
  async getAllSentimentAnalyses() {
    const { data, error } = await this.supabase
      .from('video_sentiment_analysis')
      .select(`
        *,
        videos:video_id(title, published_at, channel_id, view_count)
      `)
      .order('analyzed_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // Check if video already has sentiment analysis
  async hasSentimentAnalysis(videoId) {
    const result = await this.getSentimentAnalysis(videoId);
    return result !== null;
  }

  // HISTORICAL TRACKING METHODS

  // Store video stats history for versioning
  async storeVideoStatsHistory(changedVideos) {
    const historyData = changedVideos.map(change => ({
      video_id: change.video_id,
      recorded_at: new Date().toISOString(),
      view_count: change.new_stats.view_count,
      like_count: change.new_stats.like_count,
      comment_count: change.new_stats.comment_count,
      previous_view_count: change.old_stats.view_count,
      previous_like_count: change.old_stats.like_count,
      previous_comment_count: change.old_stats.comment_count,
      view_count_change: change.new_stats.view_count - change.old_stats.view_count,
      like_count_change: change.new_stats.like_count - change.old_stats.like_count,
      comment_count_change: change.new_stats.comment_count - change.old_stats.comment_count
    }));

    const { data, error } = await this.supabase
      .from('video_stats_history')
      .insert(historyData);

    if (error) {
      console.error('⚠️  Could not store stats history (table may not exist):', error.message);
      // Don't throw - this is optional optimization
    } else {
      console.log(`   📊 Stored historical stats for ${historyData.length} videos`);
    }

    return data;
  }

  // Get stats history for a video
  async getVideoStatsHistory(videoId, limit = 30) {
    const { data, error } = await this.supabase
      .from('video_stats_history')
      .select('*')
      .eq('video_id', videoId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('⚠️  Could not get stats history:', error.message);
      return [];
    }

    return data || [];
  }

  // Get trending videos (biggest view count increases)
  async getTrendingVideos(hours = 24, limit = 10) {
    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - hours);

    const { data, error } = await this.supabase
      .from('video_stats_history')
      .select(`
        video_id,
        view_count_change,
        like_count_change,
        recorded_at,
        videos:video_id(title, channel_id, published_at)
      `)
      .gte('recorded_at', sinceDate.toISOString())
      .order('view_count_change', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('⚠️  Could not get trending videos:', error.message);
      return [];
    }

    return data || [];
  }

  // INFLUENCER HISTORICAL TRACKING METHODS

  // Store influencer stats history for tracking subscriber growth/decline
  async storeInfluencerStatsHistory(change) {
    const historyData = {
      channel_id: change.channel_id,
      recorded_at: new Date().toISOString(),
      subscriber_count: change.new_stats.subscriber_count,
      total_views: change.new_stats.total_views,
      total_videos: change.new_stats.total_videos,
      previous_subscriber_count: change.old_stats.subscriber_count,
      previous_total_views: change.old_stats.total_views,
      previous_total_videos: change.old_stats.total_videos,
      subscriber_count_change: change.new_stats.subscriber_count - change.old_stats.subscriber_count,
      total_views_change: change.new_stats.total_views - change.old_stats.total_views,
      total_videos_change: change.new_stats.total_videos - change.old_stats.total_videos
    };

    const { data, error } = await this.supabase
      .from('influencer_stats_history')
      .insert(historyData);

    if (error) {
      console.error('⚠️  Could not store influencer stats history (table may not exist):', error.message);
      // Don't throw - this is optional optimization
    } else {
      const subChange = historyData.subscriber_count_change;
      const changeType = subChange > 0 ? 'gained' : subChange < 0 ? 'lost' : 'no change in';
      console.log(`   📈 Tracked subscriber change: ${Math.abs(subChange)} ${changeType} subscribers`);
    }

    return data;
  }

  // Get subscriber growth history for an influencer
  async getInfluencerStatsHistory(channelId, limit = 30) {
    const { data, error } = await this.supabase
      .from('influencer_stats_history')
      .select('*')
      .eq('channel_id', channelId)
      .order('recorded_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('⚠️  Could not get influencer stats history:', error.message);
      return [];
    }

    return data || [];
  }

  // Get fastest growing/declining influencers
  async getInfluencerGrowthTrends(hours = 24, limit = 10) {
    const sinceDate = new Date();
    sinceDate.setHours(sinceDate.getHours() - hours);

    const { data, error } = await this.supabase
      .from('influencer_stats_history')
      .select(`
        channel_id,
        subscriber_count_change,
        total_views_change,
        recorded_at,
        influencers:channel_id(channel_title, username)
      `)
      .gte('recorded_at', sinceDate.toISOString())
      .order('subscriber_count_change', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('⚠️  Could not get influencer growth trends:', error.message);
      return [];
    }

    return data || [];
  }
}

module.exports = Database;
