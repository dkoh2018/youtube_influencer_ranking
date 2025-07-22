const Database = require('../../services/database');
const { callOpenAI, OPENAI_MODEL } = require('../utils/openai-client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const FORCE_OVERWRITE = false; // Set to true to overwrite existing analysis, false to skip
const BATCH_SIZE = 3; // Process 3 videos concurrently for faster processing

// Helper function to process a single video
async function processSingleVideo(video, systemPrompt, db, videoIndex, totalVideos) {
  console.log(`\n📹 Processing Video ${videoIndex + 1}/${totalVideos}: "${video.title}"`);
  console.log(`   Video ID: ${video.videoId}`);
  console.log(`   Comments: ${video.commentCount}`);
  console.log(`   Text length: ${video.textLength} characters`);

  // Check if already processed (unless forcing overwrite)
  if (!FORCE_OVERWRITE) {
    const hasExistingAnalysis = await db.hasSentimentAnalysis(video.videoId);
    if (hasExistingAnalysis) {
      console.log(`   ⏭️  Already has sentiment analysis, skipping`);
      
      // Get and display existing analysis
      const existingAnalysis = await db.getSentimentAnalysis(video.videoId);
      console.log(`   📊 Existing: ${existingAnalysis.net_sentiment_score} score, ${existingAnalysis.positive_count}/${existingAnalysis.negative_count}/${existingAnalysis.neutral_count} sentiment counts`);
      return existingAnalysis;
    }
  }

  try {
    // Call OpenAI for this video
    const startTime = Date.now();
    const aiResponse = await callOpenAI(systemPrompt, video.combinedText);
    const endTime = Date.now();
    
    console.log(`   ⏱️  Analysis completed in ${((endTime - startTime) / 1000).toFixed(1)} seconds`);

    // Parse the JSON response
    let parsedAnalysis;
    try {
      // Remove any markdown formatting if present
      const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      parsedAnalysis = JSON.parse(cleanedResponse);
      console.log(`   ✅ Successfully parsed AI response as JSON`);
    } catch (parseError) {
      console.log(`   ❌ AI response was not valid JSON:`);
      console.log(aiResponse);
      console.log(`   ⚠️  Skipping video due to parse error: ${parseError.message}`);
      return null;
    }

    // Create result object
    const result = {
      videoId: video.videoId,
      channelId: video.channelId, // Include channel_id for database storage
      title: video.title,
      publishedAt: video.publishedAt,
      commentCount: video.commentCount,
      textLength: video.textLength,
      analysis: parsedAnalysis,
      analyzedAt: new Date().toISOString(),
      model: OPENAI_MODEL,
      processingTime: ((endTime - startTime) / 1000).toFixed(1) + 's'
    };

    // Save to database
    console.log(`   🗄️  Saving to database...`);
    try {
      await db.saveSentimentAnalysis(result);
      console.log(`   ✅ Successfully saved to video_sentiment_analysis table`);
      
      // Display summary for this video
      if (parsedAnalysis.summary) {
        console.log(`   📊 Net Sentiment: ${parsedAnalysis.summary.net_sentiment_score}, Pos/Neg/Neu: ${parsedAnalysis.summary.positive_count}/${parsedAnalysis.summary.negative_count}/${parsedAnalysis.summary.neutral_count}`);
      }
      
      return result;
    } catch (dbError) {
      console.error(`   ❌ Database save failed: ${dbError.message}`);
      console.log(`   ⚠️  Skipping this video due to database error`);
      return null;
    }
  } catch (error) {
    console.error(`   ❌ Error processing video ${video.videoId}: ${error.message}`);
    return null;
  }
}

async function testSingleSentiment() {
  try {
    console.log('🧠 Running AI sentiment analysis on all videos...');

    // Step 1: Check if collated data exists
    const dataPath = path.join(__dirname, '../data/comments-from-video.json');
    if (!fs.existsSync(dataPath)) {
      console.log('❌ No collated data found. Run the data collection first:');
      console.log('   node src/ai/sentiment/comment-processor.js');
      return;
    }

    // Step 2: Load the collated data
    const collatedData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    console.log(`📂 Loaded ${collatedData.length} videos from collated data`);

    if (collatedData.length === 0) {
      console.log('❌ No videos in collated data');
      return;
    }

    // Step 3: Process ALL videos in the collated data
    const db = new Database();
    const processedResults = [];
    
    console.log(`🎯 Processing ${collatedData.length} videos for sentiment analysis`);
    console.log(`⚡ Using batch processing: ${BATCH_SIZE} videos at a time for ${BATCH_SIZE}x speedup`);
    if (!FORCE_OVERWRITE) {
      console.log(`⏭️  Will skip videos that already have analysis`);
    } else {
      console.log(`🔄 FORCE_OVERWRITE = true, will overwrite any existing analysis`);
    }

    // Step 4: Load system prompt (once for all videos)
    const systemPromptPath = path.join(__dirname, 'comment_system_prompt.md');
    if (!fs.existsSync(systemPromptPath)) {
      throw new Error('comment_system_prompt.md not found in sentiment directory');
    }
    
    const systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
    console.log('📋 Loaded system prompt from comment_system_prompt.md');

    // Step 5: Process videos in batches
    const totalBatches = Math.ceil(collatedData.length / BATCH_SIZE);
    console.log(`📦 Processing ${totalBatches} batches of ${BATCH_SIZE} videos each`);

    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const batchStart = batchIndex * BATCH_SIZE;
      const batchEnd = Math.min(batchStart + BATCH_SIZE, collatedData.length);
      const currentBatch = collatedData.slice(batchStart, batchEnd);
      
      console.log(`\n🚀 Starting Batch ${batchIndex + 1}/${totalBatches} (Videos ${batchStart + 1}-${batchEnd})`);
      
      // Process batch concurrently
      const batchStart_time = Date.now();
      const batchPromises = currentBatch.map((video, index) => 
        processSingleVideo(video, systemPrompt, db, batchStart + index, collatedData.length)
      );
      
      const batchResults = await Promise.all(batchPromises);
      const batchEnd_time = Date.now();
      
      // Filter out null results (errors/skips) and add to processedResults
      const validResults = batchResults.filter(result => result !== null);
      processedResults.push(...validResults);
      
      console.log(`\n✅ Batch ${batchIndex + 1} completed in ${((batchEnd_time - batchStart_time) / 1000).toFixed(1)}s`);
      console.log(`   Videos processed: ${validResults.length}/${currentBatch.length}`);
      console.log(`   Total progress: ${processedResults.length}/${collatedData.length} videos`);
    } // End batch processing loop

    // Save all results to JSON file
    const outputPath = path.join(__dirname, '../data/batch-sentiment-results.json');
    fs.writeFileSync(outputPath, JSON.stringify(processedResults, null, 2));
    console.log(`\n💾 All results saved to: ${outputPath}`);

    // Display final summary
    console.log('\n📊 BATCH SENTIMENT ANALYSIS COMPLETE:');
    console.log(`Total videos in dataset: ${collatedData.length}`);
    console.log(`Videos processed: ${processedResults.length}`);
    console.log(`Videos skipped (already analyzed): ${collatedData.length - processedResults.length}`);
    
    if (processedResults.length > 0) {
      const newResults = processedResults.filter(r => r.analysis); // Only newly processed ones
      if (newResults.length > 0) {
        console.log(`\n📈 NEW ANALYSIS SUMMARY:`);
        console.log(`Videos newly analyzed: ${newResults.length}`);
        
        // Calculate aggregate stats
        const totalCommentsAnalyzed = newResults.reduce((sum, r) => sum + (r.analysis?.summary?.total_comments_analyzed || 0), 0);
        const avgSentiment = newResults.reduce((sum, r) => sum + (r.analysis?.summary?.net_sentiment_score || 0), 0) / newResults.length;
        
        console.log(`Total comments analyzed: ${totalCommentsAnalyzed}`);
        console.log(`Average sentiment score: ${avgSentiment.toFixed(2)}`);
      }
    }

    console.log(`\n💰 Batch processing completed successfully`);
    return processedResults;

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    throw error;
  }
}

// Run the test
if (require.main === module) {
  testSingleSentiment()
    .then(() => {
      console.log('\n✅ Single sentiment analysis test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error.message);
      process.exit(1);
    });
}

module.exports = { testSingleSentiment };
