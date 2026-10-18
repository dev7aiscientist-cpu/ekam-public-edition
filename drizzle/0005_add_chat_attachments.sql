CREATE TABLE chat_attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES chat_messages(id),
  chat_id INTEGER NOT NULL REFERENCES chats(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  file_name TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  kind TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  blob_key TEXT NOT NULL,
  extracted_text TEXT,
  created_at INTEGER NOT NULL
);
