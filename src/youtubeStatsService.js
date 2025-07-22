const axios = require('axios');
const { DEFAULT_CONFIG } = require('../config/defaults');

class YouTubeStatsService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://www.googleapis.com/youtube/v3';
  }

  // Get channel statistics (subscribers, total views, video count) - 1 API unit
  async getChannelStats(channelId) {
    try {
      const response = await axios.get(`${this.baseURL}/channels`, {
        params: {
          part: 'statistics',
          id: channelId,
          key: this.apiKey
        }
      });

      if (response.data.items && response.data.items.length > 0) {
        const stats = response.data.items[0].statistics;
        return {
          subscriberCount: parseInt(stats.subscriberCount) || 0,
          totalViews: parseInt(stats.viewCount) || 0,
          totalVideos: parseInt(stats.videoCount) || 0
        };
      }

      throw new Error(`Channel stats not found: ${channelId}`);
    } catch (error) {
      console.error(`Error getting channel stats for ${channelId}:`, error.message);
      throw error;
    }
  }

  // Get video statistics (duration, views, comments) - 1 unit per 50 videos
  async getVideoStats(videoIds) {
    if (!videoIds || videoIds.length === 0) return [];

    try {
      // YouTube API allows up to 50 video IDs per request
      const chunks = this.chunkArray(videoIds, DEFAULT_CONFIG.maxVideosPerQuery);
      const allStats = [];

      for (const chunk of chunks) {
        const response = await axios.get(`${this.baseURL}/videos`, {
          params: {
            part: 'statistics,contentDetails',
            id: chunk.join(','),
            key: this.apiKey
          }
        });

        if (response.data.items) {
          response.data.items.forEach(item => {
            allStats.push({
              videoId: item.id,
              duration: item.contentDetails.duration,
              viewCount: parseInt(item.statistics.viewCount) || 0,
              commentCount: parseInt(item.statistics.commentCount) || 0,
              likeCount: parseInt(item.statistics.likeCount) || 0
            });
          });
        }
      }

      return allStats;
    } catch (error) {
      console.error(`Error getting video stats:`, error.message);
      throw error;
    }
  }

  // Get videos and stats for an influencer (smart way)
  async indexInfluencerWithStats(usernameOrHandle, processingStatus = null) {
    try {
      // Step 1: Get basic channel info (costs 1 API unit)
      const channelData = await this.getChannelData(usernameOrHandle);
      
      // Step 2: Get subscriber count and view count (costs 1 API unit)
      const channelStats = await this.getChannelStats(channelData.channelId);
      
      // Step 3: Decide how to get videos
      let videos;
      let fetchCost;
      let fetchType;
      
      // Check if this is a new influencer or existing one
      const isNewInfluencer = !processingStatus || processingStatus.status === 'never_processed';
      
      if (isNewInfluencer) {
        // NEW INFLUENCER: Get all their videos
        fetchType = 'bulk';
        videos = await this.getAllVideosFromPlaylist(channelData.uploadsPlaylistId);
        fetchCost = Math.ceil(videos.length / 50); // 50 videos per API call
      } else {
        // EXISTING INFLUENCER: Only get new videos
        fetchType = 'incremental';
        videos = await this.getNewVideosFromPlaylist(
          channelData.uploadsPlaylistId, 
          processingStatus.existingVideoIds
        );
        fetchCost = Math.ceil(videos.length / 50) + 1; // +1 for checking existing videos
      }
      
      // Step 4: Get detailed stats for each video (likes, views, comments)
      const videoIds = [];
      for (let i = 0; i < videos.length; i++) {
        videoIds.push(videos[i].videoId);
      }
      
      const videoStats = await this.getVideoStats(videoIds);
      
      // Step 5: Combine video info with stats
      const videosWithStats = [];
      for (let i = 0; i < videos.length; i++) {
        const video = videos[i];
        
        // Find the stats for this video
        let stats = null;
        for (let j = 0; j < videoStats.length; j++) {
          if (videoStats[j].videoId === video.videoId) {
            stats = videoStats[j];
            break;
          }
        }
        
        // Create complete video object
        const completeVideo = {
          videoId: video.videoId,
          title: video.title,
          publishedAt: video.publishedAt,
          description: video.description,
          thumbnails: video.thumbnails,
          duration: stats ? stats.duration : null,
          viewCount: stats ? stats.viewCount : 0,
          commentCount: stats ? stats.commentCount : 0,
          likeCount: stats ? stats.likeCount : 0
        };
        
        videosWithStats.push(completeVideo);
      }

      // Step 6: Sort videos by date (newest first)
      videosWithStats.sort(function(a, b) {
        const dateA = new Date(a.publishedAt);
        const dateB = new Date(b.publishedAt);
        return dateB - dateA; // newest first
      });
      
      // Step 7: Calculate total API cost
      const statsCost = Math.ceil(videoIds.length / 50);
      const totalCost = 2 + fetchCost + statsCost; // 2 for channel info
      
      // Return everything
      return {
        channelId: channelData.channelId,
        channelTitle: channelData.channelTitle,
        username: channelData.username,
        uploadsPlaylistId: channelData.uploadsPlaylistId,
        subscriberCount: channelStats.subscriberCount,
        totalViews: channelStats.totalViews,
        totalVideos: channelStats.totalVideos,
        videos: videosWithStats,
        apiCost: totalCost,
        fetchType: fetchType,
        existingVideos: processingStatus ? processingStatus.indexedVideos : 0
      };
    } catch (error) {
      throw error;
    }
  }

  // Channel data fetching methods
  async getChannelData(usernameOrHandle) {
    try {
      // First try with forUsername (legacy usernames)
      let response = await axios.get(`${this.baseURL}/channels`, {
        params: {
          part: 'id,snippet,contentDetails',
          forUsername: usernameOrHandle,
          key: this.apiKey
        }
      });

      if (response.data.items && response.data.items.length > 0) {
        const channel = response.data.items[0];
        return {
          channelId: channel.id,
          channelTitle: channel.snippet.title,
          username: usernameOrHandle,
          uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads
        };
      }

      // If not found, try searching for the channel
      const searchResponse = await axios.get(`${this.baseURL}/search`, {
        params: {
          part: 'snippet',
          type: 'channel',
          q: usernameOrHandle,
          maxResults: 1,
          key: this.apiKey
        }
      });

      if (searchResponse.data.items && searchResponse.data.items.length > 0) {
        const channelId = searchResponse.data.items[0].id.channelId;
        
        const detailsResponse = await axios.get(`${this.baseURL}/channels`, {
          params: {
            part: 'id,snippet,contentDetails',
            id: channelId,
            key: this.apiKey
          }
        });

        if (detailsResponse.data.items && detailsResponse.data.items.length > 0) {
          const channel = detailsResponse.data.items[0];
          return {
            channelId: channel.id,
            channelTitle: channel.snippet.title,
            username: usernameOrHandle,
            uploadsPlaylistId: channel.contentDetails.relatedPlaylists.uploads
          };
        }
      }

      throw new Error(`Channel not found: ${usernameOrHandle}`);
    } catch (error) {
      console.error(`Error getting channel data for ${usernameOrHandle}:`, error.message);
      throw error;
    }
  }

  // BULK: Get all videos using playlistItems.list (for new influencers)
  async getAllVideosFromPlaylist(uploadsPlaylistId) {
    const videos = [];
    let nextPageToken = null;

    try {
      do {
        const response = await axios.get(`${this.baseURL}/playlistItems`, {
          params: {
            part: 'snippet',
            playlistId: uploadsPlaylistId,
            maxResults: DEFAULT_CONFIG.maxVideosPerQuery,
            pageToken: nextPageToken,
            key: this.apiKey
          }
        });

        if (response.data.items) {
          response.data.items.forEach(item => {
            videos.push({
              videoId: item.snippet.resourceId.videoId,
              title: item.snippet.title,
              publishedAt: item.snippet.publishedAt,
              description: item.snippet.description,
              thumbnails: item.snippet.thumbnails
            });
          });
        }

        nextPageToken = response.data.nextPageToken;
      } while (nextPageToken);

      return videos;
    } catch (error) {
      console.error(`Error fetching videos from playlist ${uploadsPlaylistId}:`, error.message);
      throw error;
    }
  }

  // INCREMENTAL: Smart page-by-page fetching (for existing influencers)
  async getNewVideosFromPlaylist(uploadsPlaylistId, existingVideoIds = []) {
    const videos = [];
    let nextPageToken = null;
    let apiCallCount = 0;
    const stopThreshold = 0.8; // Stop when 80% of page is existing videos

    try {
      do {
        const response = await axios.get(`${this.baseURL}/playlistItems`, {
          params: {
            part: 'snippet',
            playlistId: uploadsPlaylistId,
            maxResults: DEFAULT_CONFIG.maxVideosPerQuery,
            pageToken: nextPageToken,
            key: this.apiKey
          }
        });

        apiCallCount++;
        const pageVideos = [];
        let existingInPage = 0;

        if (response.data.items) {
          response.data.items.forEach(item => {
            const videoId = item.snippet.resourceId.videoId;
            const video = {
              videoId: videoId,
              title: item.snippet.title,
              publishedAt: item.snippet.publishedAt,
              description: item.snippet.description,
              thumbnails: item.snippet.thumbnails
            };

            pageVideos.push(video);

            // Check if this video already exists
            if (existingVideoIds.includes(videoId)) {
              existingInPage++;
            }
          });
        }

        // Add all videos from this page
        videos.push(...pageVideos);

        // Smart stopping logic
        const existingRatio = pageVideos.length > 0 ? existingInPage / pageVideos.length : 0;

        // IMPROVED: Stop if we hit mostly existing videos (lower threshold for efficiency)
        if (existingRatio >= 0.6 && apiCallCount >= 1) { // 60% overlap, even on first page
          break;
        }

        // Also stop if we have a lot of videos and some overlap
        if (videos.length >= 100 && existingRatio > 0.3) {
          break;
        }

        nextPageToken = response.data.nextPageToken;

        // Safety limit: don't fetch more than 20 pages incrementally
        if (apiCallCount >= 20) {
          break;
        }

      } while (nextPageToken);

      // Filter out existing videos from the final result
      const newVideos = videos.filter(video => !existingVideoIds.includes(video.videoId));
      return newVideos;

    } catch (error) {
      console.error(`Error in incremental fetch from playlist ${uploadsPlaylistId}:`, error.message);
      throw error;
    }
  }

  // Helper: Split array into chunks
  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = YouTubeStatsService;
