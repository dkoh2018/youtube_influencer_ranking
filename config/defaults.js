const DEFAULT_CONFIG = {
  // === PROCESSING LIMITS ===
  maxInfluencers: 'all',       // Process all influencers (or number)
  videosPerInfluencer: 50,     // Most recent videos per influencer
  
  // === COMMENT CONFIGURATION ===
  commentsPerVideo: 200,       // Comments per video
  includeComments: true,       // Comment processing
  maxCommentsPerCall: 100,     // Comments per request
  
  // === CONCURRENCY CONFIGURATION (NEW!) ===
  concurrentRequests: 3,       // Process 3 videos at the same time
  batchSize: 5,               // Group videos into batches of 5
  rateLimitDelay: 300,        // Wait 300ms between batches (reduced from 500ms)
  
  // === INDEXING CONFIGURATION ===
  maxVideosPerQuery: 50,       // Videos per query
  maxDatabaseQueryLimit: 10000, // High limit for database queries (prolific creators)
};

module.exports = {
  DEFAULT_CONFIG
};
