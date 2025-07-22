/**
 * Analytics Engine Controller
 * Orchestrates video indexing + comment processing
 * Run with: node process-analytics.js
 */

require('dotenv').config();
const AnalyticsEngine = require('./src/analyticsEngine');
const { INFLUENCERS } = require('./config/influencers');
const { DEFAULT_CONFIG } = require('./config/defaults');

async function runAnalyticsEngine() {
  console.log('YouTube Analytics Engine');
  console.log(`Available influencers: ${INFLUENCERS.join(', ')}`);
  
  try {
    const engine = new AnalyticsEngine(process.env.YOUTUBE_API_KEY);
    
    // Use default configuration (can be overridden here if needed)
    const options = {
      maxInfluencers: DEFAULT_CONFIG.maxInfluencers, // 'all' = process all 9 influencers
      videosPerInfluencer: DEFAULT_CONFIG.videosPerInfluencer, // 20 recent videos each
      commentsPerVideo: DEFAULT_CONFIG.commentsPerVideo, // 100 comments per video
      includeComments: DEFAULT_CONFIG.includeComments
    };

    console.log('\nEngine Configuration:');
    console.log(`   • Max influencers: ${options.maxInfluencers}`);
    console.log(`   • Videos per influencer: ${options.videosPerInfluencer}`);
    console.log(`   • Comments per video: ${options.commentsPerVideo}`);
    console.log(`   • Expected total comments: ~${options.maxInfluencers * options.videosPerInfluencer * options.commentsPerVideo}`);
    
    const startTime = Date.now();
    
    // Run the engine
    const results = await engine.processInfluencers(INFLUENCERS, options);
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\nTotal processing time: ${processingTime}s`);
    console.log('Analytics engine completed successfully!');
    
  } catch (error) {
    console.error('Engine failed:', error.message);
    console.log('\nEnsure:');
    console.log('1. Server is running: npm run dev');
    console.log('2. Database schema is up to date');
    console.log('3. YouTube API key is valid');
  }
}

// Execute if run directly
if (require.main === module) {
  runAnalyticsEngine();
}

module.exports = { runAnalyticsEngine };
