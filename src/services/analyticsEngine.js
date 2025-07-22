const IndexingService = require('./indexingService');
const CommentService = require('./commentService');
const Database = require('./database');
const { DEFAULT_CONFIG } = require('../config/defaults');

class AnalyticsEngine {
  constructor(apiKey) {
    this.videoIndexing = new IndexingService(apiKey);
    this.commentService = new CommentService(apiKey);
    this.db = new Database();
    this.totalApiCost = 0;
  }

  // MAIN ENGINE: Process influencers with videos + comments
  async processInfluencers(influencerList, options = {}) {
    // Set default values if not provided
    const maxInfluencersConfig = options.maxInfluencers || DEFAULT_CONFIG.maxInfluencers;
    const maxInfluencers = maxInfluencersConfig === 'all' ? influencerList.length : maxInfluencersConfig;
    const videosPerInfluencer = options.videosPerInfluencer || DEFAULT_CONFIG.videosPerInfluencer;
    const commentsPerVideo = options.commentsPerVideo || DEFAULT_CONFIG.commentsPerVideo;
    const includeComments = options.includeComments !== false; // default true

    console.log('Analytics Engine Starting...');
    console.log(`Processing ${Math.min(maxInfluencers, influencerList.length)} influencers`);
    
    const results = {
      videosProcessed: 0,
      commentsProcessed: 0,
      totalApiCost: 0,
      influencers: [],
      errors: []
    };

    // Only process the number of influencers we want
    const influencersToProcess = influencerList.slice(0, maxInfluencers);

    // Process each influencer one by one
    for (let i = 0; i < influencersToProcess.length; i++) {
      const username = influencersToProcess[i];
      
      try {
        process.stdout.write(`Processing ${username}... `);
        
        // STEP 1: Get videos for this influencer
        const videoResult = await this.processInfluencerVideos(username);
        
        // Check if video processing failed
        if (videoResult.error) {
          console.log(`FAILED`);
          results.errors.push({ 
            username: username, 
            type: 'video', 
            error: videoResult.error 
          });
          continue; // Skip to next influencer
        }

        // STEP 2: Find videos to get comments from
        const videosForComments = await this.selectVideosForComments(
          videoResult.channelId, 
          videosPerInfluencer
        );

        // -- SMART INCREMENTAL STEP --
        // Check which videos need additional comments (incremental approach)
        const videosNeedingComments = await this.db.getVideosNeedingMoreComments(
          videosForComments, 
          commentsPerVideo
        );

        // Start with empty comment result
        let commentResult = { 
          comments: [], 
          apiCost: 0 
        };
        
        // STEP 3: Get comments if we want them and have videos needing more comments
        if (includeComments && videosNeedingComments.length > 0) {
          commentResult = await this.processVideoComments(
            videosNeedingComments, 
            commentsPerVideo
          );
        }

        // STEP 4: Calculate totals and show status
        const totalCost = videoResult.apiCost + commentResult.apiCost;
        const commentsFound = commentResult.comments ? commentResult.comments.length : 0;
        
        let statusMessage;
        if (videoResult.newVideos > 0) {
          statusMessage = `UPDATED - ${videoResult.newVideos} videos, ${commentsFound} comments (${totalCost} units)`;
        } else {
          statusMessage = `UP-TO-DATE (${totalCost} units)`;
        }
        
        console.log(statusMessage);

        // Save the results for this influencer
        results.influencers.push({
          username: username,
          channelTitle: videoResult.channelTitle,
          videosApiCost: videoResult.apiCost,
          commentsApiCost: commentResult.apiCost,
          newVideos: videoResult.newVideos || 0,
          commentsIndexed: commentsFound,
          videosProcessedForComments: videosNeedingComments.length,
          videosSkippedForComments: videosForComments.length - videosNeedingComments.length
        });

        // Add to our totals
        results.videosProcessed += videoResult.newVideos || 0;
        results.commentsProcessed += commentsFound;
        results.totalApiCost += totalCost;

      } catch (error) {
        console.log(`ERROR: ${error.message}`);
        results.errors.push({ 
          username: username, 
          type: 'engine', 
          error: error.message 
        });
      }
    }

    this.printEngineResults(results);
    return results;
  }

