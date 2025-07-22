require('dotenv').config();
const express = require('express');
const cors = require('cors');
const IndexingService = require('./indexingService');
const AnalyticsEngine = require('./analyticsEngine');
const Database = require('./database');
const { INFLUENCERS, getAllInfluencers } = require('../config/influencers');
const { DEFAULT_CONFIG } = require('../config/defaults');

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

app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`YouTube Analytics Backend running on port ${port}`);
  console.log(`API Key configured: ${!!process.env.YOUTUBE_API_KEY}`);
});
