// EKAM — Public Edition server actions.
//
// Accounts are per-visitor (name + email, session token). Everything —
// the key, chats, runs, history, learning — is scoped to the user.
//
// NVIDIA-ONLY (founder's direction, 2026-10-19): EKAM Public runs on ONE
// thing — the visitor's own NVIDIA API key (build.nvidia.com / NIM),
// which unlocks the whole NVIDIA catalogue. Developer setup is a TASK
// BOARD: one section per task, each naming the NVIDIA-catalogue model
// chosen for that task, a "Paste the API key for this task" blank, and a
// shortcut link to that model's own page on build.nvidia.com. The key is
// a single per-user connection: saving it in ANY section stores it once
// (after ONE real authenticated test call to the NVIDIA API), and every
// section then shows Connected (last4). Model names live only in
// Developer setup — the chat and the Adjust seats show capability
// labels only.
//
// The workspace is a simple chat. Behind it the engine works invisibly
// on the NVIDIA NIM API (https://integrate.api.nvidia.com/v1) with the
// visitor's one key: the flagship model divides and combines, the
// vision model sees images, and each capability routes to its chosen
// NVIDIA-catalogue model with the flagship family as fallback.

import { defineAction, z, type ActionsModule, type Ctx } from "@hatch/space-sdk";
import { and, asc, desc, eq } from "drizzle-orm";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// The NVIDIA catalogue — the models EKAM Public is built on. These ids
// and page URLs come from the founder's own catalogue screenshots and
// the task brief, verbatim.
// ---------------------------------------------------------------------------

const NVIDIA_CHAT_URL = "https://integrate.api.nvidia.com/v1/chat/completions";

const FLAGSHIP = "nvidia/nemotron-3-ultra-550b-a55b";
const SUPER_VL = "nvidia/nemotron-3.5-super-vl-120b-a12b";
const DEEPSEEK_FLASH = "deepseek-ai/deepseek-v4.1-flash";
const LAGUNA = "poolside/laguna-xs-2.1";
const LIGHTNING = "nvidia/nemotron-3.5-lightning-30b-a3b";
const GLM_FLASH = "z-ai/glm-5-3-flash";
const STEP5 = "stepfun-ai/step-5-preview";
const FLUX_KLEIN = "black-forest-labs/flux-3-image-klein";

// Neutral route labels used everywhere outside Developer setup (the
// "How this was made" view, the learning record) — never a model name.
const MODEL_ROUTE_LABELS: Record<string, string> = {
  [FLAGSHIP]: "the flagship route",
  [SUPER_VL]: "the vision route",
  [DEEPSEEK_FLASH]: "the reasoning route",
  [LAGUNA]: "the coding route",
  [LIGHTNING]: "the fast route",
  [GLM_FLASH]: "the multimodal route",
  [STEP5]: "the experimental flagship route",
  [FLUX_KLEIN]: "the image route",
};

function routeLabelFor(model: string): string {
  return MODEL_ROUTE_LABELS[model] ?? "the NVIDIA route";
}

// ---------------------------------------------------------------------------
// The task board — Developer setup's sections. Core sections are the
// seats the chat engine works through; "More NVIDIA powers" are further
// catalogue models the same one key unlocks (presented as catalogue
// powers — the chat engine is not claimed to call them).
// ---------------------------------------------------------------------------

type TaskSection = {
  id: string;
  task: string;
  model: string;
  modelUrl: string;
  group: "core" | "more";
  blurb: string;
};

