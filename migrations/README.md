# Database Migrations

This folder contains SQL migrations to manage your database schema and views systematically.

## What This Solves

Instead of manually typing SQL commands in the Supabase web editor and forgetting what you did, migrations give you:

- ✅ **Version Control**: All database changes tracked in git
- ✅ **Reproducibility**: Anyone can recreate your exact database structure  
- ✅ **Organization**: Each change is a separate, numbered file
- ✅ **Documentation**: Clear history of what changed when
- ✅ **Server-side Calculations**: Database views handle complex relationships

## Migration Files

- `001_initial_schema.sql` - Your current table structure
- `002_views_and_analytics.sql` - Database views for complex calculations
- `migrate.js` - Script to run migrations

## How to Use

### First Time Setup

1. Run the migration script:
```bash
node migrations/migrate.js
```

2. If automatic execution doesn't work, you'll be prompted to copy/paste SQL into Supabase SQL editor

### Adding New Migrations

1. Create new file: `003_your_change_name.sql`
2. Add your SQL changes
3. Run `node migrations/migrate.js` to apply

## Database Views Created

After running migrations, you'll have these views for server-side calculations:

### `influencer_rankings`
Complex ranking calculation combining subscriber count, views, sentiment, etc.
```sql
SELECT * FROM influencer_rankings ORDER BY ranking_score DESC;
```

### `channel_analytics` 
Channel performance metrics and engagement rates
```sql
SELECT * FROM channel_analytics WHERE engagement_rate_percent > 5;
```

### `video_comment_stats`
Video-level comment analytics with sentiment data
```sql
SELECT * FROM video_comment_stats WHERE total_comments_indexed > 50;
```

### `trending_videos`
Videos with recent high growth in views/likes
```sql
SELECT * FROM trending_videos WHERE view_count_change > 1000;
```

## Benefits

- **No More Client/Server Confusion**: Complex calculations happen in database views
- **Better Performance**: Database handles relationships efficiently  
- **Cleaner Code**: Your Node.js code just queries views
- **Easier Debugging**: See exactly what SQL is running

## Example Usage in Your Code

Instead of complex client-side calculations:

```javascript
// OLD WAY: Complex client-side calculation
const influencers = await database.getInfluencers();
const rankings = influencers.map(inf => {
  // Complex calculation logic here...
});

// NEW WAY: Simple view query
const { data } = await supabase
  .from('influencer_rankings')
  .select('*')
  .order('ranking_score', { ascending: false });
```
