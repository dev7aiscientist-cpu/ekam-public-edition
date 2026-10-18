DROP TABLE entries;
--> statement-breakpoint
CREATE TABLE users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  token_hash TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE connections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  provider TEXT NOT NULL DEFAULT 'openrouter',
  api_key TEXT NOT NULL,
  last4 TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE oauth_pending (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  code_verifier TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  task TEXT NOT NULL,
  goal TEXT,
  plan_json TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  divider_note TEXT,
  combiner_note TEXT,
  final_result TEXT,
  total_latency_ms INTEGER,
  created_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE run_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id INTEGER NOT NULL REFERENCES runs(id),
  order_index INTEGER NOT NULL,
  capability_key TEXT NOT NULL,
  capability_label TEXT NOT NULL,
  title TEXT NOT NULL,
  instruction TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  output TEXT,
  route_label TEXT,
  latency_ms INTEGER,
  error_note TEXT
);
--> statement-breakpoint
CREATE TABLE learning_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  capability_key TEXT NOT NULL,
  route_class TEXT NOT NULL,
  sent INTEGER NOT NULL DEFAULT 0,
  done INTEGER NOT NULL DEFAULT 0,
  failed INTEGER NOT NULL DEFAULT 0,
  total_latency_ms INTEGER NOT NULL DEFAULT 0
);
--> statement-breakpoint
CREATE UNIQUE INDEX learning_user_cap_route ON learning_stats (user_id, capability_key, route_class);
--> statement-breakpoint
CREATE TABLE founder_config (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  last4 TEXT,
  updated_at INTEGER NOT NULL
);
