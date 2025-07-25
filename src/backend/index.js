require('dotenv').config();
const express = require('express');
const cors = require('cors');
const IndexingService = require('./services/indexingService');
const AnalyticsEngine = require('./services/analyticsEngine');
const Database = require('./services/database');
const { INFLUENCERS } = require('./config/influencers');
const { DEFAULT_CONFIG } = require('./config/defaults');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize services
const indexingService = new IndexingService(process.env.YOUTUBE_API_KEY);
const analyticsEngine = new AnalyticsEngine(process.env.YOUTUBE_API_KEY);
const database = new Database();

// PHASE 1: Indexing Routes (One-time setup)
app.post('/api/index/influencer/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { force } = req.query;
    const result = await indexingService.indexSingleInfluencer(username, force === 'true');
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to index influencer',
      message: error.message 
    });
  }
});

app.post('/api/index/bulk', async (req, res) => {
  try {
    const { influencers } = req.body;
    if (!influencers || !Array.isArray(influencers)) {
      return res.status(400).json({ error: 'influencers array required in body' });
    }

    const results = await indexingService.indexAllInfluencers(influencers);
    res.json(results);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to bulk index',
      message: error.message 
    });
  }
});

app.get('/api/index/status', async (req, res) => {
  try {
    const status = await indexingService.getIndexingStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get status',
      message: error.message 
    });
  }
});

// Quick start: Index all configured influencers
app.post('/api/index/all', async (req, res) => {
  try {
    console.log('Starting bulk index of all configured influencers...');
    const results = await indexingService.indexAllInfluencers(INFLUENCERS);
    res.json({
      message: 'Bulk indexing completed',
      influencersProcessed: INFLUENCERS,
      results
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to index all influencers',
      message: error.message 
    });
  }
});

app.get('/api/config/influencers', async (req, res) => {
  try {
    res.json({
      configured: INFLUENCERS,
      total: INFLUENCERS.length
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to get influencer config',
      message: error.message 
    });
  }
});

// Data Access Routes
app.get('/api/influencer/:username/videos', async (req, res) => {
  try {
    const { username } = req.params;
    const { limit } = req.query;
    
    // Get from database, not API
    const influencers = await database.getInfluencers();
    const influencer = influencers.find(inf => inf.username === username);
    
    if (!influencer) {
      return res.status(404).json({ error: 'Influencer not found. Run indexing first.' });
    }
    
    const videos = await database.getInfluencerVideos(influencer.channel_id, limit ? parseInt(limit) : null);
    res.json({
      influencer: username,
      channelTitle: influencer.channel_title,
      channelId: influencer.channel_id,
      totalVideos: influencer.total_videos,
      videos
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch videos',
      message: error.message 
    });
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const leaderboard = await database.getLeaderboard();
    res.json(leaderboard);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch leaderboard',
      message: error.message 
    });
  }
});

app.get('/api/analytics/recent', async (req, res) => {
  try {
    const { days } = req.query;
    const trends = await database.getRecentVideoTrends(parseInt(days) || 30);
    res.json(trends);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch trends',
      message: error.message 
    });
  }
});

// ANALYTICS ENGINE ROUTES

// Run full analytics engine (videos + comments)
app.post('/api/engine/process', async (req, res) => {
  try {
    const { 
      maxInfluencers = DEFAULT_CONFIG.maxInfluencers, 
      videosPerInfluencer = DEFAULT_CONFIG.videosPerInfluencer, 
      commentsPerVideo = DEFAULT_CONFIG.commentsPerVideo 
    } = req.body;
    
    console.log('Analytics Engine triggered via API');
    
    const options = {
      maxInfluencers,
      videosPerInfluencer,
      commentsPerVideo,
      includeComments: true
    };

    const results = await analyticsEngine.processInfluencers(INFLUENCERS, options);
    res.json(results);
  } catch (error) {
    res.status(500).json({ 
      error: 'Analytics engine failed',
      message: error.message 
    });
  }
});

