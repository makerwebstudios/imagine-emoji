-- Imagine Emoji — puzzle catalog + shared leaderboard. Safe to re-run.
CREATE TABLE IF NOT EXISTS reels (
  tmdb_id     INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  year        TEXT,
  emojis      TEXT,             -- NULL when rejected
  also        TEXT NOT NULL DEFAULT '[]',   -- JSON array of accepted alternative titles
  genres      TEXT NOT NULL DEFAULT '[]',
  popularity  REAL,
  status      TEXT NOT NULL,    -- 'ok' | 'rejected'
  note        TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS reels_status ON reels(status);

CREATE TABLE IF NOT EXISTS scores (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  score       INTEGER NOT NULL,
  solved      INTEGER NOT NULL,
  ip_hash     TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS scores_top ON scores(score DESC);
CREATE INDEX IF NOT EXISTS scores_ip ON scores(ip_hash, created_at);
