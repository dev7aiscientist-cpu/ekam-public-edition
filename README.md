# EKAM — Public Edition

**Many Minds. One Result.**

EKAM (एकम् — "The One", from *Ekam Sat*: the truth is one, the wise call it by many names) is a multi-AI chat platform. Instead of betting on a single AI, EKAM keeps a **Divider AI** at its centre: it splits your task into parts, hands each part to the AI best suited for it, collects the parts, and combines them into **one final answer**.

**EKAM Founded by Dev Mishra.**

---

## How it works

1. **You bring one key — NVIDIA's.** EKAM runs entirely on NVIDIA's model catalogue. **Developer setup** is a task board: 24 sections, one per task (flagship brain, vision, reasoning, coding, image creation, translation, voice, and more), each naming its model and linking straight to that model's page on build.nvidia.com. Paste your NVIDIA API key into any section — **one NVIDIA key unlocks every section**. The key is verified with a **real test call** to NVIDIA before it is accepted; a refused key is never stored, and the key is only ever shown as its last 4 characters.
2. **You just chat.** Simple questions are answered directly. Bigger work is divided behind the scenes by the Divider AI (strict plan contract, validated server-side), parts run **in parallel** across the catalogue's models, and the Divider combines them into one reply.
3. **EKAM learns.** A per-user record of which routes actually delivered (and how fast) quietly steers future work toward proven routes.
4. **You stay in control.** The **Adjust** panel chooses which capabilities are on, how many AIs work, the thinking level, and the answer length. The chat shows **capability labels only** — never model names — so models can be swapped invisibly.
5. **Files welcome.** Attach documents (genuinely read, PDFs included) and photos (sent to the vision model); ask for a picture and EKAM creates it with its NVIDIA image model.

Accounts are per-visitor and fully isolated: your keys, chats, attachments and learning are yours alone.

## Quick start

**The click way (your own computer):** unzip, then double-click **START.bat** (Windows) or run **start.sh** (Mac/Linux). The first click installs EKAM's parts once; after that, EKAM starts and your browser opens by itself. Keep the window that opens — it is EKAM's engine; close it to stop EKAM. (EKAM needs the free program [Bun](https://bun.sh) — if it's missing, the launcher tells you and opens its page.)

**The command way (servers):**

```bash
bun install
bun run start
```

Open http://localhost:4173 → **Try EKAM** → create an account → **Developer setup** → paste your NVIDIA key → chat.

## Deploying

See **[DEPLOY-GUIDE.md](DEPLOY-GUIDE.md)** for the full launch walkthrough (VPS + HTTPS, or Render / Railway / Fly with a persistent disk).

⚠️ EKAM's whole world — accounts, keys, chats — lives in the `data/` folder. Put it on a persistent disk and back it up.

## Tech

- TypeScript server actions (the Divider, routing, learning, accounts) on a small standalone Bun host
- SQLite (via Drizzle migrations, applied automatically on boot) + filesystem blob storage
- React client, matte red-and-black chat with a living dot-network animation
- No master keys, no tracking, no faked "connected" states — every connection is proven by a real call

---

*EKAM — many minds, one result.* **Founded by Dev Mishra.**