// Get comment statistics
app.get('/api/comments/stats', async (req, res) => {
  try {
    const stats = await database.getCommentStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch comment stats',
      message: error.message 
    });
  }
});

// Get top comments
app.get('/api/comments/top', async (req, res) => {
  try {
    const { limit } = req.query;
    const comments = await database.getTopComments(parseInt(limit) || DEFAULT_CONFIG.maxVideosPerQuery);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch top comments',
      message: error.message 
    });
  }
});

// Get comments for a specific video
app.get('/api/video/:videoId/comments', async (req, res) => {
  try {
    const { videoId } = req.params;
    const { limit } = req.query;
    const comments = await database.getVideoComments(videoId, parseInt(limit) || 100);
    res.json(comments);
  } catch (error) {
    res.status(500).json({ 
      error: 'Failed to fetch video comments',
      message: error.message 
    });
  }
});

// Get overall comment statistics for dashboard
app.get('/api/analytics/comments', async (req, res) => {
  try {
    // Get total comment count
    const { count: totalComments, error: totalError } = await database.supabase
      .from('comments')
      .select('*', { count: 'exact', head: true });
    
    if (totalError) throw totalError;

    console.log(`📊 Total comments found: ${totalComments}`);

    // Use fallback approach (more reliable than custom function)
    const influencerCommentCounts = {};
    const influencers = await database.getInfluencers();
    
    console.log(`📊 Processing ${influencers.length} influencers for comment counts...`);

    // Use the SQL function we created, with fallback
    const { data: commentsByInfluencer, error: sqlFunctionError } = await database.supabase
      .rpc('get_comment_counts_by_influencer');
    
    if (!sqlFunctionError && commentsByInfluencer) {
      // Use the efficient SQL function result
      commentsByInfluencer.forEach(row => {
        influencerCommentCounts[row.username] = row.comment_count || 0;
      });
      console.log(`📊 Used SQL function for comment counts:`, influencerCommentCounts);
    } else {
      console.warn('SQL function failed, using fallback approach:', sqlFunctionError?.message);
      
      // Fallback: individual queries per influencer
      for (const influencer of influencers) {
        try {
          // Use a raw SQL query for better performance
          const { data: countResult, error: countError } = await database.supabase
            .rpc('count_comments_for_channel', { channel_id_param: influencer.channel_id });
          
          if (countError) {
            // Double fallback: simple count approach
            const { data: videos, error: videoError } = await database.supabase
              .from('videos')
              .select('video_id')
              .eq('channel_id', influencer.channel_id);
            
            if (!videoError && videos?.length > 0) {
              const videoIds = videos.map(v => v.video_id);
              const { count: commentCount, error: commentError } = await database.supabase
                .from('comments')
                .select('comment_id', { count: 'exact', head: true })
                .in('video_id', videoIds);
              
              if (!commentError) {
                influencerCommentCounts[influencer.username] = commentCount || 0;
                console.log(`💬 ${influencer.username}: ${commentCount} comments (fallback)`);
              } else {
                influencerCommentCounts[influencer.username] = 0;
                console.error(`❌ Error counting comments for ${influencer.username}:`, commentError.message);
              }
            } else {
              influencerCommentCounts[influencer.username] = 0;
              console.log(`📹 ${influencer.username} has no videos indexed`);
            }
          } else {
            influencerCommentCounts[influencer.username] = countResult || 0;
            console.log(`💬 ${influencer.username}: ${countResult} comments`);
          }
        } catch (error) {
          console.error(`❌ Error processing ${influencer.username}:`, error.message);
          influencerCommentCounts[influencer.username] = 0;
        }
      }
    }

    console.log(`📊 Final comment counts:`, influencerCommentCounts);

    res.json({
      totalComments: totalComments || 0,
      commentsByInfluencer: influencerCommentCounts
    });
  } catch (error) {
    console.error('❌ Comment analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch comment analytics',
      message: error.message 
    });
  }
});

// ENGAGEMENT ANALYTICS ROUTES

