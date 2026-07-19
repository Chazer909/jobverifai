/*
 * Transcribes a short voice message or video clip using OpenAI's Whisper API
 * (whisper-1), which natively accepts audio *and* common video containers
 * (mp4/webm) and extracts the audio track itself -- so this one function
 * serves both the Voice and Video input modes.
 *
 * Setup required (see README.md): set OPENAI_API_KEY as an environment
 * variable in your Vercel project. Never put the key in client-side code.
 *
 * Honest limits, by design:
 *  - Vercel serverless functions cap the request body at 4.5MB, well under
 *    OpenAI's own 25MB file cap -- so this only works for SHORT clips
 *    (roughly under a minute of compressed voice, or a few seconds of video).
 *    That is a real platform constraint, not a bug; see README for the
 *    larger-file roadmap (client-side pre-compression / direct-to-storage
 *    upload).
 *  - Lao-language transcription accuracy is not guaranteed to match
 *    well-resourced languages -- Whisper documents "lo" as a supported
 *    language code, but real-world accuracy for Lao specifically is not
 *    well documented. The transcript is always shown to the user for
 *    correction before analysis, never analyzed silently.
 */

const ACCEPTED_TYPES = [
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/x-wav", "audio/webm",
  "audio/ogg", "audio/m4a", "audio/mp4", "audio/flac",
  "video/mp4", "video/webm"
];
const MAX_BYTES = 4_000_000; // stay safely under Vercel's 4.5MB hard limit

function extFor(mime) {
  const m = (mime || "").toLowerCase();
  if (m.includes("webm")) return m.startsWith("video") ? "webm" : "webm";
  if (m.includes("mp4") || m.includes("m4a")) return m.startsWith("video") ? "mp4" : "m4a";
  if (m.includes("wav")) return "wav";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("flac")) return "flac";
  return "mp3";
}

async function readRawBody(req) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > MAX_BYTES + 1024) {
      throw Object.assign(new Error("too_large"), { code: "too_large" });
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Sabai-Mode");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }

  if (!process.env.OPENAI_API_KEY) {
    res.status(500).json({
      ok: false,
      error: "Voice/video checking isn't configured yet -- the site owner needs to add an OPENAI_API_KEY (see README.md)."
    });
    return;
  }

  const contentType = (req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
  if (!ACCEPTED_TYPES.includes(contentType)) {
    res.status(400).json({ ok: false, error: "Unsupported file type. Try a common voice-note or short video format (m4a, mp3, ogg, wav, mp4, webm)." });
    return;
  }

  let buf;
  try {
    buf = await readRawBody(req);
  } catch (e) {
    if (e.code === "too_large") {
      res.status(413).json({ ok: false, error: "That file is too large. Please keep voice notes under about a minute, or trim the video to a few seconds." });
      return;
    }
    res.status(400).json({ ok: false, error: "Could not read the uploaded file." });
    return;
  }
  if (!buf.length) { res.status(400).json({ ok: false, error: "No file received." }); return; }

  try {
    const form = new FormData();
    const blob = new Blob([buf], { type: contentType });
    form.append("file", blob, "upload." + extFor(contentType));
    form.append("model", "whisper-1");
    form.append("language", "lo"); // hint only -- Whisper will still often auto-detect correctly for non-Lao audio

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: "Bearer " + process.env.OPENAI_API_KEY },
      body: form,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!resp.ok) {
      let detail = "";
      try { const j = await resp.json(); detail = (j && j.error && j.error.message) || ""; } catch (e) {}
      res.status(200).json({
        ok: false,
        error: resp.status === 401
          ? "The transcription service isn't configured correctly (invalid API key)."
          : "Couldn't transcribe that file" + (detail ? ": " + detail : ".")
      });
      return;
    }

    const data = await resp.json();
    const text = (data && data.text || "").trim();
    if (!text) { res.status(200).json({ ok: false, error: "We couldn't make out any speech in that file." }); return; }
    res.status(200).json({ ok: true, text });
  } catch (e) {
    res.status(200).json({ ok: false, error: "Couldn't reach the transcription service right now. Please try again." });
  }
};

module.exports._internal = { extFor, ACCEPTED_TYPES, MAX_BYTES };
