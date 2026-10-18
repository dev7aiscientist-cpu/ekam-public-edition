// EKAM — Public Edition server actions.
//
// Accounts are per-visitor (name + email, session token). Everything —
// keys, chats, runs, history, learning — is scoped to the signed-in user.
//
// Developer setup is the app's key room: one slot per provider
// (OpenRouter, NVIDIA, Groq, Gemini, Claude, Mistral AI, Cohere,
// Together AI, Fireworks AI, DeepSeek, xAI, Hugging Face) plus one
// image-generation door (fal.ai). The user creates a key on the
// provider's own site, pastes it here, and the server makes ONE real
// test call to that provider with it. The key is stored against the
// user's account ONLY if that call genuinely succeeds; a refused key is
// never stored. Full keys never leave the server — only last4 is shown.
//
// The workspace is a simple chat. Behind it the engine works invisibly:
// a simple message is answered directly by the best connected provider;
// a project-sized ask goes through the Divider AI (strict JSON plan
// contract, server-side validator with one repair retry then a safe
// fallback, parallel dispatch across the user's connected providers,
// auto-combine) and the reply arrives as one chat answer. Provider and
// model names live only in this file and in Developer setup — the chat
// and the Adjust seats show capability labels only.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// Providers — the twelve key slots of Developer setup.
// ---------------------------------------------------------------------------

export type ProviderId =
  | "openrouter"
  | "nvidia"
  | "groq"
  | "gemini"
  | "claude"
  | "mistral"
  | "cohere"
  | "together"
  | "fireworks"
  | "deepseek"
  | "xai"
  | "huggingface"
  | "fal";

type ProviderDef = {
  id: ProviderId;
  name: string;
  keyUrl: string;
  keyHint: string;
  // Neutral route label used everywhere outside Developer setup (the
  // "How this was made" view, the learning record) — never a brand name.
  routeLabel: string;
  // "image" marks the one image-generation door (fal.ai); every other
  // slot is a chat/text provider. Image generation never joins the
  // divider's text routes — it has its own path in sendMessage.
  purpose?: "image";
  // A plain honesty line shown on the slot itself (fal is pay-as-you-go).
  note?: string;
};

const PROVIDERS: ProviderDef[] = [
  { id: "openrouter", name: "OpenRouter", keyUrl: "https://openrouter.ai/keys", keyHint: "Real keys begin with “sk-or-” and are one long unbroken string.", routeLabel: "the combined route" },
  { id: "nvidia", name: "NVIDIA", keyUrl: "https://build.nvidia.com/", keyHint: "Create an API key on NVIDIA's build site and copy the whole key.", routeLabel: "the accelerated route" },
  { id: "groq", name: "Groq", keyUrl: "https://console.groq.com/keys", keyHint: "Real keys begin with “gsk_” and are one long unbroken string.", routeLabel: "the fast route" },
  { id: "gemini", name: "Gemini (Google)", keyUrl: "https://aistudio.google.com/apikey", keyHint: "Create a key in Google AI Studio and copy the whole key.", routeLabel: "the multimodal route" },
  { id: "claude", name: "Claude (Anthropic)", keyUrl: "https://console.anthropic.com/settings/keys", keyHint: "Real keys begin with “sk-ant-” and are one long unbroken string.", routeLabel: "the careful route" },
  { id: "mistral", name: "Mistral AI", keyUrl: "https://console.mistral.ai/api-keys", keyHint: "Create a key in the Mistral console and copy the whole key.", routeLabel: "the european route" },
  { id: "cohere", name: "Cohere", keyUrl: "https://dashboard.cohere.com/api-keys", keyHint: "Create a key in the Cohere dashboard and copy the whole key.", routeLabel: "the language route" },
  { id: "together", name: "Together AI", keyUrl: "https://api.together.ai/settings/api-keys", keyHint: "Create a key in your Together settings and copy the whole key.", routeLabel: "the open-models route" },
  { id: "fireworks", name: "Fireworks AI", keyUrl: "https://fireworks.ai/account/api-keys", keyHint: "Create a key in your Fireworks account and copy the whole key.", routeLabel: "the swift route" },
  { id: "deepseek", name: "DeepSeek", keyUrl: "https://platform.deepseek.com/api_keys", keyHint: "Create a key on the DeepSeek platform and copy the whole key.", routeLabel: "the deep-thinking route" },
  { id: "xai", name: "xAI (Grok)", keyUrl: "https://console.x.ai", keyHint: "Create a key in the xAI console and copy the whole key.", routeLabel: "the grok route" },
  { id: "huggingface", name: "Hugging Face", keyUrl: "https://huggingface.co/settings/tokens", keyHint: "Real tokens begin with “hf_” — create an access token and copy the whole token.", routeLabel: "the community route" },
  { id: "fal", name: "fal.ai", keyUrl: "https://fal.ai/dashboard/keys", keyHint: "Create an API key in your fal.ai dashboard and copy the whole key.", routeLabel: "the image route", purpose: "image", note: "Image generation runs on your own fal account — fal is pay-as-you-go, so each picture uses your fal credits, not EKAM's." },
];

const PROVIDER_BY_ID = new Map(PROVIDERS.map((p) => [p.id, p]));
const ROUTE_LABELS: Record<ProviderId, string> = Object.fromEntries(PROVIDERS.map((p) => [p.id, p.routeLabel])) as Record<ProviderId, string>;

// ---------------------------------------------------------------------------
// The elite team — capability seats. Each seat lists the providers that
// can serve it, best first; routing resolves that list onto the providers
// the user has genuinely connected, and the learning record re-orders it.
// ---------------------------------------------------------------------------

type Capability = {
  key: string;
  label: string;
  servedBy: "connection" | "platform" | "fal";
  providers: ProviderId[];
  system: string;
};

const CAPABILITIES: Capability[] = [
  { key: "code", label: "Best for code", servedBy: "connection", providers: ["claude", "deepseek", "mistral", "together", "fireworks", "xai", "openrouter", "groq", "nvidia", "gemini", "cohere", "huggingface"], system: "You are a specialist in writing clean, complete code. Return production-ready code with brief explanations." },
  { key: "reasoning", label: "Best for reasoning & maths", servedBy: "connection", providers: ["deepseek", "claude", "xai", "groq", "openrouter", "mistral", "nvidia", "gemini", "together", "fireworks", "cohere", "huggingface"], system: "You are a specialist in deep reasoning, mathematics and logic. Show clear step-by-step thinking and a verified final answer." },
  { key: "planning", label: "Best for planning", servedBy: "connection", providers: ["openrouter", "claude", "xai", "mistral", "nvidia", "groq", "gemini", "together", "fireworks", "deepseek", "cohere", "huggingface"], system: "You are a planning specialist. Turn a goal into a clear, ordered, actionable plan." },
  { key: "data", label: "Best for data & formulas", servedBy: "connection", providers: ["nvidia", "openrouter", "deepseek", "groq", "claude", "gemini", "mistral", "together", "fireworks", "xai", "cohere", "huggingface"], system: "You are a data specialist. Return clean, valid structured output (JSON, tables, formulas) exactly in the requested shape." },
  { key: "writing", label: "Best for writing", servedBy: "connection", providers: ["cohere", "claude", "gemini", "mistral", "openrouter", "groq", "nvidia", "xai", "together", "fireworks", "deepseek", "huggingface"], system: "You are a writing specialist. Produce polished, well-structured writing that matches the requested tone." },
  { key: "research", label: "Best for research summaries", servedBy: "connection", providers: ["gemini", "cohere", "openrouter", "claude", "groq", "nvidia", "xai", "mistral", "together", "fireworks", "deepseek", "huggingface"], system: "You are a research specialist. Synthesise, summarise and organise material accurately and clearly." },
  { key: "documents", label: "Best for documents", servedBy: "connection", providers: ["cohere", "gemini", "claude", "openrouter", "nvidia", "groq", "mistral", "together", "fireworks", "xai", "deepseek", "huggingface"], system: "You are a document specialist. Extract, structure and explain content from documents, tables and text clearly." },
  { key: "translation", label: "Best for translation", servedBy: "connection", providers: ["cohere", "gemini", "openrouter", "claude", "mistral", "nvidia", "groq", "together", "fireworks", "xai", "deepseek", "huggingface"], system: "You are a translation specialist covering many languages including all major Indian languages. Translate faithfully and naturally." },
  { key: "general", label: "Best for everyday questions", servedBy: "connection", providers: ["groq", "mistral", "together", "fireworks", "xai", "openrouter", "gemini", "claude", "nvidia", "cohere", "deepseek", "huggingface"], system: "You are a fast, helpful general assistant. Answer concisely and directly." },
  { key: "vision", label: "Best for seeing images", servedBy: "connection", providers: ["gemini", "openrouter", "claude", "xai", "nvidia", "groq", "mistral", "together", "fireworks", "cohere", "deepseek", "huggingface"], system: "You are a vision specialist. Analyse visual material described to you and help with image-related work clearly and helpfully." },
  // Image creation is served by the user's own fal.ai connection (the
  // image-generation door in Developer setup) — never by the divider's
  // text routes, so it stays out of DIVIDER_KEYS; sendMessage routes an
  // image ask straight to fal. Voice still needs the platform pool.
  { key: "image_creation", label: "Best for creating images", servedBy: "fal", providers: ["fal"], system: "" },
  { key: "voice", label: "Best for voice & audio", servedBy: "platform", providers: [], system: "" },
];

const CAP_BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));
const DIVIDER_KEYS = CAPABILITIES.filter((c) => c.servedBy === "connection").map((c) => c.key);

// ---------------------------------------------------------------------------
// Adjust — the user's talking controls for chat. Per user, persisted, and
// they genuinely govern every reply:
//  - seats: which capability seats are ON. A seat can only be on while at
//    least one provider that serves it is connected (platform seats never).
//  - howMany: caps how many parts (specialists) one ask may be split into.
//  - thinking: reasoning/token budget — Light < Standard < Deep.
//  - length: output-length target — Brief < Balanced < Detailed.
// ---------------------------------------------------------------------------