  // Process videos for an influencer
  async processInfluencerVideos(username) {
    try {
      // Get processing status
      const channelData = await this.videoIndexing.youtube.getChannelData(username);
      const status = await this.db.getProcessingStatus(channelData.channelId);
      
      if (!status.needsProcessing) {
        return { 
          channelId: channelData.channelId,
          channelTitle: channelData.channelTitle,
          apiCost: 0, 
          newVideos: 0 
        };
      }

      // Process with smart indexing
      const indexData = await this.videoIndexing.youtube.indexInfluencerWithStats(username, status);
      
      // Store results
      await this.db.storeInfluencer(indexData);
      if (indexData.videos.length > 0) {
        await this.db.storeVideos(indexData.channelId, indexData.videos);
      }

      return {
        channelId: indexData.channelId,
        channelTitle: indexData.channelTitle,
        apiCost: indexData.apiCost,
        newVideos: indexData.videos.length
      };

    } catch (error) {
      return { error: error.message };
    }
  }

  // Select top 10 most recent videos for comment processing
  async selectVideosForComments(channelId, maxVideos = DEFAULT_CONFIG.videosPerInfluencer) {
    try {
      // Get 10 most recent videos (by published_at)
      const recentVideos = await this.db.getInfluencerVideos(channelId, maxVideos);
      
      return recentVideos;

    } catch (error) {
      console.error(`   Error selecting videos:`, error.message);
      return [];
    }
  }

  // Process comments for selected videos
  async processVideoComments(videos, maxCommentsPerVideo = DEFAULT_CONFIG.commentsPerVideo) {
    try {
      const result = await this.commentService.getCommentsForVideos(videos, maxCommentsPerVideo, this.db);
      
      // Store comments in database
      if (result.comments.length > 0) {
        await this.db.storeComments(result.comments);
      }

      return result;

    } catch (error) {
      return { comments: [], apiCost: 0 };
    }
  }

  // Print comprehensive results with better formatting
  printEngineResults(results) {
    console.log('\n' + '='.repeat(70));
    console.log('ANALYTICS ENGINE SUMMARY');
    console.log('='.repeat(70));
    
    // Overall stats
    console.log(`Total API Cost: ${results.totalApiCost} units`);
    console.log(`Videos Processed: ${results.videosProcessed}`);
    console.log(`Comments Indexed: ${results.commentsProcessed}`);
    console.log(`Successful: ${results.influencers.length} | Errors: ${results.errors.length}`);
    
    if (results.influencers.length > 0) {
      console.log('\nDETAILED BREAKDOWN:');
      console.log('-'.repeat(70));
      
      // Header
      console.log('INFLUENCER'.padEnd(20) + 
                  'VIDEOS'.padEnd(12) + 
                  'COMMENTS'.padEnd(12) + 
                  'API COST'.padEnd(10) + 
                  'STATUS');
      console.log('-'.repeat(70));
      
      results.influencers.forEach(inf => {
        const totalCost = inf.videosApiCost + inf.commentsApiCost;
        const videoStatus = inf.newVideos > 0 ? `${inf.newVideos} new` : 'up-to-date';
        const commentStatus = inf.commentsIndexed > 0 ? `${inf.commentsIndexed} added` : 'none';
        
        console.log(
          inf.username.padEnd(20) +
          videoStatus.padEnd(12) +
          commentStatus.padEnd(12) +
          `${totalCost} units`.padEnd(10) +
          (inf.newVideos > 0 || inf.commentsIndexed > 0 ? 'Updated' : 'Skipped')
        );
      });
    }

    if (results.errors.length > 0) {
      console.log('\nERRORS:');
      console.log('-'.repeat(70));
      results.errors.forEach(err => {
        console.log(`ERROR ${err.username}: ${err.error}`);
      });
    }
    
    console.log('\n' + '='.repeat(70));
  }
}

module.exports = AnalyticsEngine;