const TASK_BOARD: TaskSection[] = [
  { id: "flagship", task: "Flagship brain — chat, dividing, combining", model: FLAGSHIP, modelUrl: "https://build.nvidia.com/nvidia/nemotron-3-ultra-550b-a55b", group: "core", blurb: "EKAM's main mind — it divides your task into parts, does the strong work, and combines everything into one final answer." },
  { id: "vision", task: "Vision — seeing images & screenshots", model: SUPER_VL, modelUrl: "https://build.nvidia.com/nvidia/nemotron-3.5-super-vl-120b-a12b", group: "core", blurb: "Looks at the photos and screenshots you attach and describes what it sees, so the chat can work with them." },
  { id: "reasoning", task: "Reasoning & maths", model: DEEPSEEK_FLASH, modelUrl: "https://build.nvidia.com/deepseek-ai/deepseek-v4.1-flash", group: "core", blurb: "Deep step-by-step thinking for maths, logic and hard problems." },
  { id: "coding", task: "Coding & long jobs", model: LAGUNA, modelUrl: "https://build.nvidia.com/poolside/laguna-xs-2.1", group: "core", blurb: "Built for long, agentic coding jobs and terminal work that runs and runs." },
  { id: "fast", task: "Fast replies", model: LIGHTNING, modelUrl: "https://build.nvidia.com/nvidia/nemotron-3.5-lightning-30b-a3b", group: "core", blurb: "The quick seat — everyday questions answered fast." },
  { id: "multimodal", task: "Multimodal chat", model: GLM_FLASH, modelUrl: "https://build.nvidia.com/z-ai/glm-5-3-flash", group: "core", blurb: "A multimodal all-rounder that backs up the vision and chat seats." },
  { id: "experimental", task: "Experimental flagship", model: STEP5, modelUrl: "https://build.nvidia.com/stepfun-ai/step-5-preview", group: "core", blurb: "A preview flagship with a huge context — the alternate strong mind when the flagship is busy." },
  { id: "image", task: "Image creation & editing", model: FLUX_KLEIN, modelUrl: "https://build.nvidia.com/black-forest-labs/flux-3-image-klein", group: "core", blurb: "The picture seat — ask the chat for an image and this is the model EKAM asks. If NVIDIA's image endpoint doesn't serve it, the chat says so honestly instead of faking a picture." },
  { id: "documents", task: "Documents & tables (OCR)", model: "nvidia/nemotron-parse-2.0", modelUrl: "https://build.nvidia.com/nvidia/nemotron-parse-2.0", group: "core", blurb: "Reads documents and pulls text and tables out of pages and images." },
  { id: "translation", task: "Translation", model: "nvidia/riva-translate-4b-instruct-v2", modelUrl: "https://build.nvidia.com/nvidia/riva-translate-4b-instruct-v2", group: "core", blurb: "Translation across 37 languages, for pages, messages and documents." },
  { id: "speech-to-text", task: "Speech to text", model: "nvidia/parakeet-tdt-0.6b", modelUrl: "https://build.nvidia.com/nvidia/parakeet-tdt-0.6b", group: "core", blurb: "Turns spoken audio into text across many languages, with punctuation and timestamps." },
  { id: "text-to-speech", task: "Text to speech", model: "resemble-ai/chatterbox-multilingual-tts", modelUrl: "https://build.nvidia.com/resemble-ai/chatterbox-multilingual-tts", group: "core", blurb: "Natural, expressive voices in 23 languages for anything EKAM writes." },
  { id: "embeddings", task: "Search inside files (embeddings)", model: "nvidia/nemotron-3-embed-1b", modelUrl: "https://build.nvidia.com/nvidia/nemotron-3-embed-1b", group: "core", blurb: "Semantic search and retrieval — finding the right passage inside big files and collections." },
  { id: "muse-glimmer", task: "Multimodal reasoning", model: "meta/muse-glimmer-30b", modelUrl: "https://build.nvidia.com/meta/muse-glimmer-30b", group: "more", blurb: "A multimodal reasoning model accepting text and images, with native tool-calling." },
  { id: "kimi-k3", task: "Reasoning flagship", model: "moonshotai/kimi-k3", modelUrl: "https://build.nvidia.com/moonshotai/kimi-k3", group: "more", blurb: "A very large reasoning model with tool calling and image input, unlocked by the same key." },
  { id: "diffusiongemma", task: "Real-time text generation", model: "google/diffusiongemma-26b-a4b-it", modelUrl: "https://build.nvidia.com/google/diffusiongemma-26b-a4b-it", group: "more", blurb: "Diffusion-based text generation for real-time text apps." },
  { id: "nemotron-ocr", task: "Text recognition (OCR)", model: "nvidia/nemotron-ocr-v2", modelUrl: "https://build.nvidia.com/nvidia/nemotron-ocr-v2", group: "more", blurb: "Multilingual end-to-end optical character recognition, tables included." },
  { id: "kumo-tabular", task: "Prediction over tables", model: "nvidia/kumo-tabular", modelUrl: "https://build.nvidia.com/nvidia/kumo-tabular", group: "more", blurb: "Classification and regression over structured tables." },
  { id: "kumo-relational", task: "Prediction over multi-table data", model: "nvidia/kumo-relational", modelUrl: "https://build.nvidia.com/nvidia/kumo-relational", group: "more", blurb: "A relational foundation model for prediction over structured, multi-table data." },
  { id: "body-pose", task: "3D body pose from video", model: "nvidia/3d-body-pose", modelUrl: "https://build.nvidia.com/nvidia/3d-body-pose", group: "more", blurb: "Estimates 3D human body pose and skeleton from video input." },
  { id: "wan-animate", task: "Character animation", model: "wan-ai/wan2.2-animate-2-14b", modelUrl: "https://build.nvidia.com/wan-ai/wan2.2-animate-2-14b", group: "more", blurb: "An end-to-end character animation framework for video." },
  { id: "video-super-res", task: "Video upscaling", model: "nvidia/video-super-resolution-nim", modelUrl: "https://build.nvidia.com/nvidia/video-super-resolution-nim", group: "more", blurb: "Upscales encoded video to higher resolutions." },
  { id: "ising", task: "Quantum & vision analysis", model: "nvidia/ising-calibration-1.5-31b", modelUrl: "https://build.nvidia.com/nvidia/ising-calibration-1.5-31b", group: "more", blurb: "A multimodal vision-language model built for quantum-computing analysis." },
  { id: "qwen-image-edit", task: "Image editing — synthetic to photo", model: "nvidia/qwen-image-edit-nvpcb-ovsl2sl", modelUrl: "https://build.nvidia.com/nvidia/qwen-image-edit-nvpcb-ovsl2sl", group: "more", blurb: "An image-edit model specialised in turning synthetic renders photorealistic." },
];

