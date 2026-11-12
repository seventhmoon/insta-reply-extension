# Chrome Web Store Listing — InstaReply AI

> Last Updated: 2026-11-11

---

## Store Listing

**Extension Name** [REQUIRED] (50 / 75 chars)
InstaReply AI - Social Media Assistant for Instagram

**Short Description** [REQUIRED] (105 / 132 chars)
Draft context-aware replies, posts, and messages across social platforms and editable web fields with AI.

**Detailed Description** [REQUIRED]
InstaReply AI is a fast, privacy-first Chrome Extension that drafts authentic, context-aware responses, posts, and message refinements across major social platforms and any editable text field on the web.

Connect your own AI model (Google Gemini, Groq, OpenRouter, local Ollama, custom OpenAI endpoints, or Chrome Built-in AI) and craft personalized, high-engagement replies with one click.

KEY FEATURES
• Context-Aware Comments, DMs & Stories — Injects lightweight reply shortcuts next to composers and comments so you stay focused in your feed or inbox. Automatically distinguishes whether you are the original creator or a visitor.
• Universal Right-Click Refine & Reply — Highlight text or right-click inside any editable text box on any website and choose "✨ InstaReply AI" to rewrite, polish, or draft a response using visible page context.
• Persistent Side Panel & Inbox Zero Triage — Dock InstaReply AI in Chrome's Side Panel, scan visible unanswered comments/reviews into a keyboard-navigable queue, and insert drafts side-by-side without losing focus.
• Custom Knowledge Base, Personas & /Slash Macros — Switch between Creator, Founder, Maintainer, and Customer Support personas, attach verified FAQ facts, and expand `/slash` snippet macros directly in your drafts.
• Visual Scene Awareness — Incorporates post/reel imagery, video posters, and accessibility descriptions so your AI drafts reflect what the media actually shows.
• 1-Click Stance, Multi-Tone Bundling & Translation — Toggle Positive, Neutral, or Negative stance, switch tones instantly (Friendly, Witty, Professional, Empathetic, Concise, and more), preview bilingual translations, or generate numbered multi-part threads.
• Voice Style Mimicry ("Learn My Voice") & Anti-Troll Shield — Teach the assistant your writing style with sample replies and spot spam/troll bait before drafting.

SUPPORTED AI PROVIDERS
• Google Gemini API (with dynamic model fetching)
• Groq Cloud API (Llama, Mixtral)
• OpenRouter (multi-model free & paid tiers)
• Custom OpenAI-Compatible Endpoints (Azure, GitHub Models, Mistral, DeepSeek, etc.)
• Local LLMs (Ollama or LM Studio on localhost for 100% offline processing)
• Chrome Built-in AI (Gemini Nano on-device processing)

HOW TO USE
1. Click the InstaReply AI icon in your Chrome toolbar (or open the persistent Side Panel) to open Settings.
2. Select your AI provider and enter your API key (or configure local Ollama).
3. Browse supported social feeds, inboxes, or right-click inside any text field on the web.
4. Click the InstaReply AI shortcut button, inline "✨ AI Reply" chip, or right-click menu item.
5. Choose your stance, tone, or persona, review the draft, and click "Insert Reply".

PRIVACY & SECURITY
InstaReply AI runs directly in your browser with no intermediate developer servers. Sensitive API keys are isolated locally on your device, and we do NOT collect, log, track, or sell your browsing history or data. All AI requests travel directly from your browser to your selected AI provider over HTTPS (or stay 100% offline for Local LLMs / Built-in AI).

PERMISSIONS EXPLAINED
• "storage" — Saves your API keys locally, syncs preferences/personas, and keeps temporary session caches.
• "declarativeNetRequest" — Adjusts origin headers strictly for local offline endpoints (`localhost` / `127.0.0.1`) so local LLMs connect reliably.
• "sidePanel" — Enables docking the assistant alongside any tab for side-by-side drafting and triage.
• "contextMenus" — Powers the right-click "✨ InstaReply AI" menu in editable text fields and selected text on any page.
• Host & Optional Host Permissions — Strictly scoped to Instagram, your chosen AI endpoints, localhost servers, and on-demand custom OpenAI URLs.

DOCUMENTATION
For setup instructions, FAQ, and open-source code, visit:
https://github.com/seventhmoon/insta-reply-extension

SUPPORT & FEEDBACK
Questions, feedback, or bug reports?
• Email: fung@androidfung.com
• GitHub: https://github.com/seventhmoon/insta-reply-extension/issues

Version 1.4.3 — Features Side Panel Live Reply & Inbox Zero Triage, Knowledge Base & Multi-Persona profiles, /slash snippet macros, Bilingual preview, Thread Composer, universal right-click text refinement, scoped credential isolation, header API auth, and code quality hardening.

**Category** [REQUIRED]
Social & Communication

**Single Purpose** [REQUIRED]
Drafts contextual, tone-customized replies, posts, and text refinements across social feeds, inboxes, and editable web fields with AI.

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
| Small Promo Tile [RECOMMENDED] | 440×280 PNG | ✅ Ready | `promo/promo-small.png` |
| Marquee Promo Tile | 1400×560 / 1440×560 PNG | ✅ Ready | `promo/promo-marquee.png` |

### Screenshot Guidance
1. **Screenshot 1 (Story Reply)**: Open an Instagram Story with text or image. Click the InstaReply shortcut button to display the floating card showing the Story badge `📸 Replying to @creator's Story (sent via DM)`, visual analysis, and tone chips.
2. **Screenshot 2 (Feed/Reel Comments)**: View an Instagram post/reel comment section showing the injected shortcut button next to "Post" and inline "✨ AI Reply" chips next to individual comments.
3. **Screenshot 3 (DMs)**: View an Instagram DM conversation showing inline reply chips on chat bubbles and drafted response.
4. **Screenshot 4 (Settings)**: View the extension popup showcasing the AI provider dropdown (Gemini, Groq, OpenRouter, Local LLM), stance selection, and tone presets.

