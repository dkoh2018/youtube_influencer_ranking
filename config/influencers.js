// YouTube Influencer Configuration

const INFLUENCERS = [
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

const INFLUENCER_CATEGORIES = {
  streaming: [
    '@IShowSpeed',
    '@KaiCenatLive',
    '@rayliveee',
    '@DukeDennisLive',
    '@FanumLive',
    '@AdinLive',
    '@Agent00everything',
    '@plaqueboymax5',
    '@xQcOW'
  ],
  entertainment: [
    '@MrBeast',
    '@loganpaulvlogs'
  ],
  finance: [
    '@theschoolofhardknocks'
  ]
};

const getAllInfluencers = () => {
  return Object.values(INFLUENCER_CATEGORIES).flat();
};

module.exports = {
  INFLUENCERS,
  INFLUENCER_CATEGORIES,
  getAllInfluencers
};
