/**
 * YouTube Analytics Engine Controller
 * Orchestrates video indexing + comment processing with smart incremental updates
 * Run with: node process-analytics.js
 */

require('dotenv').config();
const AnalyticsEngine = require('./src/services/analyticsEngine');
const { INFLUENCERS } = require('./src/config/influencers');
const { DEFAULT_CONFIG } = require('./src/config/defaults');

async function runAnalyticsEngine() {
  console.log('\n' + '='.repeat(60));
  console.log('🎥 YOUTUBE ANALYTICS ENGINE');
  console.log('='.repeat(60));
  console.log(`Available influencers: ${INFLUENCERS.join(', ')}\n`);
  
  try {
    const engine = new AnalyticsEngine(process.env.YOUTUBE_API_KEY);
    
    // Use default configuration with smart incremental processing
    const options = {
      maxInfluencers: DEFAULT_CONFIG.maxInfluencers,
      videosPerInfluencer: DEFAULT_CONFIG.videosPerInfluencer,
      commentsPerVideo: DEFAULT_CONFIG.commentsPerVideo,
      includeComments: DEFAULT_CONFIG.includeComments
    };

    console.log('🚀 Starting Full Analysis (Videos + Comments)');
    console.log('\n📊 Engine Configuration:');
    console.log(`   • Max influencers: ${options.maxInfluencers}`);
    console.log(`   • Videos per influencer: ${options.videosPerInfluencer}`);
    console.log(`   • Comments per video: ${options.commentsPerVideo}`);
    const totalInfluencers = options.maxInfluencers === 'all' ? INFLUENCERS.length : options.maxInfluencers;
    console.log(`   • Smart incremental processing: Only fetch what's needed`);
    
    const startTime = Date.now();
    
    // Run the engine with smart incremental processing
    const results = await engine.processInfluencers(INFLUENCERS, options);
    
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log(`\n⏱️  Analytics processing time: ${processingTime}s`);
    console.log('✅ Analytics engine completed successfully!');
    
    // Auto-run comment processor to update sentiment analysis dataset
    console.log('\n' + '='.repeat(60));
    console.log('🤖 AUTO-UPDATING SENTIMENT DATASET');
    console.log('='.repeat(60));
    
    try {
      const { testSentimentAnalysis } = require('./src/ai/sentiment/comment-processor');
      await testSentimentAnalysis();
      console.log('✅ Sentiment dataset updated successfully!');
    } catch (commentError) {
      console.error('⚠️  Comment processor failed (continuing anyway):', commentError.message);
    }
    
  } catch (error) {
    if (error.name === 'QuotaExceededError') {
      console.error('\n🚫 STOPPING: YouTube API quota has been exceeded. Please try again tomorrow.');
    } else {
      console.error('💥 Engine failed:', error.message);
      console.log('\n🔧 Ensure:');
      console.log('1. Server is running: npm run dev');
      console.log('2. Database schema is up to date');
      console.log('3. YouTube API key is valid');
    }
  }
}

// Execute if run directly
if (require.main === module) {
  runAnalyticsEngine();
}

module.exports = { runAnalyticsEngine };