export type ThinkingLevel = "light" | "standard" | "deep";
export type LengthLevel = "brief" | "balanced" | "detailed";
export type AdjustSettings = { seats: string[]; howMany: number; thinking: ThinkingLevel; length: LengthLevel };

const PLAN_HARD_CAP = 5;
const DEFAULT_ADJUST: AdjustSettings = { seats: [...DIVIDER_KEYS], howMany: PLAN_HARD_CAP, thinking: "standard", length: "balanced" };

function normalizeAdjust(raw: { seats?: unknown; howMany?: unknown; thinking?: unknown; length?: unknown } | null | undefined): AdjustSettings {
  const seatsRaw = Array.isArray(raw?.seats) ? raw.seats : [];
  const seats = DIVIDER_KEYS.filter((k) => seatsRaw.includes(k));
  const hm = typeof raw?.howMany === "number" && Number.isFinite(raw.howMany) ? Math.round(raw.howMany) : DEFAULT_ADJUST.howMany;
  return {
    seats,
    howMany: Math.min(DIVIDER_KEYS.length, Math.max(1, hm)),
    thinking: raw?.thinking === "light" || raw?.thinking === "deep" ? raw.thinking : "standard",
    length: raw?.length === "brief" || raw?.length === "detailed" ? raw.length : "balanced",
  };
}

function partCapFor(s: AdjustSettings): number {
  return Math.max(1, Math.min(s.howMany, PLAN_HARD_CAP, Math.max(1, s.seats.length)));
}

function budgetsFor(s: AdjustSettings): { dividerTokens: number; partTokens: number; combineTokens: number; temperature: number } {
  const partTokens = s.thinking === "light" ? 1000 : s.thinking === "deep" ? 3200 : 1800;
  const combineBase = s.length === "brief" ? 1300 : s.length === "detailed" ? 3800 : 2400;
  const combineTokens = Math.round(combineBase * (s.thinking === "light" ? 0.7 : s.thinking === "deep" ? 1.3 : 1));
  return {
    dividerTokens: s.thinking === "deep" ? 1000 : 800,
    partTokens,
    combineTokens,
    temperature: s.thinking === "deep" ? 0.5 : s.thinking === "light" ? 0.8 : 0.7,
  };
}

function thinkingNote(thinking: ThinkingLevel): string {
  if (thinking === "light") return "Thinking level: LIGHT — think briefly and produce your part directly; do not over-deliberate or show long workings.";
  if (thinking === "deep") return "Thinking level: DEEP — before producing your part, reason carefully step by step, weigh alternatives and check your work for mistakes; then present the part clearly.";
  return "Thinking level: STANDARD — think as much as this part genuinely needs, no more, no less.";
}

function lengthNote(length: LengthLevel): string {
  if (length === "brief") return "Length target: BRIEF — keep your output tight and to the point; include only what the goal needs, nothing extra.";
  if (length === "detailed") return "Length target: DETAILED — be thorough and complete; include the detail, structure and examples that make this genuinely useful.";
  return "Length target: BALANCED — complete and clear, with no padding.";
}

async function loadAdjust(ctx: Ctx, userId: number): Promise<AdjustSettings> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return { ...DEFAULT_ADJUST, seats: [...DEFAULT_ADJUST.seats] };
  let parsed: unknown = null;
  try { parsed = JSON.parse(row.seatsJson); } catch { parsed = null; }
  return normalizeAdjust({ seats: parsed, howMany: row.howMany, thinking: row.thinking, length: row.length });
}

