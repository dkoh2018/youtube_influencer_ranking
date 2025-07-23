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
    const videosToScanForComments = options.videosToScanForComments || DEFAULT_CONFIG.videosToScanForComments;
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
          videosToScanForComments
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
        const statsUpdated = videoResult.statsUpdated || 0;
        
        let statusMessage;
        if (videoResult.newVideos > 0 || statsUpdated > 0) {
          const parts = [];
          if (videoResult.newVideos > 0) parts.push(`${videoResult.newVideos} new videos`);
          if (statsUpdated > 0) parts.push(`${statsUpdated} stats updated`);
          if (commentsFound > 0) parts.push(`${commentsFound} comments`);
          statusMessage = `UPDATED - ${parts.join(', ')} (${totalCost} units)`;
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
          statsUpdated: videoResult.statsUpdated || 0,
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
      
      // STEP 1: Always refresh stats for ALL existing videos
      const statsUpdateResult = await this.refreshExistingVideoStats(channelData.channelId, channelData.channelTitle, null);
      
      // STEP 2: Process new videos if needed
      let newVideosCost = 0;
      let newVideosCount = 0;
      
      if (status.needsProcessing) {
        // Process with smart indexing for new videos
        const indexData = await this.videoIndexing.youtube.indexInfluencerWithStats(username, status);
        
        // Store results
        await this.db.storeInfluencer(indexData);
        if (indexData.videos.length > 0) {
          await this.db.storeVideos(indexData.channelId, indexData.videos);
        }
        
        newVideosCost = indexData.apiCost;
        newVideosCount = indexData.videos.length;
      }

      return {
        channelId: channelData.channelId,
        channelTitle: channelData.channelTitle,
        apiCost: statsUpdateResult.apiCost + newVideosCost,
        newVideos: newVideosCount,
        statsUpdated: statsUpdateResult.videosUpdated
      };

    } catch (error) {
      return { error: error.message };
    }
  }

  // Refresh stats for existing videos (seamlessly integrated)
  async refreshExistingVideoStats(channelId, channelTitle, limit = null) {
    try {
      // Get existing videos to refresh (all videos if limit is null)
      const existingVideos = await this.db.getInfluencerVideos(channelId, limit);
      
      if (existingVideos.length === 0) {
        return { apiCost: 0, videosUpdated: 0 };
      }

      // Get fresh stats from YouTube API
      const videoIds = existingVideos.map(v => v.videoId);
      const freshStats = await this.videoIndexing.youtube.getVideoStats(videoIds);
      
      // Map fresh stats to videos
      const videosWithFreshStats = existingVideos.map(video => {
        const stats = freshStats.find(s => s.videoId === video.videoId);
        return {
          videoId: video.videoId,
          title: video.title,
          publishedAt: video.publishedAt,
          description: video.description,
          thumbnails: video.thumbnails,
          duration: stats?.duration || video.duration,
          viewCount: stats?.viewCount || video.view_count,
          likeCount: stats?.likeCount || video.like_count,
          commentCount: stats?.commentCount || video.comment_count
        };
      });
      
      // Store updated stats (includes historical tracking)
      await this.db.storeVideos(channelId, videosWithFreshStats);
      
      // Calculate API cost (1 unit per 50 videos)
      const apiCost = Math.ceil(videoIds.length / 50);
      
      return { 
        apiCost: apiCost, 
        videosUpdated: existingVideos.length 
      };
      
    } catch (error) {
      console.error(`   ⚠️ Error refreshing stats for ${channelTitle}:`, error.message);
      return { apiCost: 0, videosUpdated: 0 };
    }
  }

  // Select most recent videos for comment processing
  async selectVideosForComments(channelId, maxVideos = DEFAULT_CONFIG.videosToScanForComments) {
    try {
      // Get most recent videos (by published_at)
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