// ---------------------------------------------------------------------------
// The elite team — capability seats. Each seat lists the NVIDIA models
// that can serve it, best first; every seat is served through the user's
// one NVIDIA key, and the learning record re-orders proven models.
// ---------------------------------------------------------------------------

type Capability = {
  key: string;
  label: string;
  servedBy: "connection" | "platform" | "image";
  models: string[];
  system: string;
};

const CAPABILITIES: Capability[] = [
  { key: "code", label: "Best for code", servedBy: "connection", models: [LAGUNA, FLAGSHIP, STEP5], system: "You are a specialist in writing clean, complete code. Return production-ready code with brief explanations." },
  { key: "reasoning", label: "Best for reasoning & maths", servedBy: "connection", models: [DEEPSEEK_FLASH, FLAGSHIP, STEP5], system: "You are a specialist in deep reasoning, mathematics and logic. Show clear step-by-step thinking and a verified final answer." },
  { key: "planning", label: "Best for planning", servedBy: "connection", models: [FLAGSHIP, STEP5, LIGHTNING], system: "You are a planning specialist. Turn a goal into a clear, ordered, actionable plan." },
  { key: "data", label: "Best for data & formulas", servedBy: "connection", models: [FLAGSHIP, DEEPSEEK_FLASH, STEP5], system: "You are a data specialist. Return clean, valid structured output (JSON, tables, formulas) exactly in the requested shape." },
  { key: "writing", label: "Best for writing", servedBy: "connection", models: [FLAGSHIP, GLM_FLASH, LIGHTNING], system: "You are a writing specialist. Produce polished, well-structured writing that matches the requested tone." },
  { key: "research", label: "Best for research summaries", servedBy: "connection", models: [FLAGSHIP, GLM_FLASH, STEP5], system: "You are a research specialist. Synthesise, summarise and organise material accurately and clearly." },
  { key: "documents", label: "Best for documents", servedBy: "connection", models: [FLAGSHIP, SUPER_VL, GLM_FLASH], system: "You are a document specialist. Extract, structure and explain content from documents, tables and text clearly." },
  { key: "translation", label: "Best for translation", servedBy: "connection", models: [FLAGSHIP, GLM_FLASH, LIGHTNING], system: "You are a translation specialist covering many languages including all major Indian languages. Translate faithfully and naturally." },
  { key: "general", label: "Best for everyday questions", servedBy: "connection", models: [LIGHTNING, FLAGSHIP, GLM_FLASH], system: "You are a fast, helpful general assistant. Answer concisely and directly." },
  { key: "vision", label: "Best for seeing images", servedBy: "connection", models: [SUPER_VL, GLM_FLASH, FLAGSHIP], system: "You are a vision specialist. Analyse visual material described to you and help with image-related work clearly and helpfully." },
  // Image creation is served by the NVIDIA image seat (the flux model on
  // the task board) — never by the divider's text routes; sendMessage
  // routes an image ask straight to it. Voice still needs the platform.
  { key: "image_creation", label: "Best for creating images", servedBy: "image", models: [FLUX_KLEIN], system: "" },
  { key: "voice", label: "Best for voice & audio", servedBy: "platform", models: [], system: "" },
];

const CAP_BY_KEY = new Map(CAPABILITIES.map((c) => [c.key, c]));
const DIVIDER_KEYS = CAPABILITIES.filter((c) => c.servedBy === "connection").map((c) => c.key);

// ---------------------------------------------------------------------------
// Adjust — the user's talking controls for chat. Per user, persisted, and
// they genuinely govern every reply:
//  - seats: which capability seats are ON. A seat can only be on while
//    the NVIDIA key is connected (platform seats never).
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

type NvidiaConn = { apiKey: string; last4: string };

// The user's ONE NVIDIA connection. Rows stored for providers removed in
// the NVIDIA-only rebuild are simply never read — they stay inert.
async function nvidiaConnFor(ctx: Ctx, userId: number): Promise<NvidiaConn | null> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.connections)
    .where(and(eq(schema.connections.userId, userId), eq(schema.connections.provider, "nvidia")))
    .limit(1);
  const row = rows[0];
  return row ? { apiKey: row.apiKey, last4: row.last4 } : null;
}

