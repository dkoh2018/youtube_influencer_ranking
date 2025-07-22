// YouTube Influencer Configuration

const INFLUENCERS = [
  '@AdinLive',
  '@DukeDennis',
  '@FanumLive',
  '@IShowSpeed',
  '@KaiCenatLive',
  '@loganpaulvlogs',
  '@MrBeast',
  '@rayliveee',
  '@theschoolofhardknocks'
];

const INFLUENCER_CATEGORIES = {
  streaming: [
    '@IShowSpeed',
    '@KaiCenatLive',
    '@rayliveee',
    '@DukeDennis',
    '@FanumLive',
    '@AdinLive'
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
