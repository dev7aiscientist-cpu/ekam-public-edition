CREATE TABLE connections_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'openrouter',
  api_key TEXT NOT NULL,
  last4 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
INSERT INTO connections_new (id, user_id, provider, api_key, last4, created_at) SELECT id, user_id, provider, api_key, last4, created_at FROM connections;
--> statement-breakpoint
DROP TABLE connections;
--> statement-breakpoint
ALTER TABLE connections_new RENAME TO connections;
--> statement-breakpoint
CREATE UNIQUE INDEX connections_user_provider ON connections (user_id, provider);
--> statement-breakpoint
CREATE TABLE chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id INTEGER NOT NULL REFERENCES chats(id),
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  run_id INTEGER REFERENCES runs(id),
  created_at INTEGER NOT NULL
);
