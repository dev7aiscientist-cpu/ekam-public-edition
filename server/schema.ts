// EKAM — Public Edition schema. Everything is per-user and isolated:
// users own their connection, their runs, their parts and their learning
// record. No table is shared across users.

import { integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Session tokens for the signed-in visitor. Only the SHA-256 hash of the
// token is stored; the raw token lives only in the visitor's browser.
export const sessions = sqliteTable("sessions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// The user's own AI keys — one row per provider per user, pasted into
// Developer setup and stored only after a live test call to that provider
// accepted the key. The full key never leaves the server; only last4 is
// ever returned to the client.
export const connections = sqliteTable(
  "connections",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    provider: text("provider").notNull().default("openrouter"),
    apiKey: text("api_key").notNull(),
    last4: text("last4").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" })
      .notNull()
      .$defaultFn(() => new Date()),
  },
  (t) => [uniqueIndex("connections_user_provider").on(t.userId, t.provider)],
);

// Simple chat: per-user conversations. A chat is a list of messages; an
// assistant message may point at the run that produced it, so the
// "How this was made" record stays available backstage per reply.
export const chats = sqliteTable("chats", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  title: text("title").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const chatMessages = sqliteTable("chat_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  chatId: integer("chat_id")
    .notNull()
    .references(() => chats.id),
  role: text("role", { enum: ["user", "assistant"] }).notNull(),
  content: text("content").notNull(),
  runId: integer("run_id").references(() => runs.id),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Files attached to a chat message ("+" attach in the composer). The bytes
// live in blob storage under blobKey; this row keeps the metadata with the
// message so attachments persist per user and reappear when the chat is
// reopened. extractedText holds what the system genuinely read from the
// file — a document's extracted text, or a vision description of a photo —
// and stays null when nothing could be read (the chat says so honestly).
export const chatAttachments = sqliteTable("chat_attachments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  messageId: integer("message_id")
    .notNull()
    .references(() => chatMessages.id),
  chatId: integer("chat_id")
    .notNull()
    .references(() => chats.id),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  fileName: text("file_name").notNull(),
  mimeType: text("mime_type").notNull(),
  kind: text("kind", { enum: ["image", "document", "other"] }).notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  blobKey: text("blob_key").notNull(),
  extractedText: text("extracted_text"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// The user's Adjust settings — which seats may work, how many specialists
// may work on one task, thinking level and answer length. One row per
// user; absent row = defaults (every connection seat on, up to 5 parts,
// standard thinking, balanced length). These genuinely govern runs.
export const userSettings = sqliteTable("user_settings", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  seatsJson: text("seats_json").notNull(),
  howMany: integer("how_many").notNull().default(5),
  thinking: text("thinking", { enum: ["light", "standard", "deep"] }).notNull().default("standard"),
  length: text("length", { enum: ["brief", "balanced", "detailed"] }).notNull().default("balanced"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

// Legacy table from the retired OAuth connect design (replaced by the
// paste-key connect on the founder's direction). No action reads or
// writes it anymore; it is left in place so existing databases keep
// their migration history intact.
export const oauthPending = sqliteTable("oauth_pending", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .unique()
    .references(() => users.id),
  codeVerifier: text("code_verifier").notNull(),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const runs = sqliteTable("runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  userId: integer("user_id")
    .notNull()
    .references(() => users.id),
  task: text("task").notNull(),
  goal: text("goal"),
  planJson: text("plan_json"),
  status: text("status", { enum: ["running", "done", "failed"] }).notNull().default("running"),
  dividerNote: text("divider_note"),
  combinerNote: text("combiner_note"),
  // Snapshot of the Adjust settings that governed this run (JSON), so the
  // "How this was made" view can show them exactly as they were.
  settingsJson: text("settings_json"),
  finalResult: text("final_result"),
  totalLatencyMs: integer("total_latency_ms"),
  createdAt: integer("created_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});

export const runParts = sqliteTable("run_parts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  runId: integer("run_id")
    .notNull()
    .references(() => runs.id),
  orderIndex: integer("order_index").notNull(),
  capabilityKey: text("capability_key").notNull(),
  capabilityLabel: text("capability_label").notNull(),
  title: text("title").notNull(),
  instruction: text("instruction").notNull(),
  status: text("status", { enum: ["pending", "done", "failed"] }).notNull().default("pending"),
  output: text("output"),
  routeLabel: text("route_label"),
  latencyMs: integer("latency_ms"),
  errorNote: text("error_note"),
});

// Per-user learning record: capability -> route class, earned from real
// runs only. Starts empty; biases future routing toward proven routes.
export const learningStats = sqliteTable(
  "learning_stats",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    userId: integer("user_id")
      .notNull()
      .references(() => users.id),
    capabilityKey: text("capability_key").notNull(),
    routeClass: text("route_class").notNull(),
    sent: integer("sent").notNull().default(0),
    done: integer("done").notNull().default(0),
    failed: integer("failed").notNull().default(0),
    totalLatencyMs: integer("total_latency_ms").notNull().default(0),
  },
  (t) => [uniqueIndex("learning_user_cap_route").on(t.userId, t.capabilityKey, t.routeClass)],
);

// Legacy table from the retired Founder Setup (replaced by the per-user
// Developer setup key room). No action reads or writes it anymore; it is
// left in place so existing databases keep their migration history intact.
export const founderConfig = sqliteTable("founder_config", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull().unique(),
  value: text("value").notNull(),
  last4: text("last4"),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" })
    .notNull()
    .$defaultFn(() => new Date()),
});