// Can this capability seat work at all right now? Text and image seats
// work while the one NVIDIA key is connected; platform seats never yet.
function seatServable(cap: Capability, hasConn: boolean): boolean {
  return cap.servedBy !== "platform" && hasConn;
}

// ---------------------------------------------------------------------------
// NVIDIA NIM calls — one OpenAI-compatible chat shape for every model,
// server-side only. Model ids live here and in the task board; they
// never reach the chat UI.
// ---------------------------------------------------------------------------

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

async function callNvidiaChat(apiKey: string, model: string, system: string, user: string, opts: { maxTokens: number; temperature: number; timeoutMs: number }): Promise<string> {
  const res = await fetchWithTimeout(NVIDIA_CHAT_URL, {
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
  const json = (await res.json()) as OaiChatResponse;
  const text = extractOaiText(json);
  if (!text) throw new Error("Empty response");
  return text;
}

// ONE real test call with a pasted key. The board's law: the test is the
// smallest REAL authenticated chat call against the flagship model —
// never a model-list endpoint, which can answer without enforcing the
// key (the NVIDIA lesson). Success means NVIDIA itself accepted the key
// on a genuine completion; anything else is a refusal and nothing is
// stored. A key test gets a full minute, so a slow first connection
// never produces a false "could not reach".
const TEST_TIMEOUT_MS = 60000;

async function testNvidiaKey(apiKey: string): Promise<Response> {
  return fetchWithTimeout(NVIDIA_CHAT_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: FLAGSHIP,
      messages: [{ role: "user", content: "Hi" }],
      max_tokens: 1,
      temperature: 0,
    }),
  }, TEST_TIMEOUT_MS);
}

// ---------------------------------------------------------------------------
// Image generation through NVIDIA's image endpoint for the task board's
// picture model (flux-3-image-klein). NVIDIA serves its image models
// from the genai host; if that endpoint does not serve this model, the
// call throws and the chat says so in one honest line — a picture is
// never faked.
// ---------------------------------------------------------------------------

async function generateImageNvidia(apiKey: string, prompt: string): Promise<{ bytes: Uint8Array; contentType: string }> {
  const res = await fetchWithTimeout(`https://ai.api.nvidia.com/v1/genai/${FLUX_KLEIN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ prompt, cfg_scale: 3.5, aspect_ratio: "16/9", seed: 0, steps: 50 }),
  }, 90000);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${body ? `: ${body.slice(0, 140)}` : ""}`);
  }
  const json = (await res.json()) as {
    image?: string;
    artifacts?: Array<{ base64?: string; mime_type?: string }>;
    images?: Array<{ url?: string; content_type?: string; image?: string }>;
  };
  const b64 = typeof json.image === "string" && json.image ? json.image : json.artifacts?.[0]?.base64 ?? json.images?.[0]?.image;
  if (typeof b64 === "string" && b64) {
    return { bytes: base64ToBytes(b64), contentType: "image/jpeg" };
  }
  const url = json.images?.[0]?.url;
  if (url) {
    const imgRes = await fetchWithTimeout(url, { method: "GET" }, 30000);
    if (!imgRes.ok) throw new Error(`The generated image could not be downloaded (HTTP ${imgRes.status})`);
    const bytes = new Uint8Array(await imgRes.arrayBuffer());
    if (bytes.length === 0) throw new Error("The generated image was empty");
    return { bytes, contentType: json.images?.[0]?.content_type || "image/jpeg" };
  }
  throw new Error("No image came back from NVIDIA's image endpoint");
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
// Chat attachments ("+" attach in the composer). Files are stored as
// blobs and kept on the message. Treatment by kind: photos are looked
// at by the NVIDIA vision model, documents are read (text extracted and
// given to the pipeline), other files are acknowledged by name. Nothing
// is ever faked: a photo the vision model could not see, and a document
// with no readable text, are both stated plainly in the reply.
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

// The vision models on the user's NVIDIA key, best first: the Super VL
// model, then the multimodal GLM flash as fallback.
const VISION_MODELS: string[] = [SUPER_VL, GLM_FLASH];

const VISION_PROMPT = (userMessage: string) =>
  `The user attached this photo to a chat message. Their message: "${userMessage || "(no text — just the photo)"}". Describe what is in the photo and note anything relevant to what they asked, so the assistant can discuss it with them.`;