async function saveAdjustRow(ctx: Ctx, userId: number, s: AdjustSettings): Promise<void> {
  const db = ctx.db<typeof schema>();
  const seatsJson = JSON.stringify(s.seats);
  const existing = await db.select().from(schema.userSettings).where(eq(schema.userSettings.userId, userId)).limit(1);
  if (existing[0]) {
    await db
      .update(schema.userSettings)
      .set({ seatsJson, howMany: s.howMany, thinking: s.thinking, length: s.length, updatedAt: new Date() })
      .where(eq(schema.userSettings.userId, userId));
  } else {
    await db.insert(schema.userSettings).values({ userId, seatsJson, howMany: s.howMany, thinking: s.thinking, length: s.length });
  }
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw new Error(`Timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

async function userForToken(ctx: Ctx, token: string | undefined): Promise<{ id: number; name: string; email: string } | null> {
  if (!token) return null;
  const db = ctx.db<typeof schema>();
  const hash = await sha256Hex(token);
  const rows = await db.select().from(schema.sessions).where(eq(schema.sessions.tokenHash, hash)).limit(1);
  const session = rows[0];
  if (!session) return null;
  const userRows = await db.select().from(schema.users).where(eq(schema.users.id, session.userId)).limit(1);
  const user = userRows[0];
  if (!user) return null;
  return { id: user.id, name: user.name, email: user.email };
}

// All of the user's genuinely connected providers: provider id -> key.
async function connectionsFor(ctx: Ctx, userId: number): Promise<Map<ProviderId, { apiKey: string; last4: string }>> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.connections).where(eq(schema.connections.userId, userId));
  const map = new Map<ProviderId, { apiKey: string; last4: string }>();
  for (const r of rows) {
    if (PROVIDER_BY_ID.has(r.provider as ProviderId)) map.set(r.provider as ProviderId, { apiKey: r.apiKey, last4: r.last4 });
  }
  return map;
}

// Can this capability seat work at all right now? Only while at least one
// provider that serves it is connected.
function seatServable(cap: Capability, conns: Map<ProviderId, unknown>): boolean {
  return cap.servedBy !== "platform" && cap.providers.some((p) => conns.has(p));
}

// ---------------------------------------------------------------------------
// Provider calls — one chat call shape per provider, server-side only.
// Model ids live here and never reach the client.
// ---------------------------------------------------------------------------

// OpenRouter keeps its class routing (ultra / super / vl / free); other
// providers pick their model by the capability's first-choice class.
const OR_MODELS = {
  ultra: "nvidia/nemotron-3-ultra-550b-a55b:free",
  super: "nvidia/nemotron-3-super-120b-a12b:free",
  vl: "nvidia/nemotron-3.5-super-vl:free",
  free: "openrouter/free",
} as const;

type OrClass = keyof typeof OR_MODELS;

function orClassFor(cap: Capability): OrClass {
  if (cap.key === "vision") return "vl";
  if (cap.key === "code" || cap.key === "reasoning" || cap.key === "planning" || cap.key === "data") return "ultra";
  return "super";
}

function modelFor(provider: ProviderId, cap: Capability): string {
  switch (provider) {
    case "openrouter":
      return OR_MODELS[orClassFor(cap)];
    case "nvidia":
      return cap.key === "code" || cap.key === "reasoning" ? "nvidia/nemotron-3-super-120b-a12b" : "meta/llama-3.3-70b-instruct";
    case "groq":
      return cap.key === "code" || cap.key === "reasoning" || cap.key === "planning" ? "openai/gpt-oss-120b" : "llama-3.3-70b-versatile";
    case "gemini":
      return "gemini-2.5-flash";
    case "claude":
      return "claude-sonnet-4-5";
    case "mistral":
      if (cap.key === "code") return "codestral-latest";
      if (cap.key === "general" || cap.key === "translation") return "mistral-small-latest";
      return "mistral-large-latest";
    case "cohere":
      return cap.key === "general" || cap.key === "translation" ? "command-r7b-12-2024" : "command-a-03-2025";
    case "together":
      if (cap.key === "code") return "Qwen/Qwen2.5-Coder-32B-Instruct";
      if (cap.key === "reasoning") return "deepseek-ai/DeepSeek-R1";
      return "meta-llama/Llama-3.3-70B-Instruct-Turbo";
    case "fireworks":
      if (cap.key === "code") return "accounts/fireworks/models/qwen2p5-coder-32b-instruct";
      if (cap.key === "reasoning") return "accounts/fireworks/models/deepseek-r1";
      return "accounts/fireworks/models/llama-v3p3-70b-instruct";
    case "deepseek":
      return cap.key === "reasoning" ? "deepseek-reasoner" : "deepseek-chat";
    case "xai":
      return cap.key === "reasoning" || cap.key === "planning" ? "grok-4-1-fast-reasoning" : "grok-4-1-fast-non-reasoning";
    case "huggingface":
      return cap.key === "code" ? "Qwen/Qwen2.5-Coder-32B-Instruct" : "meta-llama/Llama-3.3-70B-Instruct";
    case "fal":
      // fal serves image generation only — it has no chat model.
      return "";
  }
}

type OaiChatResponse = {
  choices?: Array<{ message?: { content?: string | null; reasoning?: string | null; reasoning_content?: string | null } }>;
};

function extractOaiText(json: OaiChatResponse): string {
  const m = json.choices?.[0]?.message;
  const content = typeof m?.content === "string" ? m.content.trim() : "";
  if (content) return content;
  const reasoning = typeof m?.reasoning_content === "string" ? m.reasoning_content : typeof m?.reasoning === "string" ? m.reasoning : "";
  return reasoning.trim();
}

async function callOpenAiStyle(url: string, apiKey: string, model: string, system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }, extraHeaders?: Record<string, string>): Promise<string> {
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...(extraHeaders ?? {}) },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  }, opts.timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 140)}` : ""}`);
  }
  const json = (await res.json()) as OaiChatResponse;
  const text = extractOaiText(json);
  if (!text) throw new Error("Empty response");
  return text;
}

async function callGemini(apiKey: string, model: string, system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<string> {
  const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens },
    }),
  }, opts.timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 140)}` : ""}`);
  }
  const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
  if (!text) throw new Error("Empty response");
  return text;
}

async function callClaude(apiKey: string, model: string, system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<string> {
  const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens,
      temperature: opts.temperature,
      system,
      messages: [{ role: "user", content: user }],
    }),
  }, opts.timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 140)}` : ""}`);
  }
  const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
  const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) throw new Error("Empty response");
  return text;
}

// Cohere's chat API (v2) — its own request/response shape.
async function callCohere(apiKey: string, model: string, system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<string> {
  const res = await fetchWithTimeout("https://api.cohere.com/v2/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  }, opts.timeoutMs);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 140)}` : ""}`);
  }
  const json = (await res.json()) as { message?: { content?: Array<{ type?: string; text?: string }> } };
  const text = (json.message?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
  if (!text) throw new Error("Empty response");
  return text;
}

async function callProvider(provider: ProviderId, apiKey: string, cap: Capability, system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<string> {
  const model = modelFor(provider, cap);
  switch (provider) {
    case "openrouter":
      return callOpenAiStyle("https://openrouter.ai/api/v1/chat/completions", apiKey, model, system, user, opts, { "X-Title": "EKAM Public" });
    case "nvidia":
      return callOpenAiStyle("https://integrate.api.nvidia.com/v1/chat/completions", apiKey, model, system, user, opts);
    case "groq":
      return callOpenAiStyle("https://api.groq.com/openai/v1/chat/completions", apiKey, model, system, user, opts);
    case "gemini":
      return callGemini(apiKey, model, system, user, opts);
    case "claude":
      return callClaude(apiKey, model, system, user, opts);
    case "mistral":
      return callOpenAiStyle("https://api.mistral.ai/v1/chat/completions", apiKey, model, system, user, opts);
    case "cohere":
      return callCohere(apiKey, model, system, user, opts);
    case "together":
      return callOpenAiStyle("https://api.together.xyz/v1/chat/completions", apiKey, model, system, user, opts);
    case "fireworks":
      return callOpenAiStyle("https://api.fireworks.ai/inference/v1/chat/completions", apiKey, model, system, user, opts);
    case "deepseek":
      return callOpenAiStyle("https://api.deepseek.com/chat/completions", apiKey, model, system, user, opts);
    case "xai":
      return callOpenAiStyle("https://api.x.ai/v1/chat/completions", apiKey, model, system, user, opts);
    case "huggingface":
      return callOpenAiStyle("https://router.huggingface.co/v1/chat/completions", apiKey, model, system, user, opts);
    case "fal":
      throw new Error("fal serves image generation, not chat");
  }
}

// ONE real test call to the provider with a pasted key. The room's law:
// the test is the smallest REAL chat call, never a model-list endpoint —
// a list endpoint can answer without enforcing the key (the NVIDIA
// lesson), so it proves nothing. Success means the provider itself
// accepted the key on a genuine completion; anything else is a refusal
// and nothing is stored. (OpenRouter is the one exception in shape: its
// dedicated /auth/key endpoint exists precisely to enforce a key and
// returns 401 for a refused one — it is not a model list.)
// A key test is a one-time action on whatever network the user happens
// to be on — give it a full minute before calling it unreachable, so a
// slow first connection never produces a false "could not reach".
const TEST_TIMEOUT_MS = 60000;

function oaiChatTest(url: string, apiKey: string, model: string): Promise<Response> {
  return fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1,
      temperature: 0,
    }),
  }, TEST_TIMEOUT_MS);
}

async function testProviderKey(provider: ProviderId, apiKey: string): Promise<Response> {
  switch (provider) {
    case "openrouter":
      return fetchWithTimeout("https://openrouter.ai/api/v1/auth/key", { method: "GET", headers: { Authorization: `Bearer ${apiKey}` } }, TEST_TIMEOUT_MS);
    case "nvidia":
      return oaiChatTest("https://integrate.api.nvidia.com/v1/chat/completions", apiKey, "meta/llama-3.3-70b-instruct");
    case "groq":
      return oaiChatTest("https://api.groq.com/openai/v1/chat/completions", apiKey, "llama-3.3-70b-versatile");
    case "gemini":
      return fetchWithTimeout("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "Hi" }] }],
          generationConfig: { maxOutputTokens: 1, temperature: 0 },
        }),
      }, TEST_TIMEOUT_MS);
    case "claude":
      return fetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1,
          messages: [{ role: "user", content: "Hi" }],
        }),
      }, TEST_TIMEOUT_MS);
    case "mistral":
      return oaiChatTest("https://api.mistral.ai/v1/chat/completions", apiKey, "mistral-small-latest");
    case "cohere":
      return fetchWithTimeout("https://api.cohere.com/v2/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: "command-r7b-12-2024",
          messages: [{ role: "user", content: "Hi" }],
          max_tokens: 1,
          temperature: 0,
        }),
      }, TEST_TIMEOUT_MS);
    case "together":
      return oaiChatTest("https://api.together.xyz/v1/chat/completions", apiKey, "meta-llama/Llama-3.3-70B-Instruct-Turbo");
    case "fireworks":
      return oaiChatTest("https://api.fireworks.ai/inference/v1/chat/completions", apiKey, "accounts/fireworks/models/llama-v3p3-70b-instruct");
    case "deepseek":
      return oaiChatTest("https://api.deepseek.com/chat/completions", apiKey, "deepseek-chat");
    case "xai":
      return oaiChatTest("https://api.x.ai/v1/chat/completions", apiKey, "grok-4-1-fast-non-reasoning");
    case "huggingface":
      return oaiChatTest("https://router.huggingface.co/v1/chat/completions", apiKey, "meta-llama/Llama-3.3-70B-Instruct");
    case "fal":
      // fal has no key-info or model-list endpoint that enforces a key,
      // so the smallest REAL authenticated call is a queue submission
      // for the image model itself: fal checks the key before accepting
      // the job (a bad key is refused with 401), and the submitted job
      // is the tiniest possible generation. Auth is fal's own scheme:
      // "Authorization: Key <key>".
      return fetchWithTimeout("https://queue.fal.run/fal-ai/flux/schnell", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
        body: JSON.stringify({ prompt: "a single small red dot on a plain white background", image_size: "square", num_images: 1, output_format: "jpeg" }),
      }, TEST_TIMEOUT_MS);
  }
}

// ---------------------------------------------------------------------------
// Image generation via the user's fal connection. One real call to the
// FLUX schnell endpoint on fal's synchronous host; the returned image
// bytes are downloaded and stored as an owned blob on the chat message,
// so the picture lives in the chat (with a Download link) and survives
// reopening — fal's own URLs are never rendered directly.
// ---------------------------------------------------------------------------

const FAL_IMAGE_MODEL = "fal-ai/flux/schnell";

async function generateImageFal(apiKey: string, prompt: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetchWithTimeout(`https://fal.run/${FAL_IMAGE_MODEL}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Key ${apiKey}` },
    body: JSON.stringify({ prompt, image_size: "landscape_4_3", num_images: 1, output_format: "jpeg" }),
  }, 90000);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 140)}` : ""}`);
  }
  const json = (await res.json()) as { images?: Array<{ url?: string; content_type?: string }> };
  const img = json.images?.[0];
  if (!img?.url) throw new Error("No image came back");
  const imgRes = await fetchWithTimeout(img.url, { method: "GET" }, 30000);
  if (!imgRes.ok) throw new Error(`The generated image could not be downloaded (HTTP ${imgRes.status})`);
  const bytes = new Uint8Array(await imgRes.arrayBuffer());
  if (bytes.length === 0) throw new Error("The generated image was empty");
  return { bytes, contentType: img.content_type || "image/jpeg" };
}

// Is this message asking EKAM to CREATE a picture? Needs both an image
// noun and a making verb (or a bare "a picture of …" opener), so asking
// ABOUT an image ("what is in this image?") never triggers generation.
function isImageRequest(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return false;
  if (!/\b(image|picture|photo|photograph|painting|illustration|drawing|poster|wallpaper|artwork|sketch)\b/.test(t)) return false;
  if (/\b(generate|create|make|draw|paint|design|show|imagine|produce|render|want|need|give)\b/.test(t)) return true;
  return /^(an?|the)\s+(image|picture|photo|painting|illustration|drawing|poster|wallpaper|sketch)\b/.test(t);
}

// ---------------------------------------------------------------------------
// Chat attachments ("+" attach in the composer) — the personal edition's
// proven pattern. Files are stored as blobs and kept on the message.
// Treatment by kind: photos are looked at by a vision-capable connected
// route, documents are read (text extracted and given to the pipeline),
// other files are acknowledged by name. Nothing is ever faked: a photo
// no connected route can see, and a document with no readable text, are
// both stated plainly in the reply.
// ---------------------------------------------------------------------------

type AttachmentKind = "image" | "document" | "other";
const TEXT_DOC_MIMES = new Set(["text/plain", "text/markdown", "text/csv", "application/json", "text/html"]);

function attachmentKindOf(mimeType: string, fileName: string): AttachmentKind {
  const m = mimeType.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m === "application/pdf" || TEXT_DOC_MIMES.has(m) || /\.(pdf|txt|md|csv|json|doc|docx|rtf|odt)$/i.test(fileName)) return "document";
  return "other";
}

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

// Best-effort readable text from a PDF: pull text shown by Tj/TJ operators
// in uncompressed streams (the text layer). Returns null when nothing
// readable comes out (e.g. a scanned, image-only PDF) — the caller then
// says so honestly instead of pretending to have read it.
function extractPdfText(bytes: Uint8Array): string | null {
  try {
    const raw = new TextDecoder("latin1").decode(bytes);
    const parts: string[] = [];
    const re = /\((?:\\.|[^\\()])*\)\s*Tj|\[(?:[^\]])*\]\s*TJ/g;
    for (const match of raw.matchAll(re)) {
      if (parts.join(" ").length >= 12000) break;
      const strings = match[0].match(/\((?:\\.|[^\\()])*\)/g) ?? [];
      for (const s of strings) {
        parts.push(s.slice(1, -1).replace(/\\([()\\])/g, "$1").replace(/\\n/g, " "));
      }
    }
    const text = parts.join(" ").replace(/\s+/g, " ").trim();
    return text.length >= 40 ? text.slice(0, 12000) : null;
  } catch {
    return null;
  }
}

