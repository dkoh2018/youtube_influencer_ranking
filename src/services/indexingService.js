const YouTubeStatsService = require('./youtubeStatsService');
const Database = require('./database');
const { DEFAULT_CONFIG } = require('../config/defaults');

class IndexingService {
  constructor(apiKey) {
    this.youtube = new YouTubeStatsService(apiKey);
    this.db = new Database();
  }

  // Process all configured influencers with full analytics
  async indexAllInfluencers(influencerList) {
    const results = {
      success: [],
      errors: [],
      totalCost: 0
    };

    for (const username of influencerList) {
      try {
        // Get channel data first
        const channelData = await this.youtube.getChannelData(username);
        
        // Check what we already have and if we need to process
        const status = await this.db.getProcessingStatus(channelData.channelId);
        
        if (!status.needsProcessing) {
          console.log(`${username} up-to-date (${status.indexedVideos} videos), skipping`);
          continue;
        }

        console.log(`Processing ${username} (${status.status})...`);
        if (status.existingVideoIds.length > 0) {
          console.log(`   Found ${status.existingVideoIds.length} existing videos`);
        }

        // Process influencer with smart fetching strategy
        const indexData = await this.youtube.indexInfluencerWithStats(username, status);
        
        // Store in database (videos are already filtered by smart fetching!)
        await this.db.storeInfluencer(indexData);
        if (indexData.videos.length > 0) {
          await this.db.storeVideos(indexData.channelId, indexData.videos);
          console.log(`   Stored ${indexData.videos.length} videos`);
        } else {
          console.log(`   No new videos found`);
        }
        
        const cost = indexData.apiCost || 1;
        results.totalCost += cost;
        
        results.success.push({
          username,
          channelId: indexData.channelId,
          channelTitle: indexData.channelTitle,
          subscriberCount: indexData.subscriberCount,
          totalVideos: indexData.totalVideos,
          apiCost: cost
        });
        
        // Rate limiting
        await this.sleep(DEFAULT_CONFIG.rateLimitDelay * 2); // Slightly longer delay for video indexing
        
      } catch (error) {
        console.error(`${username}: ${error.message}`);
        results.errors.push({
          username,
          error: error.message
        });
      }
    }
    
    return results;
  }

  // Index a single influencer
  async indexSingleInfluencer(username, force = false) {
    try {
      const channelData = await this.youtube.getChannelData(username);
      
      if (!force) {
        const needsIndexing = await this.db.needsReindexing(channelData.channelId, 24);
        if (!needsIndexing) {
          return { message: 'Already indexed recently', skipped: true };
        }
      }

      const indexData = await this.youtube.indexInfluencerWithStats(username);
      await this.db.storeInfluencer(indexData);
      await this.db.storeVideos(indexData.channelId, indexData.videos);
      
      const cost = indexData.apiCost || 1;
      
      return {
        username,
        channelId: indexData.channelId,
        totalVideos: indexData.totalVideos,
        apiCost: cost,
        indexed: true
      };
    } catch (error) {
      throw error;
    }
  }

  // Get indexing status
  async getIndexingStatus() {
    const influencers = await this.db.getInfluencers();
    const totalVideos = influencers.reduce((sum, inf) => sum + (inf.total_videos || 0), 0);
    
    return {
      totalInfluencers: influencers.length,
      totalVideos,
      influencers: influencers.map(inf => ({
        username: inf.username,
        channelTitle: inf.channel_title,
        totalVideos: inf.total_videos,
        lastIndexed: inf.last_indexed,
        needsReindexing: this.isStale(inf.last_indexed, 24)
      }))
    };
  }

  // Helper: Check if data is stale
  isStale(lastIndexed, maxAgeHours) {
    if (!lastIndexed) return true;
    const age = (new Date() - new Date(lastIndexed)) / (1000 * 60 * 60);
    return age > maxAgeHours;
  }

  // Helper: Sleep function
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = IndexingService;
