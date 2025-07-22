require('dotenv').config();
const axios = require('axios');

const HANDLES_TO_TEST = [
  '@AdinLive',
  '@DukeDennisLive',
  '@FanumLive',
  '@IShowSpeed',
  '@KaiCenatLive',
  '@loganpaulvlogs',
  '@MrBeast',
  '@rayliveee',
  '@theschoolofhardknocks',
  '@Agent00everything',
  '@plaqueboymax5',
  '@xQcOW'
];

async function checkHandle(handle, apiKey) {
  try {
    let response = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
      params: {
        part: 'id,snippet',
        forUsername: handle.replace('@', ''),
        key: apiKey
      }
    });

    if (response.data.items && response.data.items.length > 0) {
      const channel = response.data.items[0];
      return {
        handle,
        works: true,
        title: channel.snippet.title,
        id: channel.id,
        method: 'forUsername'
      };
    }

    const searchResponse = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        type: 'channel',
        q: handle,
        maxResults: 1,
        key: apiKey
      }
    });

    if (searchResponse.data.items && searchResponse.data.items.length > 0) {
      const searchResult = searchResponse.data.items[0];
      const detailsResponse = await axios.get('https://www.googleapis.com/youtube/v3/channels', {
        params: {
          part: 'id,snippet',
          id: searchResult.id.channelId,
          key: apiKey
        }
      });

      if (detailsResponse.data.items && detailsResponse.data.items.length > 0) {
        const channel = detailsResponse.data.items[0];
        return {
          handle,
          works: true,
          title: channel.snippet.title,
          id: channel.id,
          method: 'search'
        };
      }
    }
    return { handle, works: false };
  } catch (error) {
    return { handle, works: false, error: error.message };
  }
}

async function main() {
  console.log('🧪 Testing YouTube Handles...\n');
  if (!process.env.YOUTUBE_API_KEY) {
    console.error('❌ Need YOUTUBE_API_KEY in .env file');
    return;
  }

  const workingHandles = [];
  const brokenHandles = [];

  for (const handle of HANDLES_TO_TEST) {
    process.stdout.write(`Testing ${handle}... `);
    const result = await checkHandle(handle, process.env.YOUTUBE_API_KEY);

    if (result.works) {
      console.log(`✅ ${result.title}`);
      workingHandles.push(handle);
    } else {
      console.log(`❌ Not found`);
      brokenHandles.push(handle);
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  console.log('\n' + '='.repeat(50));
  console.log('RESULTS:');
  console.log('='.repeat(50));

  if (workingHandles.length > 0) {
    console.log('\n✅ WORKING HANDLES (copy these to config/influencers.js):');
    console.log('const INFLUENCERS = [');
    workingHandles.forEach(handle => {
      console.log(`  '${handle}',`);
    });
    console.log('];');
  }

  if (brokenHandles.length > 0) {
    console.log('\n❌ BROKEN HANDLES (fix these):');
    brokenHandles.forEach(handle => {
      console.log(`  ${handle}`);
    });
  }

  console.log(`\n📊 API calls used: ~${HANDLES_TO_TEST.length * 2} (2-3 per handle with search fallback)`);
}

main();
