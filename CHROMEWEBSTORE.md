# Chrome Web Store Listing — InstaReply AI

> Last Updated: 2026-09-14

---

## Store Listing

**Extension Name** [REQUIRED]
InstaReply AI - Smart Instagram Reply Assistant

**Short Description** [REQUIRED] (130 / 132 chars)
Draft smart, contextual replies to Instagram comments, Reels, DMs, and Stories with multi-tone bundling and AI visual awareness.

**Detailed Description** [REQUIRED]
InstaReply AI is a fast, privacy-first Chrome Extension that drafts authentic, context-aware responses directly inside Instagram comments, Reels, Direct Messages (DMs), and Stories.

Connect your own AI model (Google Gemini, Groq, OpenRouter, local Ollama, or custom OpenAI endpoints) and craft personalized, high-engagement replies with one click.

KEY FEATURES
• Instagram Stories Support — Injects a shortcut button directly into the Story reply composer. Accurately extracts story context, detects shared Reels/Posts, pauses story playback while drafting, and automatically excludes emoji trays or navigation buttons.
• Post & Reel Comments — Injects an inline shortcut button next to "Post" and "✨ AI Reply" chips next to individual comment replies. Automatically distinguishes whether you are the post creator or an engaging visitor.
• Fullscreen & Floating PIP DMs — Works in both fullscreen Direct Messages and floating mini-windows, with instant reply chips on received messages.
• Visual Scene Awareness — Incorporates post/reel imagery, video posters, and accessibility alt descriptions so the AI understands what the photo or video actually depicts.
• 10+ Tone Presets — Friendly, Funny, Playful, Savage, Geek, Spicy, Hyped, Professional, Empathetic, and Short.
• Zero-Latency Multi-Tone Bundling — Generates all tone variations in a single request for instantaneous tone switching.
• 1-Click Stance Control — Toggle between Positive (supportive/warm), Neutral (balanced/objective), and Negative (firm boundary/polite decline).
• Multi-Language Replies — Auto-detects the conversation language or select from 10+ languages (English, Spanish, French, German, Italian, Portuguese, Japanese, Traditional/Simplified Chinese, Korean).
• Draft Hint Guidance — Type keywords or guidelines into the input box (e.g. "ask for email" or "mention discount code") to direct the AI draft.

SUPPORTED AI PROVIDERS
• Google Gemini API (gemini-2.0-flash, gemini-1.5-flash, gemini-1.5-pro, gemini-1.5-flash-8b) with dynamic model fetching
• Groq Cloud API (high-speed LPU inference with Llama 3.3 70B, Llama 3.1 8B, Mixtral 8x7B)
• OpenRouter (free tier access to Llama, DeepSeek R1, Qwen 2.5, Mistral)
• Custom OpenAI-Compatible Endpoints (GitHub Models, Mistral AI, Azure, DeepSeek, Cerebras)
• Local LLMs (Ollama or LM Studio on localhost for 100% offline private processing)
• Chrome Built-in Prompt API (Gemini Nano on-device AI)

HOW TO USE
1. Click the InstaReply AI icon in your Chrome toolbar to open Settings.
2. Select your AI provider and paste your API key (or configure local Ollama).
3. Open any Instagram post, reel, DM thread, or Story on instagram.com.
4. Click the InstaReply AI shortcut button or inline "✨ AI Reply" chip.
5. Select your desired stance or tone, review the AI draft, and click "Insert Reply" to populate the text box.

PRIVACY & SECURITY
InstaReply AI is built with a direct client-to-API architecture. Your data and API keys are stored locally on your device via Chrome's secure storage. We do NOT operate any proxy servers, we do NOT collect or track your browsing activity, and we NEVER sell your data. All AI requests travel directly from your browser to your selected AI provider over HTTPS.

PERMISSIONS EXPLAINED
• "storage" — Saves your API keys, preferences, and custom tone instructions locally in Chrome.
• "activeTab" — Opens the settings popup for the active browser tab.
• "declarativeNetRequest" — Strips origin headers strictly for requests to local offline endpoints (localhost / 127.0.0.1) so local LLMs (Ollama / LM Studio) work seamlessly.
• Host Permissions — Communicates with your chosen AI API endpoints (Google, Groq, OpenRouter, or your custom endpoint) and fetches public post thumbnails for visual analysis.

SUPPORT & FEEDBACK
Questions, feedback, or bug reports?
• Email: fung@androidfung.com
• GitHub: https://github.com/seventhmoon/insta-reply-extension/issues

