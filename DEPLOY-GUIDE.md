# EKAM — Public Edition · Deployment Guide

*How to put your EKAM Public Edition on the internet, on your own hosting, under your own control.*

---

## What this package is (read this first)

Your EKAM Public Edition was built inside Muse, and Muse's hosted apps are **private by design** — they cannot take a public link. So this package is the same EKAM, **re-hosted**: the exact same app code (the same `server/actions.ts` that runs inside Muse today), with a small standalone server (`host/host.ts`) supplying the pieces Muse used to supply — the web hosting, the database, and file storage.

Nothing was rewritten or faked. Before this guide was written, the package was **booted and tested for real**:

- ✅ All 5 database migrations applied on a fresh start
- ✅ A test account signed up through the package's own server
- ✅ A **fake NVIDIA key was refused by NVIDIA itself** — *"NVIDIA didn't accept this key"* — proving the test-call path works outside Muse
- ✅ Developer setup served through the package showed all **24 NVIDIA task sections**, Kimi K3 in the Reasoning flagship slot
- ✅ Chat with no key answered honestly: *"Add your NVIDIA key in Developer setup and EKAM is ready to work."*

**The zip contains NO database, NO accounts and NO API keys.** It starts empty, exactly like a fresh EKAM should. Every visitor creates their own account and pastes **their own NVIDIA key** in Developer setup. There is no master key and no founder backdoor — by design.

---

## What's inside

```
ekam-public-edition/
├── client/          The built website (what visitors see)
├── server/          EKAM's brain — actions.ts (the whole engine) + schema.ts
├── host/host.ts     The standalone server (this is what you run)
├── drizzle/         Database blueprints — applied automatically on first start
├── sdk/             A tiny compatibility piece so EKAM's code runs unmodified
├── data/            Created on first run: ekam.db (accounts, keys, chats)
│                    + blobs/ (attachments, generated images). YOUR TREASURE.
├── package.json     The app's shopping list for Bun
└── .env.example     Settings template (port, data folder)
```

---

## What you need