function extractDocumentText(mimeType: string, bytes: Uint8Array): string | null {
  const m = mimeType.toLowerCase();
  if (TEXT_DOC_MIMES.has(m) || m.startsWith("text/")) {
    try {
      const text = new TextDecoder("utf-8").decode(bytes).trim();
      return text.length > 0 ? text.slice(0, 12000) : null;
    } catch { return null; }
  }
  if (m === "application/pdf") return extractPdfText(bytes);
  return null;
}

// Providers that can genuinely see an image, best first, with the vision
// model each one is called with. DeepSeek's API takes no image input, so
// it is honestly absent — a DeepSeek-only user gets the plain sentence.
const VISION_ROUTES: Array<{ provider: ProviderId; model: string }> = [
  { provider: "gemini", model: "gemini-2.5-flash" },
  { provider: "openrouter", model: "nvidia/nemotron-3.5-super-vl:free" },
  { provider: "claude", model: "claude-sonnet-4-5" },
  { provider: "xai", model: "grok-4-1-fast-non-reasoning" },
  { provider: "mistral", model: "mistral-small-latest" },
  { provider: "groq", model: "meta-llama/llama-4-scout-17b-16e-instruct" },
  { provider: "together", model: "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo" },
  { provider: "fireworks", model: "accounts/fireworks/models/llama-v3p2-11b-vision-instruct" },
  { provider: "nvidia", model: "meta/llama-3.2-90b-vision-instruct" },
  { provider: "cohere", model: "command-a-vision-07-2025" },
  { provider: "huggingface", model: "meta-llama/Llama-3.2-11B-Vision-Instruct" },
];

const VISION_PROMPT = (userMessage: string) =>
  `The user attached this photo to a chat message. Their message: "${userMessage || "(no text — just the photo)"}". Describe what is in the photo and note anything relevant to what they asked, so the assistant can discuss it with them.`;

async function describeImageVia(provider: ProviderId, apiKey: string, model: string, mimeType: string, dataBase64: string, userMessage: string): Promise<string> {
  const prompt = VISION_PROMPT(userMessage);
  const opts = { maxTokens: 800, temperature: 0.4, timeoutMs: 60000 };
  if (provider === "gemini") {
    const res = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }, { inlineData: { mimeType, data: dataBase64 } }] }],
        generationConfig: { temperature: opts.temperature, maxOutputTokens: opts.maxTokens },
      }),
    }, opts.timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("").trim();
    if (!text) throw new Error("Empty vision response");
    return text;
  }
  if (provider === "claude") {
    const res = await fetchWithTimeout("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model,
        max_tokens: opts.maxTokens,
        temperature: opts.temperature,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: dataBase64 } },
          { type: "text", text: prompt },
        ] }],
      }),
    }, opts.timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { content?: Array<{ type?: string; text?: string }> };
    const text = (json.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    if (!text) throw new Error("Empty vision response");
    return text;
  }
  if (provider === "cohere") {
    const res = await fetchWithTimeout("https://api.cohere.com/v2/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: dataBase64 } },
          { type: "text", text: prompt },
        ] }],
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
      }),
    }, opts.timeoutMs);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { message?: { content?: Array<{ type?: string; text?: string }> } };
    const text = (json.message?.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
    if (!text) throw new Error("Empty vision response");
    return text;
  }
  // OpenAI-style image part — OpenRouter, xAI, Mistral, Groq, Together,
  // Fireworks, NVIDIA and Hugging Face all accept a data-URI image_url.
  const urls: Partial<Record<ProviderId, string>> = {
    openrouter: "https://openrouter.ai/api/v1/chat/completions",
    xai: "https://api.x.ai/v1/chat/completions",
    mistral: "https://api.mistral.ai/v1/chat/completions",
    groq: "https://api.groq.com/openai/v1/chat/completions",
    together: "https://api.together.xyz/v1/chat/completions",
    fireworks: "https://api.fireworks.ai/inference/v1/chat/completions",
    nvidia: "https://integrate.api.nvidia.com/v1/chat/completions",
    huggingface: "https://router.huggingface.co/v1/chat/completions",
  };
  const url = urls[provider];
  if (!url) throw new Error("No vision route for this provider");
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...(provider === "openrouter" ? { "X-Title": "EKAM Public" } : {}) },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${dataBase64}` } },
      ] }],
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  }, opts.timeoutMs);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = (await res.json()) as OaiChatResponse;
  const text = extractOaiText(json);
  if (!text) throw new Error("Empty vision response");
  return text;
}

// Look at a photo through the user's connected vision routes, best
// first. Returns the description, or null when no connected route could
// see it — the caller states that honestly rather than faking sight.
async function describeImage(conns: Map<ProviderId, { apiKey: string; last4: string }>, mimeType: string, dataBase64: string, userMessage: string): Promise<{ text: string; provider: ProviderId } | null> {
  for (const route of VISION_ROUTES) {
    const conn = conns.get(route.provider);
    if (!conn) continue;
    try {
      const text = await describeImageVia(route.provider, conn.apiKey, route.model, mimeType, dataBase64, userMessage);
      return { text, provider: route.provider };
    } catch {
      // fall through to the next connected vision route
    }
  }
  return null;
}

function anyVisionRouteConnected(conns: Map<ProviderId, unknown>): boolean {
  return VISION_ROUTES.some((r) => conns.has(r.provider));
}

type CallOutcome = { text: string; provider: ProviderId; latencyMs: number };

// Try the capability's providers that the user has connected, reordered
// by the user's learning record (proven routes first: successes, then
// failures avoided, then speed). Providers never connected are absent.
async function callWithLearning(
  ctx: Ctx,
  userId: number,
  conns: Map<ProviderId, { apiKey: string; last4: string }>,
  cap: Capability,
  system: string,
  user: string,
  opts: { maxTokens: number; temperature: number; timeoutMs: number },
): Promise<CallOutcome> {
  const db = ctx.db<typeof schema>();
  const candidates = cap.providers.filter((p) => conns.has(p));
  if (candidates.length === 0) throw new Error("No connected provider can serve this part");
  const stats = await db
    .select()
    .from(schema.learningStats)
    .where(and(eq(schema.learningStats.userId, userId), eq(schema.learningStats.capabilityKey, cap.key)));
  const statByProvider = new Map(stats.map((s) => [s.routeClass, s]));
  const scored = candidates.map((provider, idx) => {
    const s = statByProvider.get(provider);
    return {
      provider,
      idx,
      done: s?.done ?? 0,
      failed: s?.failed ?? 0,
      avg: s && s.done > 0 ? s.totalLatencyMs / s.done : Number.POSITIVE_INFINITY,
    };
  });
  scored.sort((a, b) => {
    if (b.done !== a.done) return b.done - a.done;
    if (a.failed !== b.failed) return a.failed - b.failed;
    if (a.avg !== b.avg) return a.avg - b.avg;
    return a.idx - b.idx;
  });

  const errors: string[] = [];
  for (const attempt of scored) {
    const started = Date.now();
    try {
      const text = await callProvider(attempt.provider, conns.get(attempt.provider)!.apiKey, cap, system, user, opts);
      return { text, provider: attempt.provider, latencyMs: Date.now() - started };
    } catch (e) {
      errors.push(`${ROUTE_LABELS[attempt.provider]}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join(" · ").slice(0, 400));
}

async function recordLearning(ctx: Ctx, userId: number, capabilityKey: string, provider: ProviderId, ok: boolean, latencyMs: number): Promise<void> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.learningStats)
    .where(and(eq(schema.learningStats.userId, userId), eq(schema.learningStats.capabilityKey, capabilityKey), eq(schema.learningStats.routeClass, provider)))
    .limit(1);
  const existing = rows[0];
  if (existing) {
    await db
      .update(schema.learningStats)
      .set({
        sent: existing.sent + 1,
        done: existing.done + (ok ? 1 : 0),
        failed: existing.failed + (ok ? 0 : 1),
        totalLatencyMs: existing.totalLatencyMs + (ok ? latencyMs : 0),
      })
      .where(eq(schema.learningStats.id, existing.id));
  } else {
    await db.insert(schema.learningStats).values({
      userId,
      capabilityKey,
      routeClass: provider,
      sent: 1,
      done: ok ? 1 : 0,
      failed: ok ? 0 : 1,
      totalLatencyMs: ok ? latencyMs : 0,
    });
  }
}

// ---------------------------------------------------------------------------
// The Divider AI — plan contract, validator, repair, fallback, fast path
// ---------------------------------------------------------------------------

type PlanPart = { capability: string; title: string; instruction: string };
type Plan = { goal: string; parts: PlanPart[] };

function dividerSystem(allowedKeys: string[], cap: number): string {
  return `You are the Divider — the Boss of EKAM, a small elite team of AI specialists. Your ONLY job is to divide a task into parts and assign each part to the one specialist capability it belongs to. You never do any part of the work yourself and you never write the final answer.

Capabilities you may use (exact keys): ${allowedKeys.join(", ")}.

Rules:
- Answer with ONLY a JSON object: {"goal": "<one-line goal>", "parts": [{"capability": "<key>", "title": "<short title>", "instruction": "<self-contained instruction>"}]}
- 1 to ${cap} parts. Each part has exactly ONE capability from the list above — never use a capability that is not listed.
- Each instruction must be self-contained: the specialist sees only the goal line and its own instruction, never the other parts. Include everything that specialist needs.
- Stop parts from colliding: if one part writes the words and another builds the thing, say so in each instruction (e.g. "Do not write any code", "Leave a placeholder for the headline").
- Do not split what does not need splitting. A task that is one kind of work — a translation, a single summary, one question — is exactly ONE part.
- No text outside the JSON object.`;
}

