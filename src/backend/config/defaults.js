const DEFAULT_CONFIG = {
  // ============================================================================
  // ANALYTICS ENGINE (analyticsEngine.js) + MAIN INDEX (index.js)
  // ============================================================================
  maxInfluencers: 'all',        // How many influencers to process from the list. Set to 'all' or a number.
  videosPerInfluencer: 10,      // How many videos to actually process and store per influencer
  commentsPerVideo: 400,        // Target number of comments to fetch per video
  includeComments: true,        // Master switch to enable/disable comment processing.
  
  // ============================================================================
  // ANALYTICS ENGINE (analyticsEngine.js) + COMMENT PROCESSOR (comment-processor.js)
  // ============================================================================
  videosToScanForComments: 100, // How many recent videos to scan through when selecting videos for comment analysis
  
  // ============================================================================
  // COMMENT SERVICE (commentService.js)
  // ============================================================================
  maxCommentsPerCall: 200,      // How many comments to fetch in a single YouTube API request.
  
  // ============================================================================
  // COMMENT SERVICE (commentService.js) + YOUTUBE API RATE LIMITING
  // ============================================================================
  concurrentRequests: 3,        // How many videos to process for comments in parallel.
  batchSize: 5,                 // How many videos to group into a single batch for processing.
  rateLimitDelay: 300,          // Milliseconds to wait between batches to avoid hitting API rate limits.
  
  // ============================================================================
  // DATABASE (database.js) + YOUTUBE STATS SERVICE (youtubeStatsService.js)
  // ============================================================================
  maxVideosPerQuery: 50,        // How many videos to request in a single YouTube API call (for fetching video details).
  maxDatabaseQueryLimit: 10000, // Maximum number of comments to load from database for analysis in comment-processor.

  // ============================================================================
  // SENTIMENT ANALYZER (sentiment-analyzer.js)
  // ============================================================================
  sentimentForceOverwrite: false, // Whether to re-analyze videos that already have sentiment data.
  sentimentBatchSize: 1,         // How many videos to process for sentiment analysis concurrently.
};

module.exports = {
  DEFAULT_CONFIG
};