// Get channel engagement summary for all influencers
app.get('/api/engagement/channels', async (req, res) => {
  try {
    const { data, error } = await database.supabase
      .from('channel_engagement_summary')
      .select('*')
      .order('avg_engagement_rate', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Channel engagement analytics error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch channel engagement analytics',
      message: error.message 
    });
  }
});

// Get engagement metrics for a specific channel
app.get('/api/engagement/channel/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const { limit = 20 } = req.query;

    // Get channel summary
    const { data: channelSummary, error: summaryError } = await database.supabase
      .from('channel_engagement_summary')
      .select('*')
      .eq('username', username)
      .single();

    if (summaryError) throw summaryError;

    // Get recent video engagement
    const { data: videoEngagement, error: videoError } = await database.supabase
      .from('video_engagement_metrics')
      .select('*')
      .eq('username', username)
      .order('published_at', { ascending: false })
      .limit(parseInt(limit));

    if (videoError) throw videoError;

    res.json({
      success: true,
      channelSummary,
      recentVideos: videoEngagement || [],
      videoCount: videoEngagement?.length || 0
    });
  } catch (error) {
    console.error('❌ Individual channel engagement error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch channel engagement data',
      message: error.message 
    });
  }
});

// Get top performing videos by engagement
app.get('/api/engagement/top-videos', async (req, res) => {
  try {
    const { limit = 20, channel } = req.query;

    let query = database.supabase
      .from('top_engagement_videos')
      .select('*');

    if (channel) {
      query = query.eq('username', channel);
    }

    const { data, error } = await query
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Top videos engagement error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch top engagement videos',
      message: error.message 
    });
  }
});

// Get engagement comparison between channels
app.get('/api/engagement/compare', async (req, res) => {
  try {
    const { channels } = req.query; // comma-separated usernames
    
    if (!channels) {
      return res.status(400).json({ error: 'channels parameter required (comma-separated usernames)' });
    }

    const channelList = channels.split(',').map(c => c.trim());

    const { data, error } = await database.supabase
      .from('channel_engagement_summary')
      .select('*')
      .in('username', channelList)
      .order('avg_engagement_rate', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      comparison: data || [],
      requested: channelList,
      found: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Engagement comparison error:', error);
    res.status(500).json({ 
      error: 'Failed to compare channel engagement',
      message: error.message 
    });
  }
});

// DAILY PERFORMANCE ANALYSIS ROUTES

// Get daily video performance with comprehensive KPIs
app.get('/api/daily/performance', async (req, res) => {
  try {
    const { days = 7, limit = 50, date, creator } = req.query;

    let query = database.supabase
      .from('daily_video_performance')
      .select('*');

    // Filter by specific date
    if (date) {
      query = query.eq('video_date', date);
    } else {
      // Get last N days
      const daysAgo = new Date();
      daysAgo.setDate(daysAgo.getDate() - parseInt(days));
      query = query.gte('video_date', daysAgo.toISOString().split('T')[0]);
    }

    // Filter by specific creator
    if (creator) {
      query = query.eq('username', creator);
    }

    const { data, error } = await query
      .order('video_date', { ascending: false })
      .order('engagement_rate', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
      filters: { days: parseInt(days), date, creator }
    });
  } catch (error) {
    console.error('❌ Daily performance error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch daily performance data',
      message: error.message 
    });
  }
});

// Get daily performance summary (overview by date)
app.get('/api/daily/summary', async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    const { data, error } = await database.supabase
      .from('daily_performance_summary')
      .select('*')
      .gte('video_date', daysAgo.toISOString().split('T')[0])
      .order('video_date', { ascending: false });

    if (error) throw error;

    res.json({
      success: true,
      data: data || [],
      count: data?.length || 0,
      period: `Last ${days} days`
    });
  } catch (error) {
    console.error('❌ Daily summary error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch daily summary',
      message: error.message 
    });
  }
});

// Get top performers for a specific date
app.get('/api/daily/top/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const { limit = 10 } = req.query;

    const { data, error } = await database.supabase
      .from('daily_video_performance')
      .select('*')
      .eq('video_date', date)
      .order('engagement_rate', { ascending: false })
      .limit(parseInt(limit));

    if (error) throw error;

    res.json({
      success: true,
      date,
      topPerformers: data || [],
      count: data?.length || 0
    });
  } catch (error) {
    console.error('❌ Daily top performers error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch daily top performers',
      message: error.message 
    });
  }
});

