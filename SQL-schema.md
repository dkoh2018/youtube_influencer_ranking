# Database Schema Documentation (Supabase/Postgres)

---

## 1. Database Relationships

| Source Table | Source Column | Target Table | Target Column |
| ------------ | ------------- | ------------ | ------------- |
| videos       | channel_id    | influencers  | channel_id    |
| comments     | video_id      | videos       | video_id      |

---

## 2. Table: comments

### Schema
| Column Name       | Data Type                | Is Nullable | Column Default                       |
| ----------------- | ------------------------ | ----------- | ------------------------------------ |
| created_at        | timestamp with time zone | YES         | now()                                |
| reply_count       | integer                  | YES         | 0                                    |
| published_at      | timestamp with time zone | NO          | null                                 |
| updated_at        | timestamp with time zone | NO          | null                                 |
| indexed_at        | timestamp with time zone | YES         | now()                                |
| id                | integer                  | NO          | nextval('comments_id_seq'::regclass) |
| comment_id        | character varying        | NO          | null                                 |
| video_id          | character varying        | NO          | null                                 |
| author_name       | character varying        | NO          | null                                 |
| author_channel_id | character varying        | YES         | null                                 |
| text_content      | text                     | NO          | null                                 |

### Foreign Key Relationships
| Source Table | Source Column | Target Table | Target Column |
| ------------ | ------------- | ------------ | ------------- |
| videos       | channel_id    | influencers  | channel_id    |
| comments     | video_id      | videos       | video_id      |

### Sample Query (excluding like_count)
```sql
SELECT
  created_at,
  reply_count,
  published_at,
  updated_at,
  indexed_at,
  id,
  comment_id,
  video_id,
  author_name,
  author_channel_id,
  text_content
FROM comments;
```

---

*To expand this documentation, add similar sections for your other tables. If you provide their schemas, I can generate those sections for you as well!*