1. **Bun** — the JavaScript engine EKAM is built for. Get the official installer from **bun.sh** and follow the instructions there for your OS (Windows, Mac and Linux are all supported).
2. **A place to run it** — any of:
   - A **VPS** (a small rented server — most straightforward, always on, full control)
   - Your own computer (fine for testing; the site is live only while it's on)
   - A hosting platform like **Render, Railway or Fly.io** (easy, but see the data warning below)
3. *(Optional, for a real launch)* **A domain name** pointing at your server.

---

## Quick start (see it run in 2 minutes)

**On your own computer — just click:** unzip the package, open the `ekam-public-edition` folder, and double-click **START.bat** (Windows) or run **start.sh** (Mac/Linux). The first click installs EKAM's parts (one-time, needs internet); then EKAM starts and **your browser opens by itself** at the right address. Keep the black window open — it is EKAM's engine; close it to stop EKAM. If Bun isn't installed yet, the launcher says so in plain words and opens bun.sh for you — install Bun, double-click START again, done.

**On a server — the commands:**

```bash
unzip ekam-public-edition-deploy.zip
cd ekam-public-edition
bun install
bun run start
```

Open **http://localhost:4173** — EKAM's front door appears. Click **Try EKAM**, create your account, open **Developer setup**, paste one of your keys, and chat. It's live.

To use a different port or data folder, copy `.env.example` to `.env` and edit it — or just set the variables when starting:

```bash
PORT=8080 DATA_DIR=/var/ekam-data bun run start
```

---

## ⚠️ The one rule that protects everything: the `data/` folder

EKAM's whole world — **every visitor account, every pasted API key, every chat, every learned record, every attachment and generated image** — lives in the `data/` folder (`ekam.db` + `blobs/`).

- Put it on a **persistent disk**. If the disk is wiped, EKAM's memory is wiped. No backup = no recovery.
- On platforms like Render/Railway/Fly, the default disk can be **ephemeral** (erased on redeploy). You must attach their **persistent disk/volume** and point `DATA_DIR` at it.
- **Back it up** like you'd back up anything precious: copy the folder. That's the whole backup.

---

## Going live (the real launch)

### Option A — VPS (recommended for EKAM)

1. Rent a small VPS (1–2 GB RAM is plenty) and install Bun (above).
2. Upload the unzipped folder, run `bun install`.
3. Keep it running forever with **PM2**:
   ```bash
   npm install -g pm2
   pm2 start "bun run start" --name ekam
   pm2 save && pm2 startup
   ```
4. Put **HTTPS** in front — visitors will paste API keys into this site; an unlocked (http) site is not acceptable for that. The easy way is **Caddy** (free, automatic certificates). A Caddyfile like this is the whole configuration:
   ```
   yourdomain.com {
       reverse_proxy localhost:4173
   }
   ```
   Point your domain's DNS **A record** at the VPS, install Caddy with that little file, and your site is live at `https://yourdomain.com` with the lock on.

### Option B — Render / Railway / Fly.io

1. Create a new web service from this folder (or push it to a Git repo and connect it).
2. Build command: `bun install` · Start command: `bun run start`
3. Set the environment variable `PORT` if the platform asks for one — EKAM reads it automatically.
4. **Attach a persistent disk** and set `DATA_DIR` to its mount path (see the warning above).
5. Add your custom domain in the platform's settings — they provide HTTPS automatically.

> **Free tiers sleep.** On free hosting, the app naps when idle and the first visitor waits ~30 s for it to wake. For a public launch people rely on, a small paid instance (or the VPS above) keeps EKAM awake. That's a hosting fact, not an EKAM limit.

---

## After it's live — your first 5 minutes

1. Open your EKAM URL → **Try EKAM** → create **your** account (the founder is simply the first visitor — there is no separate admin panel).
2. **Developer setup** → paste one of your own keys → confirm it shows **Connected**.
3. Send one small chat message. Your EKAM, on your server, answered through your key. That's the full proof, in your hands.
4. Share the link. Visitors sign up, bring their own NVIDIA key, and EKAM works for them exactly as it works for you — each person's key, chats and learning stay theirs alone.

---

## Updating EKAM later

When a new version of this package arrives: **stop the app, replace the code folders (`client/`, `server/`, `host/`, `drizzle/`, `sdk/`, `package.json`), keep your `data/` folder exactly where it is, `bun install`, start again.** New database blueprints apply themselves on boot. Your accounts, keys and chats survive every update — they live in `data/`, not in the code.

---

## Troubleshooting

- **"Port already in use"** → something else owns 4173. Set `PORT` to another number (e.g. 8080) and start again.
- **A key is refused** → EKAM only accepts the key after NVIDIA itself accepts it in a real test call. Check the whole key was copied (keys are shown in full only once at creation) and that it was created at build.nvidia.com. If a genuinely valid key still fails on a specific model, that model's free endpoint may require data-use consent on the NVIDIA account — check the model's page on build.nvidia.com.
- **The site forgot everyone** → the `data/` folder was wiped or `DATA_DIR` points somewhere new. Restore it from your backup.
- **Images/attachments don't load** → the `data/blobs/` folder isn't readable/writable by the app, or `DATA_DIR` moved. Keep the whole `data/` folder together.

---

## Honest notes

- Keys your visitors paste are stored in EKAM's database so EKAM can work for them — protect the server like you'd protect any vault: HTTPS on, server account secured, `data/` backed up and private.
- EKAM's own honesty rules travel with it: no key is ever shown in full after saving (last 4 only), no provider is ever shown "connected" without a real test call, and no result is ever faked.
- The app code in this package is the EKAM Public Edition that was built and verified inside Muse on 18 Oct 2026 — same Divider, same learning, same Adjust, same matte red chat with the floating dots.

**EKAM Founded by Dev Mishra.**
