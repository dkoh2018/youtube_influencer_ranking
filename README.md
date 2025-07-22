# YouTube Influencer Ranking & Comment Analytics Backend

This project provides a backend service for fetching and analyzing YouTube channel and video data. It includes AI-powered sentiment analysis to understand audience engagement and content performance.

## Current Dataset
- **225+ videos** analyzed across multiple influencers
- **10,250+ comments** processed and analyzed
- **Average sentiment score: 0.30** (moderately positive audience reception)

## Features

-   **Efficient Data Indexing:** Uses the `playlistItems` endpoint for video indexing, which is 500x more cost-effective than the `search.list` method.
-   **AI Sentiment Analysis:** Analyzes comment sentiment with batch processing for 3x faster performance using OpenAI.
-   **Comprehensive Analytics:** Gathers data on influencers, videos, and comments, and provides aggregated statistics.
-   **RESTful API:** Exposes endpoints for indexing, data retrieval, and running the analytics engine.
-   **Database Integration:** Stores all data in a PostgreSQL database, managed with Supabase.
-   **Configurable:** Influencers and analytics parameters can be easily configured.

## Tech Stack

-   **Runtime:** Node.js
-   **Framework:** Express.js
-   **Database:** Supabase (PostgreSQL)
-   **AI:** OpenAI API for sentiment analysis
-   **API Interaction:** Axios for YouTube Data API v3

## Prerequisites

-   Node.js and npm
-   A Supabase account and project
-   A Google Cloud account with the YouTube Data API v3 enabled

## Setup and Installation

1.  **Clone the repository and install dependencies:**
    ```bash
    git clone <repository-url>
    cd <repository-directory>
    npm install
    ```

2.  **Set up the database:**
    -   Log in to your Supabase account and create a new project.
    -   Navigate to the SQL Editor and execute the schema from `SQL-schema.md`.
    -   Find your project URL and anon key in `Settings > API`.

3.  **Configure environment variables:**
    -   Create a `.env` file in the root directory. You can copy the existing `README.md`'s `.env` example if it exists.
    -   Add your Supabase URL, Supabase anon key, and YouTube Data API v3 key to the `.env` file:
        ```
        SUPABASE_URL=your_supabase_project_url
        SUPABASE_ANON_KEY=your_supabase_anon_key
        YOUTUBE_API_KEY=your_youtube_api_key
        ```

## Running the Application

### Start the Server

To start the Express server, run:

```bash
npm run dev
```

The server will run in development mode with `nodemon`, which automatically restarts on file changes. For production, use `npm start`.

### Run the Analytics Engine

To perform a one-time data processing job (indexing videos and comments), run the following command:

```bash
node process-analytics.js
```

This script uses the configuration from `config/influencers.js` and `config/defaults.js`.

### Run AI Sentiment Analysis

To analyze comment sentiment across all videos:

```bash
# First, collect and process comments
node src/ai/sentiment/comment-processor.js

# Then run sentiment analysis (processes all videos with 3x batch speedup)
node src/ai/sentiment/sentiment-analyzer.js
```

## Database

The database schema is managed by Supabase. For details on the table structure, relationships, and views, please refer to the `SQL-schema.md` file.# youtube_influencer_ranking