function validatePlan(raw: unknown, allowedKeys: string[], cap: number): Plan | null {
  if (typeof raw !== "object" || raw === null) return null;
  const obj = raw as { goal?: unknown; parts?: unknown };
  if (typeof obj.goal !== "string" || !obj.goal.trim()) return null;
  if (!Array.isArray(obj.parts) || obj.parts.length < 1 || obj.parts.length > cap) return null;
  const allowed = new Set(allowedKeys);
  const parts: PlanPart[] = [];
  for (const p of obj.parts) {
    if (typeof p !== "object" || p === null) return null;
    const part = p as { capability?: unknown; title?: unknown; instruction?: unknown };
    if (typeof part.capability !== "string" || !allowed.has(part.capability)) return null;
    if (typeof part.instruction !== "string" || !part.instruction.trim()) return null;
    parts.push({
      capability: part.capability,
      title: typeof part.title === "string" && part.title.trim() ? part.title.trim().slice(0, 80) : "Part",
      instruction: part.instruction.trim(),
    });
  }
  return { goal: obj.goal.trim().slice(0, 300), parts };
}

function parsePlanText(text: string, allowedKeys: string[], cap: number): Plan | null {
  let cleaned = text.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) cleaned = fence[1].trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) cleaned = cleaned.slice(start, end + 1);
  try {
    return validatePlan(JSON.parse(cleaned), allowedKeys, cap);
  } catch {
    return null;
  }
}

// Fast path: a simple message is answered directly, with no divider call
// at all. Short single-intent messages go straight to the one seat that
// fits; anything project-sized divides properly.
function fastPathPlan(task: string, allowedKeys: string[]): Plan | null {
  const t = task.trim();
  if (t.length > 220) return null;
  const lower = t.toLowerCase();
  const patterns: Array<{ re: RegExp; capability: string; title: string }> = [
    { re: /^(translate|translation of)\b/, capability: "translation", title: "Translate" },
    { re: /\btranslate\b.*\b(to|into)\b/, capability: "translation", title: "Translate" },
    { re: /^(summarise|summarize|summary of)\b/, capability: "research", title: "Summarise" },
    { re: /^(explain|what is|what are|who is|define)\b/, capability: "general", title: "Answer" },
  ];
  for (const p of patterns) {
    if (p.re.test(lower)) {
      if (!allowedKeys.includes(p.capability)) return null;
      return { goal: t, parts: [{ capability: p.capability, title: p.title, instruction: t }] };
    }
  }
  // A short, plainly single ask: one everyday answer, straight from the
  // best connected seat for everyday questions.
  if (t.length <= 140 && !/\b(and also|as well as|plus a|build|create|design|develop|website|app|plan for)\b/.test(lower)) {
    const capKey = allowedKeys.includes("general") ? "general" : null;
    if (capKey) return { goal: t, parts: [{ capability: capKey, title: "Answer", instruction: t }] };
  }
  return null;
}

const DIVIDER_CAP: Capability = CAP_BY_KEY.get("planning") ?? CAPABILITIES[0]!;

async function divideTask(ctx: Ctx, userId: number, conns: Map<ProviderId, { apiKey: string; last4: string }>, task: string, settings: AdjustSettings): Promise<{ plan: Plan; note: string }> {
  const allowedKeys = settings.seats;
  const cap = partCapFor(settings);
  const budgets = budgetsFor(settings);
  const system = dividerSystem(allowedKeys, cap);

  const fast = fastPathPlan(task, allowedKeys);
  if (fast) return { plan: fast, note: "Simple message — answered directly by the best connected seat, no division needed." };

  const first = await callWithLearning(ctx, userId, conns, DIVIDER_CAP, system, `Task to divide:\n\n${task}`, {
    maxTokens: budgets.dividerTokens,
    temperature: 0.3,
    timeoutMs: 30000,
  });
  const plan = parsePlanText(first.text, allowedKeys, cap);
  if (plan) return { plan, note: `Divided by the Divider AI via ${ROUTE_LABELS[first.provider]} in ${(first.latencyMs / 1000).toFixed(1)}s.` };

  const repair = await callWithLearning(
    ctx,
    userId,
    conns,
    DIVIDER_CAP,
    system,
    `Task to divide:\n\n${task}\n\nYour previous answer was not valid — it may have used a capability that is switched off, or more parts than allowed. Answer again with ONLY the JSON object in the exact contract: {"goal": "...", "parts": [{"capability": "<one of: ${allowedKeys.join(", ")}>", "title": "...", "instruction": "..."}]} with 1-${cap} parts.`,
    { maxTokens: budgets.dividerTokens, temperature: 0.2, timeoutMs: 30000 },
  );
  const repaired = parsePlanText(repair.text, allowedKeys, cap);
  if (repaired) return { plan: repaired, note: `Divided by the Divider AI via ${ROUTE_LABELS[repair.provider]} in ${(repair.latencyMs / 1000).toFixed(1)}s (plan repaired once by the validator).` };

  const fallbackKey = allowedKeys.includes("general") ? "general" : allowedKeys[0]!;
  return {
    plan: { goal: task, parts: [{ capability: fallbackKey, title: "Complete the task", instruction: task }] },
    note: "The divider's plan failed validation twice, so EKAM used the safe one-part fallback — the whole task went to one specialist that is switched on.",
  };
}

const COMBINE_SYSTEM = `You are the Divider of EKAM, finishing a job you divided. Specialists have each completed one part of the task. Weave their parts into ONE final result for the user: complete, well-structured, no part boundaries showing, no mention of parts, specialists, routes or process. If a part failed, work gracefully with what exists and do not invent what is missing.`;

async function combineParts(ctx: Ctx, userId: number, conns: Map<ProviderId, { apiKey: string; last4: string }>, task: string, plan: Plan, parts: Array<{ capabilityLabel: string; title: string; output: string | null }>, settings: AdjustSettings): Promise<{ text: string; note: string }> {
  const done = parts.filter((p) => p.output);
  if (done.length === 1 && parts.length === 1) {
    return { text: done[0]!.output!, note: "Single part — the specialist's answer is the reply, no combine needed." };
  }
  const budgets = budgetsFor(settings);
  const user = `Original task:\n${task}\n\nGoal: ${plan.goal}\n\nParts brought back:\n\n${done.map((p, i) => `--- Part ${i + 1} (${p.capabilityLabel}: ${p.title}) ---\n${p.output}`).join("\n\n")}\n\n${thinkingNote(settings.thinking)}\n${lengthNote(settings.length)}\n\nWrite the one final result.`;
  const res = await callWithLearning(ctx, userId, conns, DIVIDER_CAP, COMBINE_SYSTEM, user, {
    maxTokens: budgets.combineTokens,
    temperature: 0.5,
    timeoutMs: 60000,
  });
  return { text: res.text, note: `Combined by the Divider AI via ${ROUTE_LABELS[res.provider]} in ${(res.latencyMs / 1000).toFixed(1)}s.` };
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

const teamSeat = z.object({
  key: z.string(),
  label: z.string(),
  servedBy: z.enum(["connection", "platform", "fal"]),
  state: z.enum(["connected", "platform_soon", "not_connected"]),
});

const providerSlot = z.object({
  provider: z.string(),
  name: z.string(),
  keyUrl: z.string(),
  keyHint: z.string(),
  purpose: z.enum(["chat", "image"]),
  note: z.string().nullable(),
  connected: z.boolean(),
  last4: z.string().nullable(),
});

const meResponse = z.object({
  signedIn: z.boolean(),
  user: z.object({ name: z.string(), email: z.string() }).nullable(),
  connected: z.boolean(),
  connectedCount: z.number(),
  providers: z.array(providerSlot),
  team: z.array(teamSeat),
});

const runSettingsShape = z.object({
  seats: z.array(z.string()),
  seatLabels: z.array(z.string()),
  howMany: z.number(),
  thinking: z.string(),
  length: z.string(),
});

const runShape = z.object({
  id: z.number(),
  task: z.string(),
  goal: z.string().nullable(),
  status: z.string(),
  dividerNote: z.string().nullable(),
  combinerNote: z.string().nullable(),
  settings: runSettingsShape.nullable(),
  finalResult: z.string().nullable(),
  totalLatencyMs: z.number().nullable(),
  createdAt: z.string(),
  parts: z.array(
    z.object({
      id: z.number(),
      capabilityKey: z.string(),
      capabilityLabel: z.string(),
      title: z.string(),
      instruction: z.string(),
      status: z.string(),
      output: z.string().nullable(),
      routeLabel: z.string().nullable(),
      latencyMs: z.number().nullable(),
      errorNote: z.string().nullable(),
    }),
  ),
});

type MeOut = z.infer<typeof meResponse>;

function providerSlots(conns: Map<ProviderId, { apiKey: string; last4: string }>): z.infer<typeof providerSlot>[] {
  return PROVIDERS.map((p) => ({
    provider: p.id,
    name: p.name,
    keyUrl: p.keyUrl,
    keyHint: p.keyHint,
    purpose: p.purpose === "image" ? ("image" as const) : ("chat" as const),
    note: p.note ?? null,
    connected: conns.has(p.id),
    last4: conns.get(p.id)?.last4 ?? null,
  }));
}

async function buildMe(ctx: Ctx, user: { id: number; name: string; email: string } | null): Promise<MeOut> {
  const conns = user ? await connectionsFor(ctx, user.id) : new Map<ProviderId, { apiKey: string; last4: string }>();
  return {
    signedIn: !!user,
    user: user ? { name: user.name, email: user.email } : null,
    connected: conns.size > 0,
    connectedCount: conns.size,
    providers: providerSlots(conns),
    team: CAPABILITIES.map((c) => ({
      key: c.key,
      label: c.label,
      servedBy: c.servedBy,
      state: c.servedBy === "platform" ? ("platform_soon" as const) : seatServable(c, conns) ? ("connected" as const) : ("not_connected" as const),
    })),
  };
}

const adjustResponse = z.object({
  seats: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      servedBy: z.enum(["connection", "platform", "fal"]),
      state: z.enum(["connected", "platform_soon", "not_connected"]),
      on: z.boolean(),
    }),
  ),
  howMany: z.number(),
  thinking: z.enum(["light", "standard", "deep"]),
  length: z.enum(["brief", "balanced", "detailed"]),
});

type AdjustOut = z.infer<typeof adjustResponse>;

