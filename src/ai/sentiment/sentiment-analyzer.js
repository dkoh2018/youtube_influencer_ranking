const Database = require('../../services/database');
const { callOpenAI, OPENAI_MODEL } = require('../utils/openai-client');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configuration
const FORCE_OVERWRITE = false; // Set to true to overwrite existing analysis, false to skip

async function testSingleSentiment() {
  try {
    console.log('🧠 Testing AI sentiment analysis on single video...');

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

    // Step 3: Use only the FIRST video to save tokens
    const testVideo = collatedData[0];
    console.log(`🎯 Testing with: "${testVideo.title}"`);
    console.log(`   Video ID: ${testVideo.videoId}`);
    console.log(`   Comments: ${testVideo.commentCount}`);
    console.log(`   Text length: ${testVideo.textLength} characters`);

    // Step 3.5: Check if already processed (unless forcing overwrite)
    const db = new Database();
    if (!FORCE_OVERWRITE) {
      const hasExistingAnalysis = await db.hasSentimentAnalysis(testVideo.videoId);
      if (hasExistingAnalysis) {
        console.log(`⏭️  Video already has sentiment analysis, skipping to save tokens`);
        console.log(`   Set FORCE_OVERWRITE = true to overwrite existing analysis`);
        
        // Get and display existing analysis
        const existingAnalysis = await db.getSentimentAnalysis(testVideo.videoId);
        console.log(`\n📊 EXISTING ANALYSIS (${existingAnalysis.model_used}):`);
        console.log(`   Net Sentiment Score: ${existingAnalysis.net_sentiment_score}`);
        console.log(`   Positive: ${existingAnalysis.positive_count} comments`);
        console.log(`   Negative: ${existingAnalysis.negative_count} comments`);
        console.log(`   Neutral: ${existingAnalysis.neutral_count} comments`);
        return existingAnalysis;
      }
    } else {
      console.log(`🔄 FORCE_OVERWRITE = true, will overwrite any existing analysis`);
    }

    // Step 4: Load system prompt
    const systemPromptPath = path.join(__dirname, 'comment_system_prompt.md');
    if (!fs.existsSync(systemPromptPath)) {
      throw new Error('comment_system_prompt.md not found in sentiment directory');
    }
    
    const systemPrompt = fs.readFileSync(systemPromptPath, 'utf8');
    console.log('📋 Loaded system prompt from comment_system_prompt.md');

    // Step 5: Call OpenAI with the combined text
    const startTime = Date.now();
    const aiResponse = await callOpenAI(systemPrompt, testVideo.combinedText);
    const endTime = Date.now();
    
    console.log(`⏱️  Analysis completed in ${((endTime - startTime) / 1000).toFixed(1)} seconds`);

    // Step 6: Parse the JSON response
    let parsedAnalysis;
    try {
      // Remove any markdown formatting if present
      const cleanedResponse = aiResponse.replace(/```json\n?|\n?```/g, '').trim();
      parsedAnalysis = JSON.parse(cleanedResponse);
      console.log('✅ Successfully parsed AI response as JSON');
    } catch (parseError) {
      console.log('❌ AI response was not valid JSON:');
      console.log(aiResponse);
      throw new Error(`Invalid JSON response: ${parseError.message}`);
    }

    // Step 7: Create result object
    const result = {
      videoId: testVideo.videoId,
      title: testVideo.title,
      publishedAt: testVideo.publishedAt,
      commentCount: testVideo.commentCount,
      textLength: testVideo.textLength,
      analysis: parsedAnalysis,
      analyzedAt: new Date().toISOString(),
      model: OPENAI_MODEL,
      processingTime: ((endTime - startTime) / 1000).toFixed(1) + 's'
    };

    // Step 8: Save result to JSON file
    const outputPath = path.join(__dirname, '../data/single-sentiment-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    console.log(`💾 Result saved to: ${outputPath}`);

    // Step 9: Save to database
    console.log('🗄️  Saving to database...');
    try {
      await db.saveSentimentAnalysis(result);
      console.log('✅ Successfully saved to video_sentiment_analysis table');
    } catch (dbError) {
      console.error('❌ Database save failed:', dbError.message);
      console.log('⚠️  Make sure to create the table first:');
      console.log('   Run the SQL from src/migrations/create-sentiment-table.sql in Supabase');
    }

    // Step 10: Display summary
    console.log('\n📊 SENTIMENT ANALYSIS RESULTS:');
    console.log(`Video: ${result.title}`);
    
    if (parsedAnalysis.summary) {
      console.log(`Total Comments Analyzed: ${parsedAnalysis.summary.total_comments_analyzed}`);
      console.log(`Net Sentiment Score: ${parsedAnalysis.summary.net_sentiment_score}`);
      console.log(`Positive: ${parsedAnalysis.summary.positive_count} comments`);
      console.log(`Negative: ${parsedAnalysis.summary.negative_count} comments`);
      console.log(`Neutral: ${parsedAnalysis.summary.neutral_count} comments`);
      
      if (parsedAnalysis.themes) {
        console.log(`\nThemes Identified: ${parsedAnalysis.themes.length}`);
        parsedAnalysis.themes.forEach((theme, index) => {
          console.log(`${index + 1}. ${theme.theme_name} (${theme.theme_sentiment})`);
          console.log(`   ${theme.theme_summary.substring(0, 100)}...`);
        });
      }
    }

    console.log(`\n💰 Processing completed successfully`);
    return result;

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
