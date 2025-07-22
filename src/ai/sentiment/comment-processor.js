const Database = require('../../services/database');
const path = require('path');
require('dotenv').config();

async function testSentimentAnalysis() {
  const db = new Database();
  
  try {
    console.log('🔍 Finding IShowSpeed in database...');
    
    // Get all influencers to find IShowSpeed
    const influencers = await db.getInfluencers();
    console.log(`Found ${influencers.length} influencers in database`);
    
    // Find IShowSpeed
    const ishowspeed = influencers.find(inf => 
      inf.username?.toLowerCase().includes('ishowspeed') || 
      inf.channel_title?.toLowerCase().includes('ishowspeed') ||
      inf.username?.toLowerCase().includes('speed') ||
      inf.channel_title?.toLowerCase().includes('speed')
    );
    
    if (!ishowspeed) {
      console.log('❌ IShowSpeed not found in database');
      return;
    }
    
    console.log(`✅ Found IShowSpeed: ${ishowspeed.username} (${ishowspeed.channel_title})`);
    
    // Get his 2 most recent videos
    console.log('\n🎥 Getting 2 most recent videos...');
    const recentVideos = await db.getInfluencerVideos(ishowspeed.channel_id, 2);
    
    if (recentVideos.length === 0) {
      console.log('❌ No videos found for IShowSpeed');
      return;
    }
    
    console.log(`✅ Found ${recentVideos.length} recent videos`);
    
    // For each video, get comments and get top 100 longest
    const videoAnalysisData = [];
    
    for (let i = 0; i < recentVideos.length; i++) {
      const video = recentVideos[i];
      console.log(`\n📹 Processing Video ${i + 1}: ${video.title}`);
      console.log(`   Video ID: ${video.videoId}`);
      
      // Get more comments to have a good selection to filter from
      const allComments = await db.getVideoComments(video.videoId, 1000);
      console.log(`   Found ${allComments.length} total comments in database`);
      
      if (allComments.length === 0) {
        console.log('   ⚠️  No comments found for this video');
        continue;
      }
      
      // Filter and clean comments
      const cleanedComments = allComments
        .filter(comment => {
          if (!comment.text_content || !comment.text_content.trim()) return false;
          
          const text = comment.text_content.trim();
          const lowerText = text.toLowerCase();
          
          // Remove comments with 8+ repeated characters (spam detection)
          if (/(.)\1{7,}/.test(text)) {
            return false;
          }
          
          // Remove comments containing "crypto" (spam detection)
          if (lowerText.includes('crypto')) {
            return false;
          }
          
          // Remove comments over 600 characters (likely indexes/glossaries)
          if (text.length > 600) {
            return false;
          }
          
          // Remove comments with excessive emojis/symbols (5+ fire emojis, etc.)
          if ((text.match(/🔥/g) || []).length >= 5) {
            return false;
          }
          
          // Remove generic short praise comments
          const genericPhrases = ['w speed', 'w pogba', 'w stream', 'speed is goated', 'thanks speed'];
          if (text.length < 50 && genericPhrases.some(phrase => lowerText.includes(phrase))) {
            return false;
          }
          
          // Remove timestamp-only comments (start with time pattern)
          if (/^\d{1,2}:\d{2}/.test(text.trim())) {
            return false;
          }
          
          // Remove comments with too many HTML entities (poor quality)
          if ((text.match(/&#\d+;|&[a-z]+;/g) || []).length >= 3) {
            return false;
          }
          
          // Remove non-English comments (strict detection)
          // Check for non-Latin characters (Arabic, Chinese, Russian, etc.)
          if (/[^\u0000-\u007F\u00A0-\u024F\u1E00-\u1EFF]/.test(text)) {
            return false;
          }
          
          // Remove comments that are mostly non-English words (expanded list)
          const words = text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 1);
          if (words.length >= 1) {
            const commonNonEnglish = [
              // German
              'ist', 'der', 'das', 'und', 'ich', 'bin', 'nicht', 'aber', 'noch', 'sehr', 'eine', 'einen', 'mit', 'auf', 'für', 'von', 'auch', 'sie', 'wie', 'nur', 'war', 'hat', 'kann', 'dann', 'wenn', 'oder', 'aber', 'mehr', 'alle', 'nach', 'aus', 'bei', 'bis', 'durch', 'gegen', 'ohne', 'über', 'unter', 'vor', 'während', 'zwischen', 'seit', 'statt', 'trotz', 'wegen',
              // Spanish  
              'que', 'por', 'con', 'para', 'este', 'esta', 'muy', 'mas', 'como', 'pero', 'son', 'una', 'sus', 'les', 'nos', 'fue', 'ser', 'han', 'año', 'años', 'día', 'días', 'vez', 'veces', 'porque', 'donde', 'cuando', 'como', 'quien', 'quienes', 'cual', 'cuales', 'desde', 'hasta', 'entre', 'sobre', 'bajo', 'ante', 'contra', 'hacia', 'según', 'sin', 'tras', 'durante', 'mediante', 'excepto', 'salvo', 'terminó', 'tour', 'qué', 'está', 'están', 'eres', 'soy', 'somos', 'tiene', 'tener', 'hacer', 'hecho', 'siempre', 'también', 'aquí', 'allí', 'ahora', 'entonces', 'cada', 'otro', 'otra', 'todos', 'todas', 'nada', 'algo', 'alguien', 'nadie', 'mucho', 'mucha', 'muchos', 'muchas', 'poco', 'poca', 'pocos', 'pocas', 'todo', 'toda',
              // French
              'que', 'est', 'pour', 'une', 'sur', 'avec', 'son', 'ses', 'les', 'des', 'dans', 'par', 'ont', 'été', 'aux', 'mais', 'tout', 'ces', 'lui', 'deux', 'peu', 'peut', 'très', 'bien', 'sans', 'voir', 'fait', 'dire', 'dont', 'elle', 'ils', 'nous', 'vous', 'leur', 'entre', 'sous', 'depuis', 'avant', 'après', 'pendant', 'contre', 'vers', 'chez', 'malgré', 'grâce', 'oui', 'non', 'si', 'comment', 'quand', 'où', 'pourquoi', 'qui', 'quoi', 'quel', 'quelle', 'quels', 'quelles', 'cette', 'celui', 'celle', 'ceux', 'celles',
              // Portuguese
              'que', 'por', 'com', 'para', 'uma', 'seu', 'seus', 'sua', 'suas', 'dos', 'das', 'foi', 'são', 'tem', 'ter', 'mais', 'muito', 'bem', 'como', 'onde', 'quando', 'quem', 'qual', 'quais', 'desde', 'até', 'entre', 'sobre', 'sob', 'ante', 'contra', 'para', 'por', 'sem', 'após', 'durante', 'mediante', 'conforme', 'segundo', 'esta', 'este', 'essa', 'esse', 'isto', 'isso', 'aquela', 'aquele', 'aquilo', 'toda', 'todo', 'todos', 'todas', 'algum', 'alguma', 'alguns', 'algumas', 'nada', 'ninguém', 'alguém', 'algo', 'cada', 'outro', 'outra', 'outros', 'outras',
              // Italian
              'che', 'per', 'con', 'una', 'suo', 'suoi', 'sua', 'sue', 'del', 'dei', 'delle', 'degli', 'nel', 'nei', 'nelle', 'negli', 'sul', 'sui', 'sulle', 'sugli', 'dal', 'dai', 'dalle', 'dagli', 'molto', 'più', 'come', 'dove', 'quando', 'chi', 'quale', 'quali', 'fra', 'tra', 'sopra', 'sotto', 'contro', 'verso', 'presso', 'durante', 'mediante', 'secondo', 'senza', 'dopo', 'questo', 'questa', 'questi', 'queste', 'quello', 'quella', 'quelli', 'quelle', 'tutto', 'tutta', 'tutti', 'tutte', 'ogni', 'altro', 'altra', 'altri', 'altre', 'niente', 'nulla', 'qualcosa', 'qualcuno', 'nessuno'
            ];
            const nonEnglishCount = words.filter(word => commonNonEnglish.includes(word)).length;
            if (nonEnglishCount >= 1) { // Stricter: even 1 non-English word
              return false;
            }
          }
          
          // Additional check for accented characters (Spanish: ó, í, etc.)
          if (/[àáâãäåæçèéêëìíîïðñòóôõöøùúûüýþÿ]/i.test(text)) {
            return false;
          }
          
          // Additional check: require at least one common English word
          if (words.length >= 3) {
            const commonEnglish = ['the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had', 'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his', 'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy', 'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'this', 'that', 'with', 'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'what', 'your', 'really', 'about', 'after', 'again', 'before', 'being', 'could', 'every', 'first', 'going', 'great', 'never', 'other', 'right', 'still', 'these', 'think', 'where', 'would', 'music', 'speed', 'video', 'song', 'stream', 'comments'];
            const englishCount = words.filter(word => commonEnglish.includes(word)).length;
            if (englishCount === 0) { // Must have at least one common English word
              return false;
            }
          }
          
          // Remove like-baiting comments
          if (lowerText.includes('like this comment') || lowerText.includes('allowed to like') || lowerText.includes('every time someone likes')) {
            return false;
          }
          
          // Remove "here before" viral-seeking comments
          if (lowerText.includes('here before') || lowerText.includes('before it goes viral') || lowerText.includes('before this blows')) {
            return false;
          }
          
          // Remove comments with excessive punctuation (5+ exclamation marks or question marks)
          if ((text.match(/!/g) || []).length >= 5 || (text.match(/\?/g) || []).length >= 3) {
            return false;
          }
          
          // Remove very short generic comments (under 25 chars)
          if (text.length < 25 && (lowerText.includes('fire') || lowerText.includes('banger') || lowerText.includes('crazy'))) {
            return false;
          }
          
          // Remove percentage/format spam (0% this 100% that pattern)
          if ((text.match(/\d+%/g) || []).length >= 3) {
            return false;
          }
          
          return true;
        })
        .map(comment => ({
          ...comment,
          // Clean text content (remove HTML tags)
          text_content: comment.text_content.replace(/<[^>]*>/g, '').trim()
        }));
      
      console.log(`   🧹 After basic filtering: ${cleanedComments.length} comments`);
      
      // Remove duplicates based on text content
      const uniqueComments = [];
      const seenTexts = new Set();
      
      for (const comment of cleanedComments) {
        const normalizedText = comment.text_content.toLowerCase().trim();
        if (!seenTexts.has(normalizedText)) {
          seenTexts.add(normalizedText);
          uniqueComments.push(comment);
        }
      }
      
      console.log(`   🔄 After removing duplicates: ${uniqueComments.length} comments`);
      
      // Sort by length (longest first) and take top 100
      const validComments = uniqueComments
        .sort((a, b) => b.text_content.length - a.text_content.length)
        .slice(0, 100); // Take top 100 longest comments
      
      console.log(`   📏 Selected top ${validComments.length} longest comments`);
      if (validComments.length > 0) {
        console.log(`   📏 Longest comment: ${validComments[0].text_content.length} chars`);
        console.log(`   📏 Shortest selected: ${validComments[validComments.length - 1].text_content.length} chars`);
        console.log(`   📏 Average length: ${Math.round(validComments.reduce((sum, c) => sum + c.text_content.length, 0) / validComments.length)} chars`);
      }
      
      // Collate the comments sorted by length (longest to shortest)
      const combinedText = validComments
        .sort((a, b) => b.text_content.length - a.text_content.length) // Ensure longest first
        .map(comment => comment.text_content.trim())
        .join('\n\n');
      
      console.log(`   💬 Combined text length: ${combinedText.length} characters`);
      
      videoAnalysisData.push({
        videoId: video.videoId,
        title: video.title,
        publishedAt: video.publishedAt,
        commentCount: validComments.length,
        combinedText: combinedText,
        textLength: combinedText.length
      });
      
      // Show a preview of the combined text
      const preview = combinedText.substring(0, 300) + '...';
      console.log(`   📝 Text preview: ${preview}`);
    }
    
    console.log('\n📊 SUMMARY:');
    console.log(`Total videos processed: ${videoAnalysisData.length}`);
    videoAnalysisData.forEach((data, index) => {
      console.log(`Video ${index + 1}: ${data.commentCount} longest comments, ${data.textLength} chars`);
    });
    
    // Save the data for testing
    console.log('\n💾 Saving collated data for sentiment analysis...');
    const fs = require('fs');
    const outputPath = path.join(__dirname, '../data/comments-from-video.json');
    fs.writeFileSync(outputPath, JSON.stringify(videoAnalysisData, null, 2));
    console.log(`✅ Saved to ${outputPath}`);
    
    return videoAnalysisData;
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  }
}

// Run the test
if (require.main === module) {
  testSentimentAnalysis()
    .then(() => {
      console.log('\n✅ Test completed');
      process.exit(0);
    })
    .catch(error => {
      console.error('❌ Test failed:', error);
      process.exit(1);
    });
}

module.exports = { testSentimentAnalysis };