// Get creator performance comparison for a date range
app.get('/api/daily/creators', async (req, res) => {
  try {
    const { days = 7, metric = 'engagement_rate' } = req.query;

    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - parseInt(days));

    const { data, error } = await database.supabase
      .from('daily_video_performance')
      .select('*')
      .gte('video_date', daysAgo.toISOString().split('T')[0])
      .order('video_date', { ascending: false })
      .order(metric, { ascending: false });

    if (error) throw error;

    // Group by creator for summary
    const creatorStats = {};
    data?.forEach(video => {
      if (!creatorStats[video.username]) {
        creatorStats[video.username] = {
          username: video.username,
          channel_title: video.channel_title,
          channel_tier: video.channel_tier,
          videos_posted: 0,
          total_views: 0,
          total_likes: 0,
          total_comments: 0,
          avg_engagement_rate: 0,
          best_video: null,
          engagement_rates: []
        };
      }

      const creator = creatorStats[video.username];
      creator.videos_posted++;
      creator.total_views += video.view_count;
      creator.total_likes += video.like_count;
      creator.total_comments += video.comment_count;
      creator.engagement_rates.push(video.engagement_rate);

      if (!creator.best_video || video.engagement_rate > creator.best_video.engagement_rate) {
        creator.best_video = {
          title: video.title,
          engagement_rate: video.engagement_rate,
          view_count: video.view_count,
          video_date: video.video_date
        };
      }
    });

    // Calculate averages
    Object.values(creatorStats).forEach(creator => {
      creator.avg_engagement_rate = creator.engagement_rates.length > 0
        ? Math.round((creator.engagement_rates.reduce((a, b) => a + b, 0) / creator.engagement_rates.length) * 100) / 100
        : 0;
      delete creator.engagement_rates; // Remove temp array
    });

    const sortedCreators = Object.values(creatorStats)
      .sort((a, b) => b.avg_engagement_rate - a.avg_engagement_rate);

    res.json({
      success: true,
      period: `Last ${days} days`,
      creatorSummary: sortedCreators,
      totalCreators: sortedCreators.length
    });
  } catch (error) {
    console.error('❌ Daily creators analysis error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch creator performance analysis',
      message: error.message 
    });
  }
});

// Debug endpoint to check comment scraping status
app.get('/api/debug/comment-status/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    // Get influencer info
    const { data: influencer, error: influencerError } = await database.supabase
      .from('influencers')
      .select('*')
      .eq('username', username)
      .single();
    
    if (influencerError) {
      return res.status(404).json({ error: 'Influencer not found' });
    }
    
    // Get sample videos for this influencer
    const { data: sampleVideos, error: videoError } = await database.supabase
      .from('videos')
      .select('video_id, title, comment_count')
      .eq('channel_id', influencer.channel_id)
      .order('published_at', { ascending: false })
      .limit(10);
    
    if (videoError) throw videoError;
    
    // Check comment status for these videos
    const videoIds = sampleVideos.map(v => v.video_id);
    const { data: commentStatus, error: statusError } = await database.supabase
      .from('video_comment_status')
      .select('*')
      .in('video_id', videoIds);
    
    // Count actual comments for these videos
    const { count: actualComments, error: commentError } = await database.supabase
      .from('comments')
      .select('*', { count: 'exact', head: true })
      .in('video_id', videoIds);
    
    res.json({
      influencer,
      sampleVideos,
      commentStatus: commentStatus || [],
      actualComments: actualComments || 0,
      totalVideos: sampleVideos.length
    });
    
  } catch (error) {
    console.error('❌ Debug error:', error);
    res.status(500).json({ 
      error: 'Failed to get debug info',
      message: error.message 
    });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`YouTube Analytics Backend running on port ${port}`);
  console.log(`API Key configured: ${!!process.env.YOUTUBE_API_KEY}`);
});
