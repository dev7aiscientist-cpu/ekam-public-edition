CREATE TABLE user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  seats_json TEXT NOT NULL,
  how_many INTEGER NOT NULL DEFAULT 5,
  thinking TEXT NOT NULL DEFAULT 'standard',
  length TEXT NOT NULL DEFAULT 'balanced',
  updated_at INTEGER NOT NULL
);
--> statement-breakpoint
ALTER TABLE runs ADD COLUMN settings_json TEXT;
