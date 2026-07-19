# JobVerifAI — Full System (Check + Practice + Learn)

**This is the rebranded, full-feature version** (formerly "SabaiJob-Full"). It is the confidential, three-pillar build and should stay local until you're ready, close to the July 24, 2026 final presentation, to avoid the idea being seen or copied early. The checker-only version in `SabaiJob-v2` (and the matching proposal) remains the one safe to share or submit earlier if needed.

## Branding & visual identity

- **Name:** JobVerifAI (wordmark: `JobVerif` in navy + `AI` in aqua).
- **Logo:** a navy rounded-square badge holding an aqua shield with a white verification check (see `logo.svg`, and the inline SVG used in the app header + favicon).
- **Palette:** Aqua Blue `#12AEC4` (primary action, accents), Navy Blue `#0A2540` (text, headers, trust cards), White `#FFFFFF` (surfaces), on a very light aqua-white page background `#F4F9FB`. Risk states keep their own semantic colours (red / amber / teal-green).
- **Design language:** minimalist, uncluttered, professional — white cards with hairline borders and soft shadows, generous spacing, a single accent colour, no decorative noise.

## Language support (fully separated, never mixed)

The interface is fully bilingual, but each language is **pure** — the Lao interface shows only Lao, the English interface shows only English, with a `ລາວ / EN` toggle in the header. Every user-facing string (UI, red-flag names and explanations, the Practice scenario, Learn resources, error messages, the share text) is stored as a `{ lo, en }` pair and rendered through a single-language helper, so no screen ever mixes the two. Default language is Lao.

## Responsive design

Mobile-first and fully responsive via a fluid container plus CSS breakpoints: a single-column card layout on phones, wider and roomier on tablets, and the Learn resources switch to a two-column grid at ≥680px. Layout, navigation, tap targets, and type all adapt from small phones up to desktop.

## Three pillars

- **Check** — the job-offer verifier: Text, Image, Voice/Video, and Link (including TikTok) input. Same rule-based red-flag engine as before.
- **Practice** — a branching simulator. A friend character ("Bee") sends a job offer message by message. At every step you choose **Keep going** or **Go check the job information** — the second option runs the real verifier live on everything said so far. Going "keep going" the whole way leads to a factual, non-graphic description of where that path leads in documented cases, followed immediately by the same safety steps and the 1362 hotline — it never ends on a scary note without a next step. Choosing "check" is the deliberately praised, correct outcome.
- **Learn** — a resources section citing real, publicly published materials with attribution and outbound links (not re-hosted as JobVerifAI's own): VFI's *The Life of Miss Noy*, VFI's Human Trafficking Legal Guidebook, VFI's PEWC Good Practices Report, and the Lao Women's Union's 1362 hotline. Nothing here implies VFI has agreed to a partnership.

## What's unchanged from the previous full build

The Check engine and all four input modes, the 3-pillar navigation, and both serverless functions (`api/check-link.js`, `api/transcribe.js`) are functionally identical. This release is a **rebrand + redesign + language separation** of the presentation layer, not a change to the scoring logic. Deployment steps are the same — including the `OPENAI_API_KEY` environment variable for Voice/Video.

## Honest limitations specific to this version

- The Lao copy (including the newly translated red-flag explanations) is machine-assisted draft, disclosed in-app, and still needs a native-speaker review before any real rollout.
- The Practice scenario is a single fixed 3-step storyline, written originally by us — inspired by, not a reproduction of, VFI's "Miss Noy" story.
- The Learn tab's "Miss Noy" cover image is hotlinked from VFI's own site rather than re-hosted, so it displays VFI's live asset with attribution; if VFI moves or removes that file the image would stop loading (the outbound link text still works).
- Not yet deployed to a live URL. Test locally by opening `index.html` in a browser; Link and Voice/Video modes need `vercel dev` or a real deployment because they depend on the serverless functions.
