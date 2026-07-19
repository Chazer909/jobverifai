const dns = require("dns").promises;
const net = require("net");

/* ---------------- SSRF guard ---------------- */
function isPrivateIp(ip) {
  const v = net.isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p[0] === 10) return true;
    if (p[0] === 127) return true;
    if (p[0] === 0) return true;
    if (p[0] === 169 && p[1] === 254) return true; // link-local incl. cloud metadata (169.254.169.254)
    if (p[0] === 172 && p[1] >= 16 && p[1] <= 31) return true;
    if (p[0] === 192 && p[1] === 168) return true;
    if (p[0] === 100 && p[1] >= 64 && p[1] <= 127) return true; // CGNAT
    return false;
  }
  if (v === 6) {
    const low = ip.toLowerCase();
    if (low === "::1") return true;
    if (low.startsWith("fc") || low.startsWith("fd")) return true; // unique local
    if (low.startsWith("fe80")) return true; // link-local
    if (low.startsWith("::ffff:")) return isPrivateIp(low.replace("::ffff:", ""));
    return false;
  }
  return true; // unknown shape -> fail closed
}

async function resolveIsSafe(hostname) {
  // Returns { safe, reason } instead of a bare boolean so callers can tell a genuine
  // DNS/network failure apart from an actual private-IP block (different user-facing message).
  try {
    const { address } = await dns.lookup(hostname);
    return { safe: !isPrivateIp(address), reason: isPrivateIp(address) ? "private" : null };
  } catch (e) {
    return { safe: false, reason: "dns" };
  }
}

/* ---------------- HTML -> text extraction (no external deps) ---------------- */
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractText(html) {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

  const ogDescMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i) ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i);
  const ogDesc = ogDescMatch ? decodeEntities(ogDescMatch[1]).trim() : "";

  let body = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6]|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, " ");

  body = decodeEntities(body).replace(/[ \t]+/g, " ").replace(/\n[ \t]*\n+/g, "\n").trim();

  const combined = [title, ogDesc, body].filter(Boolean).join("\n").slice(0, 6000);
  return { text: combined, title };
}

/* ---------------- handler ---------------- */
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "POST") { res.status(405).json({ ok: false, error: "POST only" }); return; }

  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  const rawUrl = ((body && body.url) || "").trim();

  let target;
  try {
    target = new URL(rawUrl);
  } catch (e) {
    res.status(400).json({ ok: false, error: "That doesn't look like a valid link." });
    return;
  }
  if (target.protocol !== "http:" && target.protocol !== "https:") {
    res.status(400).json({ ok: false, error: "Only http/https links are supported." });
    return;
  }

  // Telegram public channels render server-side at /s/<name> — far more likely to return
  // real content than the JS-only app view at t.me/<name>.
  if (/(^|\.)t\.me$/i.test(target.hostname) && !target.pathname.startsWith("/s/")) {
    target.pathname = "/s" + target.pathname;
  }

  // TikTok pages are a JS-only app shell — a plain server fetch won't see the caption.
  // Try TikTok's public oEmbed endpoint first (caption + creator name, no login), and
  // fall through to the generic fetch below only if that fails. Note: this does NOT see
  // anything spoken in the video itself — that would need the Voice/Video transcription
  // path, not this link checker.
  if (/(^|\.)tiktok\.com$/i.test(target.hostname)) {
    try {
      const oembedUrl = "https://www.tiktok.com/oembed?url=" + encodeURIComponent(target.toString());
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const oResp = await fetch(oembedUrl, { signal: controller.signal, headers: { "User-Agent": "Mozilla/5.0 (compatible; SabaiJobLinkCheck/1.0)" } });
      clearTimeout(timer);
      if (oResp.ok) {
        const oData = await oResp.json();
        const combined = [oData.title, oData.author_name ? "By: " + oData.author_name : ""].filter(Boolean).join("\n");
        if (combined && combined.length > 5) {
          res.status(200).json({ ok: true, text: combined, title: oData.title || "", finalUrl: target.toString(), source: "tiktok-oembed" });
          return;
        }
      }
      // oEmbed reachable but had nothing useful -- fall through to generic fetch below.
    } catch (e) {
      // oEmbed unreachable or blocked -- fall through to generic fetch below.
    }
  }

  const preCheck = await resolveIsSafe(target.hostname);
  if (!preCheck.safe) {
    res.status(400).json({
      ok: false,
      error: preCheck.reason === "dns"
        ? "Couldn't resolve that address — check the link and try again."
        : "That address can't be checked."
    });
    return;
  }

  let html, finalUrl;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(target.toString(), {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; SabaiJobLinkCheck/1.0; job-offer safety checker)"
      }
    });
    clearTimeout(timer);
    finalUrl = resp.url || target.toString();

    // Re-validate the *final* host after redirects (basic anti-SSRF-via-redirect check;
    // note: does not pin the resolved IP for the fetch itself, a known simplification for
    // a hackathon prototype — production hardening would pin the IP at connect time).
    const finalHost = new URL(finalUrl).hostname;
    const finalCheck = await resolveIsSafe(finalHost);
    if (!finalCheck.safe) {
      res.status(400).json({ ok: false, error: "That address can't be checked." });
      return;
    }

    if (!resp.ok) {
      res.status(200).json({ ok: false, reason: "That page returned an error (HTTP " + resp.status + ").", finalUrl: finalUrl });
      return;
    }
    const contentType = resp.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      res.status(200).json({ ok: false, reason: "That link isn't a readable web page.", finalUrl: finalUrl });
      return;
    }
    const buf = await resp.arrayBuffer();
    const capped = buf.byteLength > 2000000 ? buf.slice(0, 2000000) : buf;
    html = Buffer.from(capped).toString("utf8");
  } catch (e) {
    res.status(200).json({
      ok: false,
      reason: "Couldn't load that page automatically -- it may require login (common for private Telegram/Facebook posts) or be blocking automated access.",
      finalUrl: target.toString()
    });
    return;
  }

  const extracted = extractText(html);
  const text = extracted.text;
  const title = extracted.title;
  if (!text || text.length < 20) {
    res.status(200).json({ ok: false, reason: "That page didn't have enough readable text to check.", finalUrl: finalUrl });
    return;
  }
  res.status(200).json({ ok: true, text: text, title: title, finalUrl: finalUrl });
};

module.exports._internal = { isPrivateIp: isPrivateIp, extractText: extractText, decodeEntities: decodeEntities };