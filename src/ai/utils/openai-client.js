require('dotenv').config();

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = 'https://api.openai.com/v1/chat/completions';
const OPENAI_MODEL = 'gpt-4.1'; // Change model here and it updates everywhere

async function callOpenAI(systemPrompt, userContent) {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY environment variable is required. Add it to your .env file');
  }

  console.log(`🤖 Calling OpenAI ${OPENAI_MODEL}...`);
  console.log(`📊 Sending ${userContent.length} characters to analyze`);

  const response = await fetch(OPENAI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt
        },
        {
          role: 'user', 
          content: userContent
        }
      ],
      temperature: 0.2,
      max_tokens: 10000
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

module.exports = {
  callOpenAI,
  OPENAI_MODEL
};