async function describeImage(apiKey: string, mimeType: string, dataBase64: string, userMessage: string): Promise<string | null> {
  const prompt = VISION_PROMPT(userMessage);
  for (const model of VISION_MODELS) {
    try {
      const res = await fetchWithTimeout(NVIDIA_CHAT_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: [
            { type: "text", text: prompt },
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${dataBase64}` } },
          ] }],
          temperature: 0.4,
          max_tokens: 800,
        }),
      }, 60000);
      if (!res.ok) continue;
      const json = (await res.json()) as OaiChatResponse;
      const text = extractOaiText(json);
      if (text) return text;
    } catch {
      // fall through to the next vision model
    }
  }
  return null;
}

type CallOutcome = { text: string; model: string; latencyMs: number };

// Try the capability's NVIDIA models in order, re-ordered by the user's
// learning record (proven models first: successes, then failures
// avoided, then speed).
async function callWithLearning(
  ctx: Ctx,
  userId: number,
  conn: NvidiaConn,
  cap: Capability,
  system: string,
  user: string,
  opts: { maxTokens: number; temperature: number; timeoutMs: number },
): Promise<CallOutcome> {
  const db = ctx.db<typeof schema>();
  if (cap.models.length === 0) throw new Error("No NVIDIA model can serve this part");
  const stats = await db
    .select()
    .from(schema.learningStats)
    .where(and(eq(schema.learningStats.userId, userId), eq(schema.learningStats.capabilityKey, cap.key)));
  const statByModel = new Map(stats.map((s) => [s.routeClass, s]));
  const scored = cap.models.map((model, idx) => {
    const s = statByModel.get(model);
    return {
      model,
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
      const text = await callNvidiaChat(conn.apiKey, attempt.model, system, user, opts);
      return { text, model: attempt.model, latencyMs: Date.now() - started };
    } catch (e) {
      errors.push(`${routeLabelFor(attempt.model)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  throw new Error(errors.join(" · ").slice(0, 400));
}

async function recordLearning(ctx: Ctx, userId: number, capabilityKey: string, model: string, ok: boolean, latencyMs: number): Promise<void> {
  const db = ctx.db<typeof schema>();
  const rows = await db
    .select()
    .from(schema.learningStats)
    .where(and(eq(schema.learningStats.userId, userId), eq(schema.learningStats.capabilityKey, capabilityKey), eq(schema.learningStats.routeClass, model)))
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
      routeClass: model,
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
  // fast seat for everyday questions.
  if (t.length <= 140 && !/\b(and also|as well as|plus a|build|create|design|develop|website|app|plan for)\b/.test(lower)) {
    const capKey = allowedKeys.includes("general") ? "general" : null;
    if (capKey) return { goal: t, parts: [{ capability: capKey, title: "Answer", instruction: t }] };
  }
  return null;
}

const DIVIDER_CAP: Capability = CAP_BY_KEY.get("planning") ?? CAPABILITIES[0]!;

async function divideTask(ctx: Ctx, userId: number, conn: NvidiaConn, task: string, settings: AdjustSettings): Promise<{ plan: Plan; note: string }> {
  const allowedKeys = settings.seats;
  const cap = partCapFor(settings);
  const budgets = budgetsFor(settings);
  const system = dividerSystem(allowedKeys, cap);

  const fast = fastPathPlan(task, allowedKeys);
  if (fast) return { plan: fast, note: "Simple message — answered directly by the best seat, no division needed." };

  const first = await callWithLearning(ctx, userId, conn, DIVIDER_CAP, system, `Task to divide:\n\n${task}`, {
    maxTokens: budgets.dividerTokens,
    temperature: 0.3,
    timeoutMs: 30000,
  });
  const plan = parsePlanText(first.text, allowedKeys, cap);
  if (plan) return { plan, note: `Divided by the Divider AI via ${routeLabelFor(first.model)} in ${(first.latencyMs / 1000).toFixed(1)}s.` };

  const repair = await callWithLearning(
    ctx,
    userId,
    conn,
    DIVIDER_CAP,
    system,
    `Task to divide:\n\n${task}\n\nYour previous answer was not valid — it may have used a capability that is switched off, or more parts than allowed. Answer again with ONLY the JSON object in the exact contract: {"goal": "...", "parts": [{"capability": "<one of: ${allowedKeys.join(", ")}>", "title": "...", "instruction": "..."}]} with 1-${cap} parts.`,
    { maxTokens: budgets.dividerTokens, temperature: 0.2, timeoutMs: 30000 },
  );
  const repaired = parsePlanText(repair.text, allowedKeys, cap);
  if (repaired) return { plan: repaired, note: `Divided by the Divider AI via ${routeLabelFor(repair.model)} in ${(repair.latencyMs / 1000).toFixed(1)}s (plan repaired once by the validator).` };

  const fallbackKey = allowedKeys.includes("general") ? "general" : allowedKeys[0]!;
  return {
    plan: { goal: task, parts: [{ capability: fallbackKey, title: "Complete the task", instruction: task }] },
    note: "The divider's plan failed validation twice, so EKAM used the safe one-part fallback — the whole task went to one specialist that is switched on.",
  };
}

const COMBINE_SYSTEM = `You are the Divider of EKAM, finishing a job you divided. Specialists have each completed one part of the task. Weave their parts into ONE final result for the user: complete, well-structured, no part boundaries showing, no mention of parts, specialists, routes or process. If a part failed, work gracefully with what exists and do not invent what is missing.`;

async function combineParts(ctx: Ctx, userId: number, conn: NvidiaConn, task: string, plan: Plan, parts: Array<{ capabilityLabel: string; title: string; output: string | null }>, settings: AdjustSettings): Promise<{ text: string; note: string }> {
  const done = parts.filter((p) => p.output);
  if (done.length === 1 && parts.length === 1) {
    return { text: done[0]!.output!, note: "Single part — the specialist's answer is the reply, no combine needed." };
  }
  const budgets = budgetsFor(settings);
  const user = `Original task:\n${task}\n\nGoal: ${plan.goal}\n\nParts brought back:\n\n${done.map((p, i) => `--- Part ${i + 1} (${p.capabilityLabel}: ${p.title}) ---\n${p.output}`).join("\n\n")}\n\n${thinkingNote(settings.thinking)}\n${lengthNote(settings.length)}\n\nWrite the one final result.`;
  const res = await callWithLearning(ctx, userId, conn, DIVIDER_CAP, COMBINE_SYSTEM, user, {
    maxTokens: budgets.combineTokens,
    temperature: 0.5,
    timeoutMs: 60000,
  });
  return { text: res.text, note: `Combined by the Divider AI via ${routeLabelFor(res.model)} in ${(res.latencyMs / 1000).toFixed(1)}s.` };
}

// ---------------------------------------------------------------------------
// Response shapes
// ---------------------------------------------------------------------------

const teamSeat = z.object({
  key: z.string(),
  label: z.string(),
  servedBy: z.enum(["connection", "platform", "image"]),
  state: z.enum(["connected", "platform_soon", "not_connected"]),
});

const taskSectionShape = z.object({
  id: z.string(),
  task: z.string(),
  model: z.string(),
  modelUrl: z.string(),
  group: z.enum(["core", "more"]),
  blurb: z.string(),
  connected: z.boolean(),
  last4: z.string().nullable(),
});

const meResponse = z.object({
  signedIn: z.boolean(),
  user: z.object({ name: z.string(), email: z.string() }).nullable(),
  connected: z.boolean(),
  connectedCount: z.number(),
  tasks: z.array(taskSectionShape),
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

function taskSections(conn: NvidiaConn | null): z.infer<typeof taskSectionShape>[] {
  return TASK_BOARD.map((t) => ({
    id: t.id,
    task: t.task,
    model: t.model,
    modelUrl: t.modelUrl,
    group: t.group,
    blurb: t.blurb,
    connected: conn != null,
    last4: conn?.last4 ?? null,
  }));
}

async function buildMe(ctx: Ctx, user: { id: number; name: string; email: string } | null): Promise<MeOut> {
  const conn = user ? await nvidiaConnFor(ctx, user.id) : null;
  return {
    signedIn: !!user,
    user: user ? { name: user.name, email: user.email } : null,
    connected: conn != null,
    connectedCount: conn != null ? 1 : 0,
    tasks: taskSections(conn),
    team: CAPABILITIES.map((c) => ({
      key: c.key,
      label: c.label,
      servedBy: c.servedBy,
      state: c.servedBy === "platform" ? ("platform_soon" as const) : seatServable(c, conn != null) ? ("connected" as const) : ("not_connected" as const),
    })),
  };
}

const adjustResponse = z.object({
  seats: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      servedBy: z.enum(["connection", "platform", "image"]),
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
  const conn = await nvidiaConnFor(ctx, user.id);
  const settings = await loadAdjust(ctx, user.id);
  const onSet = new Set(settings.seats);
  return {
    seats: CAPABILITIES.map((c) => {
      const servable = seatServable(c, conn != null);
      return {
        key: c.key,
        label: c.label,
        servedBy: c.servedBy,
        state: c.servedBy === "platform" ? ("platform_soon" as const) : servable ? ("connected" as const) : ("not_connected" as const),
        // A seat cannot be on while the NVIDIA key is not connected. The
        // image seat is not a divider toggle — it is simply available
        // while the key is connected, so its "on" mirrors availability.
        on: c.servedBy === "image" ? servable : servable && onSet.has(c.key),
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

  // --- Developer setup: the NVIDIA task board ----------------------------
  // One key rules them all: the visitor's single NVIDIA key. Every task
  // section shows the same paste blank; saving in ANY section makes ONE
  // real test call to the NVIDIA API and stores the key once, against
  // the user's account, ONLY if NVIDIA accepts it. A refusal stores
  // nothing. Disconnect removes the one key.

  getDeveloperSetup: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ tasks: z.array(taskSectionShape), connected: z.boolean(), last4: z.string().nullable() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { tasks: taskSections(null), connected: false, last4: null };
      const conn = await nvidiaConnFor(ctx, user.id);
      return { tasks: taskSections(conn), connected: conn != null, last4: conn?.last4 ?? null };
    },
  }),

  saveNvidiaKey: defineAction({
    request: z.object({ token: z.string().min(1).max(200), apiKey: z.string().max(500) }),
    response: z.object({ ok: z.boolean(), last4: z.string().nullable(), message: z.string() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, last4: null, message: "Please sign in first, then paste your key." };
      const apiKey = args.apiKey.trim();
      if (!apiKey) {
        return { ok: false, last4: null, message: "The blank is empty — paste your NVIDIA key in first, then tap Save." };
      }
      if (/\s/.test(apiKey) || apiKey.length < 10) {
        return { ok: false, last4: null, message: "That doesn't look like an NVIDIA key — keys are one long unbroken string. Copy the whole key from build.nvidia.com and paste it again." };
      }
      let res: Response;
      try {
        res = await testNvidiaKey(apiKey);
      } catch (e) {
        return { ok: false, last4: null, message: `Could not reach NVIDIA to test your key: ${e instanceof Error ? e.message.slice(0, 160) : "network error"}. Nothing was saved — try again.` };
      }
      if (!res.ok) {
        await res.text().catch(() => "");
        return { ok: false, last4: null, message: "NVIDIA didn't accept this key — check you copied the whole key and try again." };
      }
      const db = ctx.db<typeof schema>();
      const last4 = apiKey.slice(-4);
      const existing = await db
        .select()
        .from(schema.connections)
        .where(and(eq(schema.connections.userId, user.id), eq(schema.connections.provider, "nvidia")))
        .limit(1);
      if (existing[0]) {
        await db.update(schema.connections).set({ apiKey, last4 }).where(eq(schema.connections.id, existing[0].id));
      } else {
        await db.insert(schema.connections).values({ userId: user.id, provider: "nvidia", apiKey, last4 });
      }
      ctx.invalidateQueries();
      return { ok: true, last4, message: `Connected — your NVIDIA key passed a live test and is stored safely on the server (only ····${last4} is ever shown). One key unlocks every section on this board.` };
    },
  }),

  disconnectNvidia: defineAction({
    request: z.object({ token: z.string().min(1).max(200) }),
    response: z.object({ ok: z.boolean(), message: z.string() }),
    async handler(ctx, args) {
      const user = await userForToken(ctx, args.token);
      if (!user) return { ok: false, message: "Please sign in first." };
      const db = ctx.db<typeof schema>();
      await db.delete(schema.connections).where(and(eq(schema.connections.userId, user.id), eq(schema.connections.provider, "nvidia")));
      ctx.invalidateQueries();
      return { ok: true, message: "Disconnected — your NVIDIA key was removed from EKAM's server. (The key itself still exists on your NVIDIA account; you can revoke it there any time.)" };
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
      const conn = await nvidiaConnFor(ctx, user.id);
      const settings = normalizeAdjust({ seats: args.seats, howMany: args.howMany, thinking: args.thinking, length: args.length });
      // A seat cannot be switched on while the NVIDIA key is not
      // connected — enforce it here too, not just in the panel.
      settings.seats = settings.seats.filter((k) => {
        const cap = CAP_BY_KEY.get(k);
        return cap ? seatServable(cap, conn != null) : false;
      });
      if (settings.seats.length === 0 && conn != null) {
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
      const conn = await nvidiaConnFor(ctx, user.id);
      if (!conn) {
        return { ok: false, chatId: args.chatId, message: "Add your NVIDIA key in Developer setup and EKAM is ready to work." };
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

      // Image asks take their own road — straight to NVIDIA's image
      // endpoint for the task board's picture model, never through the
      // text divider. Only when the message carries no attachments (an
      // attached photo means the user is asking ABOUT a picture, not
      // for a new one). If NVIDIA's image endpoint does not serve the
      // model, the reply says so in one honest line — no picture faked.
      if (incomingAtts.length === 0 && isImageRequest(args.content)) {
        try {
          const { bytes, contentType } = await generateImageNvidia(conn.apiKey, args.content);
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
            content: "I couldn't make that picture just now — NVIDIA's image endpoint didn't serve the picture model, and no image was made. Everything else in EKAM still runs on your NVIDIA key as usual.",
          });
          ctx.invalidateQueries();
          return { ok: true, chatId, message: "Image generation didn't go through — the reply in the chat says so honestly." };
        }
      }

      // Attachments: store the bytes as blobs with a metadata row on the
      // message, and build the context the pipeline works from — photos
      // looked at by the NVIDIA vision model, documents read, other
      // files acknowledged by name. Anything that could not be read or
      // seen earns one honest sentence appended to the reply itself.
      let attachmentContext = "";
      const honestNotes: string[] = [];
      if (incomingAtts.length > 0) {
        const contextParts: string[] = [];
        for (const att of incomingAtts) {
          const bytes = base64ToBytes(att.dataBase64);
          const kind = attachmentKindOf(att.mimeType, att.fileName);
          const safeName = att.fileName.replace(/[^\w.\-]+/g, "_").slice(0, 80) || "file";
          const blobKey = `chat-attachments/${chatId}/${userMessageId}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
          await ctx.blobs.put(blobKey, bytes, { contentType: att.mimeType || "application/octet-stream" });
          let extractedText: string | null = null;
          if (kind === "image") {
            if (att.mimeType === "image/jpeg" || att.mimeType === "image/png" || att.mimeType === "image/webp") {
              const seen = await describeImage(conn.apiKey, att.mimeType, att.dataBase64, args.content);
              if (seen) {
                extractedText = seen;
                contextParts.push(`[Attached photo "${att.fileName}" — this is what it shows: ${seen}]`);
              } else {
                contextParts.push(`[Attached photo "${att.fileName}" — it is saved with this message, but the vision model could not view it just now; be honest about that if asked about its contents.]`);
                honestNotes.push(`I couldn't view the photo “${att.fileName}” just now — the vision model didn't answer. It is saved with your message.`);
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

      // Adjust governs this reply; only seats the NVIDIA key can serve
      // may work (all of them, while the key is connected).
      const loaded = await loadAdjust(ctx, user.id);
      const settings: AdjustSettings = {
        ...loaded,
        seats: loaded.seats.filter((k) => {
          const cap = CAP_BY_KEY.get(k);
          return cap ? seatServable(cap, true) : false;
        }),
      };
      if (settings.seats.length === 0) {
        settings.seats = DIVIDER_KEYS.filter((k) => {
          const cap = CAP_BY_KEY.get(k);
          return cap ? seatServable(cap, true) : false;
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
        const { plan, note } = await divideTask(ctx, user.id, conn, taskForEngine, settings);
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

        // 2. Dispatch in parallel across the seat models — each
        //    specialist sees only the goal line and its own instruction.
        const results = await Promise.all(
          partRows.map(async ({ id, cap, part }) => {
            const userMsg = `Goal: ${plan.goal}\n\nYour part: ${part.instruction}${attachmentContext ? `\n\nMaterial the user attached to this message (read by the system from their files — use what applies to your part):\n${attachmentContext.slice(0, 6000)}` : ""}\n\n${thinkingNote(settings.thinking)}\n${lengthNote(settings.length)}`;
            try {
              const out = await callWithLearning(ctx, user.id, conn, cap, cap.system, userMsg, {
                maxTokens: budgets.partTokens,
                temperature: budgets.temperature,
                timeoutMs: 45000,
              });
              await recordLearning(ctx, user.id, cap.key, out.model, true, out.latencyMs);
              await db
                .update(schema.runParts)
                .set({ status: "done", output: out.text, routeLabel: routeLabelFor(out.model), latencyMs: out.latencyMs })
                .where(eq(schema.runParts.id, id));
              return { capabilityLabel: cap.label, title: part.title, output: out.text as string | null };
            } catch (e) {
              const msg = e instanceof Error ? e.message.slice(0, 300) : "failed";
              const firstModel = cap.models[0];
              if (firstModel) await recordLearning(ctx, user.id, cap.key, firstModel, false, 0);
              await db.update(schema.runParts).set({ status: "failed", errorNote: msg }).where(eq(schema.runParts.id, id));
              return { capabilityLabel: cap.label, title: part.title, output: null as string | null };
            }
          }),
        );

        const doneCount = results.filter((r) => r.output).length;
        if (doneCount === 0) {
          return failReply(
            "I couldn't get an answer this time — every NVIDIA route failed. Check in Developer setup that your key is still accepted, then try again.",
            "Every specialist call failed through your NVIDIA key.",
          );
        }

        // 3. Auto-combine into one reply. Any honest attachment notes
        //    (an unseen photo, an unreadable document) are appended to
        //    the reply itself — stated, never hidden.
        const combined = await combineParts(ctx, user.id, conn, taskForEngine, plan, results, settings);
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
        stats: rows
          // Rows earned under the old multi-provider engine name their
          // old providers in routeClass — those are inert history from
          // before the NVIDIA-only rebuild and are not shown.
          .filter((r) => r.routeClass.includes("/"))
          .map((r) => ({
            capabilityKey: r.capabilityKey,
            capabilityLabel: CAP_BY_KEY.get(r.capabilityKey)?.label ?? r.capabilityKey,
            routeLabel: routeLabelFor(r.routeClass),
            sent: r.sent,
            done: r.done,
            failed: r.failed,
            typicalMs: r.done > 0 ? Math.round(r.totalLatencyMs / r.done) : null,
          })),
      };
    },
  }),
} satisfies ActionsModule;