async function buildAdjust(ctx: Ctx, user: { id: number }): Promise<AdjustOut> {
  const conns = await connectionsFor(ctx, user.id);
  const settings = await loadAdjust(ctx, user.id);
  const onSet = new Set(settings.seats);
  return {
    seats: CAPABILITIES.map((c) => {
      const servable = seatServable(c, conns);
      return {
        key: c.key,
        label: c.label,
        servedBy: c.servedBy,
        state: c.servedBy === "platform" ? ("platform_soon" as const) : servable ? ("connected" as const) : ("not_connected" as const),
        // A seat whose provider is not connected can never be on. The
        // image seat is not a divider toggle — it is simply available
        // while fal is connected, so its "on" mirrors availability.
        on: c.servedBy === "fal" ? servable : servable && onSet.has(c.key),
      };
    }),
    howMany: settings.howMany,
    thinking: settings.thinking,
    length: settings.length,
  };
}

function settingsSummaryLine(s: AdjustSettings): string {
  const labels = s.seats.map((k) => CAP_BY_KEY.get(k)?.label ?? k).join(", ");
  return `Adjust settings for this run — seats on: ${labels || "none"} · up to ${partCapFor(s)} specialist${partCapFor(s) === 1 ? "" : "s"} (How many: ${s.howMany}) · thinking: ${s.thinking} · answer length: ${s.length}.`;
}

