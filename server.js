/*
 * server.js — minimal Node/Express host for JobVerifAI on a normal server
 * (AWS EC2 / Lightsail, or any VM). It serves the single-file app plus the two
 * API routes that the Vercel build ran as serverless functions, so you get the
 * FULL app (Text, Image, Voice/Video, Link/TikTok) from one process.
 *
 *   npm install
 *   OPENAI_API_KEY=sk-... node server.js     # all features, incl. Voice/Video
 *   node server.js                           # Text + Image + Link work; Voice shows a setup note
 *
 * Requires Node 18+ (uses built-in fetch / FormData / Blob — no extra deps for the API logic).
 */
const express = require("express");
const path = require("path");

const app = express();

// /api/transcribe streams the raw request body itself — it must NOT be body-parsed.
app.post("/api/transcribe", require("./api/transcribe"));

// /api/check-link expects a parsed JSON body.
app.post("/api/check-link", express.json({ limit: "1mb" }), require("./api/check-link"));

// The app (single HTML file). logo.svg served too in case it is referenced.
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "index.html")));
app.get("/logo.svg", (req, res) => res.sendFile(path.join(__dirname, "logo.svg")));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("JobVerifAI running on http://0.0.0.0:" + PORT);
  if (!process.env.OPENAI_API_KEY) {
    console.log("Note: OPENAI_API_KEY not set -> Voice/Video will show a setup message. Text, Image and Link checks still work.");
  }
});