Version 1.0.0 — Initial public release with full support for Comments, Reels, Direct Messages, Stories, and multi-provider AI.

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Drafts contextual, tone-customized responses to Instagram comments, Direct Messages, Reels, and Stories.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename / Location |
| :--- | :--- | :--- | :--- |
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon128.png` |
| Screenshot 1 [REQUIRED] | 1280×800 or 640×400 | ⬜ To capture | Story Reply Assistant Card on Instagram Story |
| Screenshot 2 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ To capture | Post & Reel Comments with inline AI Reply chips |
| Screenshot 3 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ To capture | Direct Message (DM) chat reply in mini-window |
| Screenshot 4 [RECOMMENDED] | 1280×800 or 640×400 | ⬜ To capture | Popup Settings with Multi-Provider Combobox |
| Small Promo Tile [RECOMMENDED] | 440×280 PNG/JPEG | ⬜ To create | `promo/promo-small.png` |
| Marquee Promo Tile | 1400×560 PNG/JPEG | ⬜ Optional | `promo/promo-marquee.png` |

### Screenshot Guidance
1. **Screenshot 1 (Story Reply)**: Open an Instagram Story with text or image. Click the InstaReply shortcut button to display the floating card showing the Story badge `📸 Replying to @creator's Story (sent via DM)`, visual analysis, and tone chips.
2. **Screenshot 2 (Feed/Reel Comments)**: View an Instagram post/reel comment section showing the injected shortcut button next to "Post" and inline "✨ AI Reply" chips next to individual comments.
3. **Screenshot 3 (DMs)**: View an Instagram DM conversation showing inline reply chips on chat bubbles and drafted response.
4. **Screenshot 4 (Settings)**: View the extension popup showcasing the AI provider dropdown (Gemini, Groq, OpenRouter, Local LLM), stance selection, and tone presets.

---

## Permissions Justification

| Permission | Type | Exact Justification for Chrome Web Store Reviewers |
| :--- | :--- | :--- |
| `storage` | `permissions` | Required to securely persist the user's API keys (Gemini, Groq, OpenRouter), default tone and stance preferences, custom persona rules, and locally cached reply drafts. |
| `activeTab` | `permissions` | Required to interact with the active tab when the user clicks the toolbar action button to configure settings. |
| `declarativeNetRequest` | `permissions` | Required strictly to modify the `Origin` header on requests to `http://localhost:*` and `http://127.0.0.1:*`, allowing users to connect to local offline LLMs (such as Ollama or LM Studio) without encountering CORS origin rejections. |
| `https://*.instagram.com/*` | `host_permissions` / `content_scripts` | Required to inject the InstaReply AI shortcut button, inline comment reply chips, and floating assistant card into Instagram's web interface, and to read the comment/DM/story context when triggered by the user. |
| `https://*/*` | `host_permissions` | Required to dispatch AI generation requests to user-configured third-party AI endpoints (including Google Gemini, Groq, OpenRouter, or custom OpenAI-compatible server URLs), and to fetch public image thumbnails from Instagram CDNs for AI vision analysis. |
| `http://localhost:*/*`, `http://127.0.0.1:*/*` | `host_permissions` | Required to allow users who select "Local LLM" to send prompt generation requests directly to locally hosted Ollama or LM Studio servers. |

---

## Privacy & Data Use

### Data Collection Disclosure

**Does the extension collect user data?** Yes (Transmitted directly to third-party AI APIs chosen by the user).

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
| :--- | :--- | :--- | :--- | :--- |
| Personally identifiable info | No | No | N/A | No |
| Health info | No | No | N/A | No |
| Financial info | No | No | N/A | No |
| Authentication info | Yes (API Keys) | No (Stored locally in `chrome.storage`) | Used only for authenticating requests to the user's selected AI provider. | No. Never shared with our servers. |
| Personal communications | Yes (Only when triggered) | Yes (Sent to selected AI API) | The text of the comment, DM message, or story sticker being replied to is sent to the AI model to generate a relevant draft. | Shared only with the user's selected AI provider (Google, Groq, OpenRouter, or custom endpoint). |
| Location | No | No | N/A | No |
| Web history | No | No | N/A | No |
| User activity | No | No | N/A | No |
| Website content | Yes (Only on user click) | Yes (Sent to selected AI API) | Post caption, image alt text, and comment text on the active Instagram interaction are read to provide context for AI generation. | Sent only to the AI provider chosen by the user. |

### Data Use Certification
- [x] Data is NOT sold to third parties.
- [x] Data is NOT used for purposes unrelated to the extension's core functionality.
- [x] Data is NOT used for creditworthiness or lending purposes.

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
https://github.com/seventhmoon/insta-reply-extension/blob/main/PRIVACY.md

*(Alternative: can also be hosted on GitHub Pages or custom domain)*

---

## Distribution

**Visibility**: Public
**Regions**: All regions
**Pricing**: Free

---

## Developer Info

**Publisher Name** [REQUIRED]: Fung Lam
**Contact Email** [REQUIRED]: fung@androidfung.com
**Support URL / Issues** [RECOMMENDED]: https://github.com/seventhmoon/insta-reply-extension/issues
**Homepage URL** [RECOMMENDED]: https://github.com/seventhmoon/insta-reply-extension

---

## Version History

| Version | Date | Changes | Status |
| :--- | :--- | :--- | :--- |
| 1.0.0 | 2026-09-14 | Initial public release with full support for Instagram Comments, Reels, Direct Messages, and Stories. Integrated Google Gemini, Groq, OpenRouter, Custom OpenAI, and Local LLM endpoints. | Draft / Ready for Submission |