async function loadRun(ctx: Ctx, runId: number, userId: number): Promise<z.infer<typeof runShape> | null> {
  const db = ctx.db<typeof schema>();
  const rows = await db.select().from(schema.runs).where(and(eq(schema.runs.id, runId), eq(schema.runs.userId, userId))).limit(1);
  const run = rows[0];
  if (!run) return null;
  const partRows = await db.select().from(schema.runParts).where(eq(schema.runParts.runId, runId)).orderBy(asc(schema.runParts.orderIndex));
  let runSettings: z.infer<typeof runSettingsShape> | null = null;
  if (run.settingsJson) {
    try {
      const parsed = JSON.parse(run.settingsJson) as { seats?: unknown; howMany?: unknown; thinking?: unknown; length?: unknown };
      const seatKeys = Array.isArray(parsed.seats) ? parsed.seats.filter((k): k is string => typeof k === "string") : [];
      runSettings = {
        seats: seatKeys,
        seatLabels: seatKeys.map((k) => CAP_BY_KEY.get(k)?.label ?? k),
        howMany: typeof parsed.howMany === "number" ? parsed.howMany : 5,
        thinking: typeof parsed.thinking === "string" ? parsed.thinking : "standard",
        length: typeof parsed.length === "string" ? parsed.length : "balanced",
      };
    } catch { runSettings = null; }
  }
  return {
    id: run.id,
    task: run.task,
    goal: run.goal,
    status: run.status,
    dividerNote: run.dividerNote,
    combinerNote: run.combinerNote,
    settings: runSettings,
    finalResult: run.finalResult,
    totalLatencyMs: run.totalLatencyMs,
    createdAt: run.createdAt.toISOString(),
    parts: partRows.map((p) => ({
      id: p.id,
      capabilityKey: p.capabilityKey,
      capabilityLabel: p.capabilityLabel,
      title: p.title,
      instruction: p.instruction,
      status: p.status,
      output: p.output,
      routeLabel: p.routeLabel,
      latencyMs: p.latencyMs,
      errorNote: p.errorNote,
    })),
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export const Actions = {
  getMe: defineAction({
    request: z.object({ token: z.string().max(200).optional() }),
    response: meResponse,
    async handler(ctx, args): Promise<MeOut> {
      const user = await userForToken(ctx, args.token);
      return buildMe(ctx, user);
    },
  }),

  signUp: defineAction({
    request: z.object({ name: z.string().trim().min(1).max(80), email: z.string().trim().email().max(160) }),
    response: z.object({ ok: z.boolean(), token: z.string().nullable(), message: z.string() }),
    async handler(ctx, args) {
      const db = ctx.db<typeof schema>();
      const email = args.email.toLowerCase();
      const existing = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      let userId: number;
      if (existing[0]) {
        userId = existing[0].id;
        if (existing[0].name !== args.name) {
          await db.update(schema.users).set({ name: args.name }).where(eq(schema.users.id, userId));
        }
      } else {
        const inserted = await db.insert(schema.users).values({ name: args.name, email }).returning({ id: schema.users.id });
        userId = inserted[0]!.id;
      }
      const raw = base64Url(crypto.getRandomValues(new Uint8Array(32)));
      const tokenHash = await sha256Hex(raw);
      await db.insert(schema.sessions).values({ userId, tokenHash });
      ctx.invalidateQueries();
      return {
        ok: true,
        token: raw,
        message: existing[0] ? "Welcome back — you're signed in to your EKAM account." : "Your EKAM account is created and you're signed in.",
      };
    },
  }),

  signOut: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ ok: z.literal(true) }),
    async handler(ctx, args): Promise<{ ok: true }> {
      const db = ctx.db<typeof schema>();
      const hash = await sha256Hex(args.token);
      await db.delete(schema.sessions).where(eq(schema.sessions.tokenHash, hash));
      ctx.invalidateQueries();
      return { ok: true };
    },
  }),

  // --- Developer setup: the per-user key room ------------------------------
  // Each slot: paste a key the user created on that provider's own site.
  // The server makes ONE real test call with it; the key is stored ONLY
  // if the provider accepts it. A refusal stores nothing.

  getDeveloperSetup: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ providers: z.array(providerSlot), connectedCount: z.number() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { providers: providerSlots(new Map()), connectedCount: 0 };
      const conns = await connectionsFor(ctx, user.id);
      return { providers: providerSlots(conns), connectedCount: conns.size };
    },
  }),

  saveProviderKey: defineAction({
    request: z.object({ token: z.string().min(1).max(200), provider: z.enum(["openrouter", "nvidia", "groq", "gemini", "claude", "mistral", "cohere", "together", "fireworks", "deepseek", "xai", "huggingface", "fal"]), apiKey: z.string().max(500) }),
    response: z.object({ ok: z.boolean(), last4: z.string().nullable(), message: z.string() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, last4: null, message: "Please sign in first, then paste your key." };
      const def = PROVIDER_BY_ID.get(args.provider)!;
      const apiKey = args.apiKey.trim();
      if (!apiKey) {
        return { ok: false, last4: null, message: `The blank is empty — paste your ${def.name} key in first, then tap Save.` };
      }
      if (/\s/.test(apiKey) || apiKey.length < 10) {
        return { ok: false, last4: null, message: `That doesn't look like a ${def.name} key — keys are one long unbroken string. Copy the whole key on ${def.name}'s page and paste it again.` };
      }
      if (args.provider === "openrouter" && !apiKey.startsWith("sk-or-")) {
        return { ok: false, last4: null, message: "That doesn't look like an OpenRouter key — real keys begin with “sk-or-”. Copy the whole key on OpenRouter's page and paste it again." };
      }
      let res: Response;
      try {
        res = await testProviderKey(args.provider, apiKey);
      } catch (e) {
        return { ok: false, last4: null, message: `Could not reach ${def.name} to test your key: ${e instanceof Error ? e.message.slice(0, 160) : "network error"}. Nothing was saved — try again.` };
      }
      if (!res.ok) {
        await res.text().catch(() => "");
        return { ok: false, last4: null, message: `${def.name} didn't accept this key — check you copied the whole key and try again.` };
      }
      const db = ctx.db<typeof schema>();
      const last4 = apiKey.slice(-4);
      const existing = await db
        .select()
        .from(schema.connections)
        .where(and(eq(schema.connections.userId, user.id), eq(schema.connections.provider, args.provider)))
        .limit(1);
      if (existing[0]) {
        await db.update(schema.connections).set({ apiKey, last4 }).where(eq(schema.connections.id, existing[0].id));
      } else {
        await db.insert(schema.connections).values({ userId: user.id, provider: args.provider, apiKey, last4 });
      }
      ctx.invalidateQueries();
      return { ok: true, last4, message: `Connected — your ${def.name} key passed a live test and is stored safely on the server (only ····${last4} is ever shown).` };
    },
  }),

  disconnectProvider: defineAction({
    request: z.object({ token: z.string().min(1).max(200), provider: z.enum(["openrouter", "nvidia", "groq", "gemini", "claude", "mistral", "cohere", "together", "fireworks", "deepseek", "xai", "huggingface", "fal"]) }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, message: "Please sign in first." };
      const def = PROVIDER_BY_ID.get(args.provider)!;
      const db = ctx.db<typeof schema>();
      await db.delete(schema.connections).where(and(eq(schema.connections.userId, user.id), eq(schema.connections.provider, args.provider)));
      ctx.invalidateQueries();
      return { ok: true, message: `Disconnected — your ${def.name} key was removed from EKAM's server. (The key itself still exists on your ${def.name} account; you can revoke it there any time.)` };
    },
  }),

  // --- Adjust ---------------------------------------------------------------

  getAdjust: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: adjustResponse,
    async handler(ctx, args): Promise<AdjustOut> {
      const user = await userForToken(ctx, args.token);
      if (!user) {
        return {
          seats: CAPABILITIES.map((c) => ({
            key: c.key,
            label: c.label,
            servedBy: c.servedBy,
            state: c.servedBy === "platform" ? ("platform_soon" as const) : ("not_connected" as const),
            on: false,
          })),
          howMany: DEFAULT_ADJUST.howMany,
          thinking: DEFAULT_ADJUST.thinking,
          length: DEFAULT_ADJUST.length,
        };
      }
      return buildAdjust(ctx, user);
    },
  }),

  saveAdjust: defineAction({
    request: z.object({
      token: z.string().min(1).max(200),
      seats: z.array(z.string().max(40)).max(24),
      howMany: z.number().int().min(1).max(24),
      thinking: z.enum(["light", "standard", "deep"]),
      length: z.enum(["brief", "balanced", "detailed"]),
    }),
    response: z.object({ ok: z.boolean(), message: z.string(), adjust: adjustResponse.nullable() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, message: "Please sign in first.", adjust: null };
      const conns = await connectionsFor(ctx, user.id);
      const settings = normalizeAdjust({ seats: args.seats, howMany: args.howMany, thinking: args.thinking, length: args.length });
      // A seat whose provider is not connected cannot be switched on —
      // enforce it here too, not just in the panel.
      settings.seats = settings.seats.filter((k) => {
        const cap = CAP_BY_KEY.get(k);
        return cap ? seatServable(cap, conns) : false;
      });
      if (settings.seats.length === 0 && conns.size > 0) {
        return { ok: false, message: "At least one seat must stay on — a reply needs at least one specialist.", adjust: null };
      }
      await saveAdjustRow(ctx, user.id, settings);
      ctx.invalidateQueries();
      return { ok: true, message: "Saved — these settings govern your next message.", adjust: await buildAdjust(ctx, user) };
    },
  }),

  // --- Simple chat ----------------------------------------------------------
  // The chat is the whole stage. sendMessage appends the user's message
  // first (it is theirs the moment they send it), then the engine runs
  // invisibly — direct answer for a simple message, Divider pipeline for
  // a project-sized ask — and the reply lands as one assistant message.

  listChats: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({
      chats: z.array(z.object({ id: z.number(), title: z.string(), createdAt: z.string(), messageCount: z.number() })),
    }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { chats: [] };
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.chats).where(eq(schema.chats.userId, user.id)).orderBy(desc(schema.chats.id)).limit(60);
      const out: Array<{ id: number; title: string; createdAt: string; messageCount: number }> = [];
      for (const c of rows) {
        const msgs = await db.select({ id: schema.chatMessages.id }).from(schema.chatMessages).where(eq(schema.chatMessages.chatId, c.id));
        out.push({ id: c.id, title: c.title, createdAt: c.createdAt.toISOString(), messageCount: msgs.length });
      }
      return { chats: out };
    },
  }),

  createChat: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ ok: z.boolean(), chatId: z.number().nullable() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, chatId: null };
      const db = ctx.db<typeof schema>();
      const inserted = await db.insert(schema.chats).values({ userId: user.id, title: "New chat" }).returning({ id: schema.chats.id });
      ctx.invalidateQueries();
      return { ok: true, chatId: inserted[0]!.id };
    },
  }),

  // Delete one of the user's own chats — its messages and attachment
  // rows go with it. Scoped to the signed-in user like everything else.
  deleteChat: defineAction({
    request: z.object({ token: z.string().min(1).max(200), chatId: z.number().int().positive() }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, message: "Please sign in first." };
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.chats).where(and(eq(schema.chats.id, args.chatId), eq(schema.chats.userId, user.id))).limit(1);
      if (!rows[0]) return { ok: false, message: "That chat could not be found in your history." };
      await db.delete(schema.chatAttachments).where(eq(schema.chatAttachments.chatId, args.chatId));
      await db.delete(schema.chatMessages).where(eq(schema.chatMessages.chatId, args.chatId));
      await db.delete(schema.chats).where(eq(schema.chats.id, args.chatId));
      ctx.invalidateQueries();
      return { ok: true, message: "Chat deleted." };
    },
  }),

  getChat: defineAction({
    request: z.object({ token: z.string().min(1).max(200), chatId: z.number().int().positive() }),
    response: z.object({
      chat: z
        .object({
          id: z.number(),
          title: z.string(),
          messages: z.array(
            z.object({
              id: z.number(),
              role: z.string(),
              content: z.string(),
              runId: z.number().nullable(),
              createdAt: z.string(),
              attachments: z.array(
                z.object({
                  id: z.number(),
                  fileName: z.string(),
                  mimeType: z.string(),
                  kind: z.string(),
                  sizeBytes: z.number(),
                  url: z.string(),
                }),
              ),
            }),
          ),
        })
        .nullable(),
    }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { chat: null };
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.chats).where(and(eq(schema.chats.id, args.chatId), eq(schema.chats.userId, user.id))).limit(1);
      const chat = rows[0];
      if (!chat) return { chat: null };
      const msgs = await db.select().from(schema.chatMessages).where(eq(schema.chatMessages.chatId, chat.id)).orderBy(asc(schema.chatMessages.id));
      const attRows = await db.select().from(schema.chatAttachments).where(eq(schema.chatAttachments.chatId, chat.id)).orderBy(asc(schema.chatAttachments.id));
      const attsByMsg = new Map<number, Array<{ id: number; fileName: string; mimeType: string; kind: string; sizeBytes: number; url: string }>>();
      for (const a of attRows) {
        const list = attsByMsg.get(a.messageId) ?? [];
        list.push({ id: a.id, fileName: a.fileName, mimeType: a.mimeType, kind: a.kind, sizeBytes: a.sizeBytes, url: await ctx.blobs.getUrl(a.blobKey) });
        attsByMsg.set(a.messageId, list);
      }
      return {
        chat: {
          id: chat.id,
          title: chat.title,
          messages: msgs.map((m) => ({ id: m.id, role: m.role, content: m.content, runId: m.runId, createdAt: m.createdAt.toISOString(), attachments: attsByMsg.get(m.id) ?? [] })),
        },
      };
    },
  }),

  sendMessage: defineAction({
    request: z.object({
      token: z.string().min(1).max(200),
      chatId: z.number().int().positive().nullable(),
      content: z.string().trim().max(4000),
      attachments: z
        .array(z.object({ fileName: z.string().min(1).max(200), mimeType: z.string().max(120), dataBase64: z.string().max(6000000) }))
        .max(4)
        .optional(),
    }),
    response: z.object({ ok: z.boolean(), chatId: z.number().nullable(), message: z.string() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, chatId: null, message: "Please sign in first." };
      const incomingAtts = args.attachments ?? [];
      if (!args.content && incomingAtts.length === 0) {
        return { ok: false, chatId: args.chatId, message: "Write a message or attach a file first." };
      }
      const conns = await connectionsFor(ctx, user.id);
      if (conns.size === 0) {
        return { ok: false, chatId: args.chatId, message: "Add a key in Developer setup and EKAM is ready to work." };
      }
      const db = ctx.db<typeof schema>();
      const titleSource = args.content || incomingAtts[0]?.fileName || "New chat";

      // The chat itself — created on the first message if needed.
      let chatId = args.chatId;
      if (chatId != null) {
        const rows = await db.select().from(schema.chats).where(and(eq(schema.chats.id, chatId), eq(schema.chats.userId, user.id))).limit(1);
        if (!rows[0]) chatId = null;
      }
      if (chatId == null) {
        const title = titleSource.length > 60 ? `${titleSource.slice(0, 60)}…` : titleSource;
        const inserted = await db.insert(schema.chats).values({ userId: user.id, title }).returning({ id: schema.chats.id });
        chatId = inserted[0]!.id;
      } else {
        const existingMsgs = await db.select({ id: schema.chatMessages.id }).from(schema.chatMessages).where(eq(schema.chatMessages.chatId, chatId)).limit(1);
        if (existingMsgs.length === 0) {
          const title = titleSource.length > 60 ? `${titleSource.slice(0, 60)}…` : titleSource;
          await db.update(schema.chats).set({ title }).where(eq(schema.chats.id, chatId));
        }
      }

      // The user's message is stored the moment they send it — it is
      // never lost, whatever the engine does next.
      const userMsgIns = await db.insert(schema.chatMessages).values({ chatId, role: "user", content: args.content }).returning({ id: schema.chatMessages.id });
      const userMessageId = userMsgIns[0]!.id;
      ctx.invalidateQueries();

      // Image asks take their own road — straight to the user's fal
      // connection, never through the text divider. Only when the
      // message carries no attachments (an attached photo means the
      // user is asking ABOUT a picture, not for a new one).
      if (incomingAtts.length === 0 && isImageRequest(args.content)) {
        const falConn = conns.get("fal");
        if (!falConn) {
          await db.insert(schema.chatMessages).values({
            chatId,
            role: "assistant",
            content: "I can't make images yet — image generation needs fal.ai connected. Open Developer setup, paste your key in the fal.ai slot (the one marked “For image generation”), and once it shows Connected, ask me again and your picture will appear right here.",
          });
          ctx.invalidateQueries();
          return { ok: true, chatId, message: "Image generation isn't connected yet — the reply in the chat explains how to connect it." };
        }
        try {
          const { bytes, contentType } = await generateImageFal(falConn.apiKey, args.content);
          const ext = contentType.includes("png") ? "png" : "jpg";
          const replyIns = await db
            .insert(schema.chatMessages)
            .values({ chatId, role: "assistant", content: "Here's your picture — made fresh for you just now. Use Download to keep it." })
            .returning({ id: schema.chatMessages.id });
          const assistantMessageId = replyIns[0]!.id;
          const blobKey = `chat-generated/${chatId}/${assistantMessageId}-image.${ext}`;
          await ctx.blobs.put(blobKey, bytes, { contentType });
          await db.insert(schema.chatAttachments).values({
            messageId: assistantMessageId,
            chatId,
            userId: user.id,
            fileName: `ekam-image.${ext}`,
            mimeType: contentType,
            kind: "image",
            sizeBytes: bytes.length,
            blobKey,
            extractedText: null,
          });
          ctx.invalidateQueries();
          return { ok: true, chatId, message: "Done — your picture is in the chat." };
        } catch {
          await db.insert(schema.chatMessages).values({
            chatId,
            role: "assistant",
            content: "I couldn't make that picture just now — fal didn't complete the generation (this usually means the fal account is out of credit, or fal hit an error), and no image was made.",
          });
          ctx.invalidateQueries();
          return { ok: true, chatId, message: "Image generation didn't go through — the reply in the chat says so honestly." };
        }
      }

      // Attachments: store the bytes as blobs with a metadata row on the
      // message, and build the context the pipeline works from — photos
      // looked at by a connected vision route, documents read, other
      // files acknowledged by name. Anything that could not be read or
      // seen earns one honest sentence appended to the reply itself, so
      // it is never left to chance.
      let attachmentContext = "";
      const honestNotes: string[] = [];
      if (incomingAtts.length > 0) {
        const contextParts: string[] = [];
        const visionAvailable = anyVisionRouteConnected(conns);
        for (const att of incomingAtts) {
          const bytes = base64ToBytes(att.dataBase64);
          const kind = attachmentKindOf(att.mimeType, att.fileName);
          const safeName = att.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
          const blobKey = `chat-attachments/${chatId}/${userMessageId}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
          await ctx.blobs.put(blobKey, bytes, { contentType: att.mimeType || "application/octet-stream" });
          let extractedText: string | null = null;
          if (kind === "image") {
            if (att.mimeType === "image/jpeg" || att.mimeType === "image/png" || att.mimeType === "image/webp") {
              const seen = visionAvailable ? await describeImage(conns, att.mimeType, att.dataBase64, args.content) : null;
              if (seen) {
                extractedText = seen.text;
                contextParts.push(`[Attached photo "${att.fileName}" — this is what it shows: ${seen.text}]`);
              } else if (visionAvailable) {
                contextParts.push(`[Attached photo "${att.fileName}" — it is saved with this message, but the vision route could not view it just now; be honest about that if asked about its contents.]`);
                honestNotes.push(`I couldn't view the photo “${att.fileName}” just now — the vision route didn't answer. It is saved with your message.`);
              } else {
                contextParts.push(`[Attached photo "${att.fileName}" — it is saved with this message, but none of the user's connected providers can read images, so you cannot see it. Do not guess or invent what it shows.]`);
                honestNotes.push(`I can't look at the photo “${att.fileName}” — none of the providers you've connected can read images. Connect Gemini, OpenRouter, Claude or xAI (Grok) in Developer setup and I'll be able to see photos.`);
              }
            } else {
              contextParts.push(`[Attached photo "${att.fileName}" — saved with this message; this image type can't be viewed in EKAM.]`);
              honestNotes.push(`The photo “${att.fileName}” is saved with your message, but that image type can't be viewed here — a JPG or PNG works.`);
            }
          } else if (kind === "document") {
            const text = extractDocumentText(att.mimeType, bytes);
            if (text) {
              extractedText = text;
              contextParts.push(`[Attached document "${att.fileName}" — its content follows; answer from it:\n${text}]`);
            } else {
              contextParts.push(`[Attached document "${att.fileName}" — it is saved with this message, but no readable text could be extracted from it; be honest about that if asked about its contents.]`);
              honestNotes.push(`I couldn't read any text from “${att.fileName}” — it may be a scanned or image-only document with no text layer. It is saved with your message.`);
            }
          } else {
            contextParts.push(`[Attached file "${att.fileName}" (${att.mimeType || "unknown type"}) — it is saved with this message. Acknowledge it by name; you cannot open this type.]`);
          }
          await db.insert(schema.chatAttachments).values({
            messageId: userMessageId,
            chatId,
            userId: user.id,
            fileName: att.fileName,
            mimeType: att.mimeType,
            kind,
            sizeBytes: bytes.length,
            blobKey,
            extractedText,
          });
        }
        attachmentContext = contextParts.join("\n\n");
      }
      const taskForEngine = attachmentContext
        ? `${args.content || "Please look at what I attached and answer from it."}\n\nMaterial the user attached to this message — treat it as source material for dividing and doing the work:\n${attachmentContext}`
        : args.content;

      // Adjust governs this reply; only seats a connected provider can
      // serve may work.
      const loaded = await loadAdjust(ctx, user.id);
      const settings: AdjustSettings = {
        ...loaded,
        seats: loaded.seats.filter((k) => {
          const cap = CAP_BY_KEY.get(k);
          return cap ? seatServable(cap, conns) : false;
        }),
      };
      if (settings.seats.length === 0) {
        settings.seats = DIVIDER_KEYS.filter((k) => {
          const cap = CAP_BY_KEY.get(k);
          return cap ? seatServable(cap, conns) : false;
        });
      }
      const budgets = budgetsFor(settings);
      const settingsSnapshot = JSON.stringify({ seats: settings.seats, howMany: settings.howMany, thinking: settings.thinking, length: settings.length });
      const startedAll = Date.now();

      const insertedRun = await db
        .insert(schema.runs)
        .values({ userId: user.id, task: args.content || incomingAtts.map((a) => a.fileName).join(", "), status: "running", settingsJson: settingsSnapshot })
        .returning({ id: schema.runs.id });
      const runId = insertedRun[0]!.id;

      const failReply = async (note: string, combinerNote: string): Promise<{ ok: boolean; chatId: number; message: string }> => {
        await db.update(schema.runs).set({ status: "failed", combinerNote, totalLatencyMs: Date.now() - startedAll }).where(eq(schema.runs.id, runId));
        await db.insert(schema.chatMessages).values({ chatId: chatId!, role: "assistant", content: note, runId });
        ctx.invalidateQueries();
        return { ok: true, chatId, message: "The reply could not be completed — the honest details are in “How this was made”." };
      };

      try {
        // 1. Divide (or answer directly, on the fast path). The engine
        //    sees the attachment context as source material.
        const { plan, note } = await divideTask(ctx, user.id, conns, taskForEngine, settings);
        await db
          .update(schema.runs)
          .set({ goal: plan.goal, planJson: JSON.stringify(plan), dividerNote: `${note} ${settingsSummaryLine(settings)}` })
          .where(eq(schema.runs.id, runId));

        const partRows: Array<{ id: number; cap: Capability; part: PlanPart }> = [];
        for (let i = 0; i < plan.parts.length; i++) {
          const part = plan.parts[i]!;
          const cap = CAP_BY_KEY.get(part.capability) ?? DIVIDER_CAP;
          const r = await db
            .insert(schema.runParts)
            .values({ runId, orderIndex: i, capabilityKey: cap.key, capabilityLabel: cap.label, title: part.title, instruction: part.instruction, status: "pending" })
            .returning({ id: schema.runParts.id });
          partRows.push({ id: r[0]!.id, cap, part });
        }

        // 2. Dispatch in parallel across the connected providers — each
        //    specialist sees only the goal line and its own instruction.
        const results = await Promise.all(
          partRows.map(async ({ id, cap, part }) => {
            const userMsg = `Goal: ${plan.goal}\n\nYour part: ${part.instruction}${attachmentContext ? `\n\nMaterial the user attached to this message (read by the system from their files — use what applies to your part):\n${attachmentContext.slice(0, 6000)}` : ""}\n\n${thinkingNote(settings.thinking)}\n${lengthNote(settings.length)}`;
            try {
              const out = await callWithLearning(ctx, user.id, conns, cap, cap.system, userMsg, {
                maxTokens: budgets.partTokens,
                temperature: budgets.temperature,
                timeoutMs: 45000,
              });
              await recordLearning(ctx, user.id, cap.key, out.provider, true, out.latencyMs);
              await db
                .update(schema.runParts)
                .set({ status: "done", output: out.text, routeLabel: ROUTE_LABELS[out.provider], latencyMs: out.latencyMs })
                .where(eq(schema.runParts.id, id));
              return { capabilityLabel: cap.label, title: part.title, output: out.text as string | null };
            } catch (e) {
              const msg = e instanceof Error ? e.message.slice(0, 300) : "failed";
              const firstProvider = cap.providers.find((p) => conns.has(p));
              if (firstProvider) await recordLearning(ctx, user.id, cap.key, firstProvider, false, 0);
              await db.update(schema.runParts).set({ status: "failed", errorNote: msg }).where(eq(schema.runParts.id, id));
              return { capabilityLabel: cap.label, title: part.title, output: null as string | null };
            }
          }),
        );

        const doneCount = results.filter((r) => r.output).length;
        if (doneCount === 0) {
          return failReply(
            "I couldn't get an answer this time — every connected route failed. Check in Developer setup that your key is still accepted, then try again.",
            "Every specialist call failed through your connected providers.",
          );
        }

        // 3. Auto-combine into one reply. Any honest attachment notes
        //    (an unseen photo, an unreadable document) are appended to
        //    the reply itself — stated, never hidden.
        const combined = await combineParts(ctx, user.id, conns, taskForEngine, plan, results, settings);
        const replyText = honestNotes.length > 0 ? `${combined.text}\n\n${honestNotes.join("\n")}` : combined.text;
        await db
          .update(schema.runs)
          .set({ status: "done", finalResult: replyText, combinerNote: combined.note, totalLatencyMs: Date.now() - startedAll })
          .where(eq(schema.runs.id, runId));
        await db.insert(schema.chatMessages).values({ chatId, role: "assistant", content: replyText, runId });
        ctx.invalidateQueries();
        return { ok: true, chatId, message: "Done." };
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 300) : "unknown error";
        return failReply(
          "Something went wrong while working on that — your message is saved here, and the details are in “How this was made”.",
          `The run could not complete: ${msg}`,
        );
      }
    },
  }),

  getRun: defineAction({
    request: z.object({ token: z.string().min(1).max(200), runId: z.number().int().positive() }),
    response: z.object({ run: runShape.nullable() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { run: null };
      return { run: await loadRun(ctx, args.runId, user.id) };
    },
  }),

  getLearning: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({
      stats: z.array(
        z.object({
          capabilityKey: z.string(),
          capabilityLabel: z.string(),
          routeLabel: z.string(),
          sent: z.number(),
          done: z.number(),
          failed: z.number(),
          typicalMs: z.number().nullable(),
        }),
      ),
    }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { stats: [] };
      const db = ctx.db<typeof schema>();
      const rows = await db.select().from(schema.learningStats).where(eq(schema.learningStats.userId, user.id)).orderBy(asc(schema.learningStats.capabilityKey));
      return {
        stats: rows.map((r) => ({
          capabilityKey: r.capabilityKey,
          capabilityLabel: CAP_BY_KEY.get(r.capabilityKey)?.label ?? r.capabilityKey,
          routeLabel: PROVIDER_BY_ID.get(r.routeClass as ProviderId)?.routeLabel ?? r.routeClass,
          sent: r.sent,
          done: r.done,
          failed: r.failed,
          typicalMs: r.done > 0 ? Math.round(r.totalLatencyMs / r.done) : null,
        })),
      };
    },
  }),
} satisfies ActionsModule;