---

## Permissions Justification

| Permission | Type | Exact Justification for Chrome Web Store Reviewers |
| :--- | :--- | :--- |
| `storage` | `permissions` | Required to store sensitive API keys strictly locally in `chrome.storage.local`, sync non-sensitive user preferences, personas, and `/slash` macros via `chrome.storage.sync`, and maintain ephemeral draft caches in `chrome.storage.session`. |
| `declarativeNetRequest` | `permissions` | Required strictly to strip the `Origin` header on requests to `http://localhost:*` and `http://127.0.0.1:*`, allowing users who choose "Local LLM" to connect to local Ollama or LM Studio servers without CORS rejections. |
| `sidePanel` | `permissions` | Required to let users dock InstaReply AI in Chrome's persistent Side Panel to draft replies, run Inbox Zero triage, and refine text side-by-side while browsing. |
| `contextMenus` | `permissions` | Required to provide the right-click "✨ InstaReply AI" context menu on editable text fields and selected text, enabling users to refine drafts or generate replies using visible page context on any website. |
| `https://*.instagram.com/*`, AI API hosts, `http://localhost:*/*` | `host_permissions` | Scoped to Instagram and the built-in AI API endpoints (Google Gemini, Groq, OpenRouter, localhost Ollama/LM Studio) for contextual reading and direct user-configured API requests. |
| `https://*/*` | `optional_host_permissions` | Requested interactively only when the user configures a custom OpenAI-compatible server URL and clicks Save, enabling direct API calls to their self-hosted endpoint. |
| `https://*/*`, `http://*/*` | `content_scripts` / `web_accessible_resources` | Injects lightweight shortcut UI on supported community/social platforms and enables the user-triggered right-click "✨ InstaReply AI" assistant on any website's editable inputs. Remains dormant until explicitly triggered by the user. |

---

## Privacy & Data Use

### Data Collection Disclosure

**Does the extension collect user data?** Yes (Transmitted directly from the user's browser only to the third-party AI API selected by the user, on explicit click/trigger).

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
| :--- | :--- | :--- | :--- | :--- |
| Personally identifiable info | No | No | N/A | No |
| Health info | No | No | N/A | No |
| Financial info | No | No | N/A | No |
| Authentication info | Yes (User's own API Keys) | No (Isolated in `chrome.storage.local`, sent only in auth headers to the user's chosen AI provider) | Used strictly to authenticate requests to the user's selected AI provider. | No developer servers. Authenticated directly with chosen AI provider only. |
| Personal communications | Yes (Only when triggered) | Yes (Sent directly to chosen AI API; never for Local LLM / Built-in AI) | Comment, DM, email, review, or user draft text being replied to is sent to generate a contextual draft. | Sent only to the user's configured AI provider. |
| Location | No | No | N/A | No |
| Web history | No | No | N/A | No |
| User activity | No | No | N/A | No |
| Website content | Yes (Only on user click / right-click) | Yes (Sent directly to chosen AI API) | Visible post caption, thread context, page title/summary, or media alt text around the target composer is read only when the user activates the assistant. | Sent only to the user's configured AI provider. |

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
| 1.0.0 | 2026-09-14 | Initial public release with full support for Instagram Comments, Reels, Direct Messages, and Stories. Integrated Google Gemini, Groq, OpenRouter, Custom OpenAI, and Local LLM endpoints. | Complete |
| 1.1.0 | 2026-09-17 | 1-Click Quick Reply (zero-dialog direct insertion into input field), Few-Shot Style Mimicry ("Learn My Voice"), Anti-Troll & Spam Shield, Draggable & Minimizable Card, and ultra-compact composer layout preserving maximum typing space. | Complete |
| 1.2.0 | 2026-09-19 | Resizable Settings Popup with storage persistence; fully resizable in-page Assistant Card with vertical textarea auto-expansion; desktop tone navigation with chevrons, mouse-wheel scroll, and 16-tone grid view toggle; GitHub Sponsors integration; Story composer capsule alignment fix. | Complete |
| 1.3.0 | 2026-09-21 | Multi-Platform Expansion: Added comprehensive support for X (Twitter), LinkedIn, and Facebook with modular platform adapters, Draft.js/Lexical rich-text editor insertion, 280-character boundary limits for tweets, and professional networking tone bias for LinkedIn. | Complete |
| 1.4.0 | 2026-09-26 | Character Limit Engine: Real-time character counter badge, over-limit warnings, 1-click Auto-Trim button, strict 280-char enforcement on X and 500-char on Threads, Meta Business Suite support, and Chrome Web Store manifest optimization. | Complete |
| 1.4.1 | 2026-09-28 | Policy Compliance Update: Reduced social media brand mentions in store description to 4 platforms (Instagram, Threads, X, LinkedIn) and added external documentation link to comply with CWS Keyword Stuffing policy. | Complete |
| 1.4.2 | 2026-10-03 | Permissions Audit (Purple Potassium Fix): Removed unused `activeTab` permission from `manifest.json`. The extension uses declarative content scripts and a dedicated action popup, which do not require `activeTab`. Verified that all remaining permissions (`storage`, `declarativeNetRequest`) are actively used. | Complete |
| 1.4.3 | 2026-10-17 | Security & Resilience Hardening: Scoped host permissions and isolated API credentials in local storage. Added exponential backoff retry logic, x-goog-api-key header authentication, Prompt API bridge handshake token, session caching, DOM comment selector performance optimization, and Settings History tab. | Ready for Submission |
