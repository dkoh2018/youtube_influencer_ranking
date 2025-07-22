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

      // Determine if video is fully scraped (hit end of available comments)
      const isFullyScraped = !nextPageToken || fetched < maxResults;
      
      return {
        comments,
        isFullyScraped,
        totalFound: fetched
      };

    } catch (error) {
      // Handle case where comments are disabled or quota exceeded
      if (error.response?.status === 403) {
        // Check if it's a quota error specifically
        if (error.response?.data?.error?.errors?.[0]?.reason === 'quotaExceeded') {
          throw new QuotaExceededError('YouTube API quota exceeded.');
        }
        // Otherwise, comments are just disabled for this video
        return {
          comments: [],
          isFullyScraped: true,
          totalFound: 0
        };
      }
      
      throw error;
    }
  }

  // Get comments for multiple videos (CONCURRENT processing with rate limiting)
  async getCommentsForVideos(videos, maxCommentsPerVideo = DEFAULT_CONFIG.commentsPerVideo, database = null) {
    console.log(`   🚀 Processing ${videos.length} videos with ${DEFAULT_CONFIG.concurrentRequests} concurrent requests`);
    
    const allComments = [];
    const videoStatus = [];
    let apiCallCount = 0;

    // STEP 1: Split videos into smaller batches for processing
    const batches = this.splitIntoBatches(videos, DEFAULT_CONFIG.batchSize);
    
    // STEP 2: Process each batch with concurrency
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      console.log(`   📦 Processing batch ${i + 1}/${batches.length} (${batch.length} videos)`);
      
      // STEP 3: Process videos in this batch concurrently (up to concurrentRequests limit)
      const batchResults = await this.processBatchConcurrently(
        batch, 
        maxCommentsPerVideo, 
        database
      );
      
      // STEP 4: Collect results from this batch
      batchResults.forEach(result => {
        if (result.success) {
          allComments.push(...result.comments);
          apiCallCount += result.apiCost;
        }
        videoStatus.push(result.status);
      });
      
      // STEP 5: Wait between batches to respect rate limits
      if (i < batches.length - 1) { // Don't wait after the last batch
        await this.sleep(DEFAULT_CONFIG.rateLimitDelay);
      }
    }

    return {
      comments: allComments,
      apiCost: apiCallCount,
      videosProcessed: videos.length,
      videoStatus: videoStatus
    };
  }

  // HELPER: Split array into smaller batches
  splitIntoBatches(array, batchSize) {
    const batches = [];
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize));
    }
    return batches;
  }

  // HELPER: Process a batch of videos concurrently
  async processBatchConcurrently(videos, maxCommentsPerVideo, database) {
    // Create concurrent promises (limited by concurrentRequests)
    const promises = [];
    
    for (let i = 0; i < videos.length; i += DEFAULT_CONFIG.concurrentRequests) {
      // Take up to 'concurrentRequests' videos for this concurrent group
      const concurrentGroup = videos.slice(i, i + DEFAULT_CONFIG.concurrentRequests);
      
      // Create promises for each video in this concurrent group
      const groupPromises = concurrentGroup.map(video => 
        this.processVideoCommentsSafe(video, maxCommentsPerVideo, database)
      );
      
      // Wait for this group to complete before starting the next group
      const groupResults = await Promise.all(groupPromises);
      promises.push(...groupResults);
    }
    
    return promises;
  }

  // HELPER: Safely process comments for a single video (with error handling)
  async processVideoCommentsSafe(video, maxCommentsPerVideo, database) {
    try {
      // Calculate how many comments to fetch for this video
      const commentsToFetch = video.commentsNeeded || maxCommentsPerVideo;
      
      if (video.existingComments !== undefined) {
        console.log(`   📝 Fetching ${commentsToFetch} additional comments for video (has ${video.existingComments})`);
      }
      
      // Fetch comments from YouTube API
      const result = await this.getVideoComments(video.videoId, commentsToFetch);
      const comments = result.comments || result; // Handle both old and new return formats
      
      // Update database status if provided
      if (database && result.isFullyScraped !== undefined) {
        await database.updateVideoCommentStatus(
          video.videoId, 
          result.totalFound || comments.length,
          result.isFullyScraped,
          maxCommentsPerVideo
        );
      }
      
      // Calculate API cost for this video
      const apiCost = Math.ceil(comments.length / DEFAULT_CONFIG.maxCommentsPerCall);
      
      return {
        success: true,
        comments: comments,
        apiCost: apiCost,
        status: {
          videoId: video.videoId,
          commentsFound: comments.length,
          isFullyScraped: result.isFullyScraped || false,
          targetRequested: maxCommentsPerVideo
        }
      };
      
    } catch (error) {
      console.error(`   ❌ Failed to get comments for video: ${video.title}`);
      
      return {
        success: false,
        comments: [],
        apiCost: 0,
        status: {
          videoId: video.videoId,
          commentsFound: 0,
          isFullyScraped: false,
          targetRequested: maxCommentsPerVideo
        }
      };
    }
  }

  // Helper: Sleep function for rate limiting
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = CommentService;
