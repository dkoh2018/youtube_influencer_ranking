const DEFAULT_CONFIG = {
  // === PROCESSING LIMITS ===
  maxInfluencers: 'all',       // Process all influencers (or number)
  videosPerInfluencer: 20,     // Most recent videos per influencer
  
  // === COMMENT CONFIGURATION ===
  commentsPerVideo: 100,       // Comments per video
  includeComments: true,       // Comment processing
  maxCommentsPerCall: 100,     // Comments per request
  
  // === INDEXING CONFIGURATION ===
  maxVideosPerQuery: 50,       // Videos per query
  maxDatabaseQueryLimit: 10000, // High limit for database queries (prolific creators)
  rateLimitDelay: 500,         // API delay (ms)
};

module.exports = {
  DEFAULT_CONFIG
};
