# JobVerifAI — Hosting on AWS

JobVerifAI is a **single-file web app** (`index.html`, plain HTML/CSS/JavaScript, no
build step) plus **two small Node.js API routes** in `api/`. There are two ways to
host it. Pick one.

---

## What each feature needs

| Feature (in the "Check" tab) | Needs a server? | Notes |
|---|---|---|
| Text check          | No  | Runs 100% in the browser |
| Image check (OCR)   | No  | Runs in the browser (Tesseract.js) |
| Link / TikTok check | Yes | Uses `api/check-link.js` |
| Voice / Video check | Yes | Uses `api/transcribe.js` + an `OPENAI_API_KEY` |
| Practice, Learn     | No  | All in the browser |

So: **static hosting = Text + Image only. Node hosting = everything.**

---

## Option A — Static only (S3), fastest & cheapest

Use this if you only need the **Text + Image** demo. Host the file at
`docs/index.html` — a build where Link/Voice are gracefully disabled with a note.

1. S3 → Create bucket → enable **Static website hosting** (index document = `index.html`).
2. Upload `docs/index.html` as `index.html`.
3. Make it publicly readable via bucket policy — or put **CloudFront** in front for HTTPS + speed.
4. Done. The S3 website endpoint (or CloudFront URL) is your link.

No Node, no API keys, near-zero cost.

---

## Option B — Full app (EC2 / Lightsail), all features  ← recommended

Runs the whole app, including Link and Voice/Video, from one Node process using
`server.js`.

**Requirements:** Node **18 or newer** (the API uses built-in `fetch`/`FormData`).

```bash
git clone https://github.com/Chazer909/jobverifai.git
cd jobverifai

# express is the only runtime dependency of server.js.
# (It is intentionally NOT in package.json, to keep the Vercel build clean.)
npm install express

# run it
export OPENAI_API_KEY=sk-...   # only needed for Voice/Video; omit to skip that feature
node server.js                 # serves on port 3000

# keep it running after you log out (recommended):
sudo npm install -g pm2
pm2 start server.js --name jobverifai
pm2 save
```

**Open the port / add HTTPS**
- Simplest: in the EC2 **Security Group**, allow inbound TCP **3000** (or run with
  `PORT=80 node server.js` and allow **80**). The app is then at `http://<server-ip>:3000`.
- Better (HTTPS + clean URL): put **nginx** in front as a reverse proxy to
  `localhost:3000` and add a free TLS cert with `certbot`. Judges scanning a QR code on
  mobile will trust an `https://` link far more than a raw IP address.

**Environment variable (Voice/Video only)**
- `OPENAI_API_KEY` — used server-side by `api/transcribe.js` for Whisper transcription.
  Keep it on the server as an env var, **never** in the HTML and **never** committed to
  git. Without it, every other feature still works and Voice simply shows a friendly
  "not configured" message.

---

## Repository layout

```
index.html          full app (Text, Image, Voice/Video, Link/TikTok)  -> Vercel
docs/index.html     static-only build (Link/Voice disabled)           -> Cloudflare Pages / S3
server.js           Express host for Option B (AWS EC2 etc.)
api/check-link.js   Link/TikTok checker (server-side)
api/transcribe.js   Voice/Video transcription (needs OPENAI_API_KEY)
logo.svg            app logo
package.json        project metadata (no runtime deps by design)
vercel.json         Vercel function config (ignore for AWS)
```

## Quick local test
```bash
npm install express
node server.js
# open http://localhost:3000
```
