const axios = require('axios');
const { DEFAULT_CONFIG } = require('../config/defaults');

// Custom error for quota exceeded
class QuotaExceededError extends Error {
  constructor(message) {
    super(message);
    this.name = 'QuotaExceededError';
  }
}

class CommentService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://www.googleapis.com/youtube/v3';
  }

  // Get top comments for a video (ordered by relevance/likes)
  async getVideoComments(videoId, maxResults = DEFAULT_CONFIG.commentsPerVideo) {
    const comments = [];
    let nextPageToken = null;
    let fetched = 0;

    try {
      do {
        const remainingToFetch = Math.min(DEFAULT_CONFIG.maxCommentsPerCall, maxResults - fetched); // API limit is 100 per page
        
        const response = await axios.get(`${this.baseURL}/commentThreads`, {
          params: {
            part: 'snippet',
            videoId: videoId,
            order: 'relevance', // Most liked/engaging comments first
            maxResults: remainingToFetch,
            pageToken: nextPageToken,
            key: this.apiKey
          }
        });

        if (response.data.items) {
          response.data.items.forEach(item => {
            const snippet = item.snippet.topLevelComment.snippet;
            comments.push({
              commentId: item.snippet.topLevelComment.id,
              videoId: videoId,
              authorName: snippet.authorDisplayName,
              authorChannelId: snippet.authorChannelId?.value || null,
              textContent: snippet.textDisplay,
              likeCount: snippet.likeCount || 0,
              replyCount: item.snippet.totalReplyCount || 0,
              publishedAt: snippet.publishedAt,
              updatedAt: snippet.updatedAt
            });
          });

          fetched += response.data.items.length;
        }

        nextPageToken = response.data.nextPageToken;

        // Stop if we have enough comments or no more pages
        if (fetched >= maxResults || !nextPageToken) {
          break;
        }

      } while (nextPageToken && fetched < maxResults);

      return comments;

    } catch (error) {
      // Handle case where comments are disabled or quota exceeded
      if (error.response?.status === 403) {
        // Check if it's a quota error specifically
        if (error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
          throw new QuotaExceededError('YouTube API quota exceeded.');
        }
        // Otherwise, comments are just disabled for this video
        return [];
      }
      
      throw error;
    }
  }

  // Get comments for multiple videos (batch processing)
  async getCommentsForVideos(videos, maxCommentsPerVideo = DEFAULT_CONFIG.commentsPerVideo) {
    const allComments = [];
    let apiCallCount = 0;

    for (const video of videos) {
      try {
        const comments = await this.getVideoComments(video.videoId, maxCommentsPerVideo);
        allComments.push(...comments);
        
        // Calculate API cost (1 unit per 100 comments, rounded up)
        apiCallCount += Math.ceil(comments.length / DEFAULT_CONFIG.maxCommentsPerCall);
        
        // Rate limiting
        await this.sleep(DEFAULT_CONFIG.rateLimitDelay);
        
      } catch (error) {
        console.error(`   Failed to get comments for video: ${video.title}`);
        // Continue with other videos
      }
    }

    return {
      comments: allComments,
      apiCost: apiCallCount,
      videosProcessed: videos.length
    };
  }

  // Helper: Sleep function for rate limiting
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CommentService;
