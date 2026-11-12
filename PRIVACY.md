# Privacy Policy for InstaReply AI

**Last updated:** November 11, 2026

InstaReply AI ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how information is handled when you use the InstaReply AI Google Chrome Extension.

---

## 1. Single Purpose & Overview

InstaReply AI is a browser productivity tool designed to help you draft contextual replies, posts, and refined messages across social platforms, community forums, email/review inboxes, and user-triggered editable fields on the web. 

**We operate with a strict privacy-first, client-only architecture:**
- We do **NOT** own, operate, or route your data through any intermediate server.
- We do **NOT** collect, log, track, sell, or monetize any personal data.
- All AI processing requests are dispatched directly from your browser to your chosen AI provider (e.g. Google Gemini, Groq, OpenRouter, or your local/private LLM).

---

## 2. What Information Is Handled

InstaReply AI only handles the minimum data necessary to generate relevant reply drafts when you explicitly interact with the extension:

1. **User Configuration, Personas & Knowledge Base**:
   - Your API keys (e.g., Google Gemini, Groq, OpenRouter, or custom OpenAI endpoints).
   - Your preferences (default tone, stance, language, active persona profile, custom voice samples, custom `/slash` snippet macros, and FAQ/Knowledge Base entries).
   - *Storage:* Sensitive API keys are isolated locally on your device via `chrome.storage.local` (never synced to Google servers), while non-sensitive preferences and personas are stored via `chrome.storage.sync` (with automatic local fallback).

2. **On-Page Context (Ephemeral & User-Triggered Only)**:
   - InstaReply AI **never** scrapes or transmits browsing history in the background. Only when you click the InstaReply AI shortcut button, inline reply chip, Inbox Zero Triage scan, or right-click **✨ InstaReply AI** context menu item does the extension read the immediate interaction context:
     - The target comment, DM message, email thread, review, issue, or story text.
     - Related post caption, page title/summary, or nearby conversation context (if enabled).
     - Visual description (accessibility alt text or video poster) to understand media context.
     - Any draft text or hint keywords you typed into the editable field or highlighted before invoking the menu.
   - *Processing:* This context is assembled into a prompt and transmitted directly to your configured AI provider over HTTPS (or processed on-device via Local LLM / Chrome Built-in AI).
   - *Retention:* Generated drafts are cached ephemerally in session/local memory (`chrome.storage.session` / `chrome.storage.local` reply history) solely to avoid duplicate API calls and let you review recent drafts. Nothing is transmitted to any server operated by us.

---

## 3. Third-Party Services & AI Providers

InstaReply AI allows you to connect your own API key to the AI provider of your choice. When you generate a reply, the prompt context is sent directly to that provider:

- **Google Gemini API**: Subject to [Google AI Studio & Gemini API Terms of Service](https://ai.google.dev/terms) and [Google Privacy Policy](https://policies.google.com/privacy).
- **Groq Cloud**: Subject to [Groq Terms of Service](https://groq.com/terms-of-service/) and [Groq Privacy Policy](https://groq.com/privacy-policy/).
- **OpenRouter**: Subject to [OpenRouter Terms of Service](https://openrouter.ai/terms) and [OpenRouter Privacy Policy](https://openrouter.ai/privacy).
- **Local LLMs (Ollama / LM Studio / Edge AI)**: Executed 100% offline on your machine. No data leaves your computer.
- **Custom OpenAI-Compatible Endpoints**: Transmitted directly to the URL you configure.

We encourage you to review the privacy policy of your selected AI provider.

---

## 4. Permissions & Justifications

- **`storage`**: Used to save your API keys locally (`chrome.storage.local`), user preferences, personas, and `/slash` macros (`chrome.storage.sync`), plus temporary session reply caches (`chrome.storage.session`).
- **`declarativeNetRequest`**: Used strictly to strip the `Origin` header when sending requests to local offline endpoints (`http://localhost:*` and `http://127.0.0.1:*`) so that Ollama and LM Studio CORS policies succeed.
- **`sidePanel`**: Used to dock the InstaReply AI assistant in Chrome's Side Panel for persistent side-by-side drafting and Inbox Zero triage.
- **`contextMenus`**: Used to provide the right-click "✨ InstaReply AI" menu inside editable text fields and on selected text so you can refine drafts or generate contextual replies on any webpage.
- **Host Permissions (`https://*.instagram.com/*`, AI API domains, and `http://localhost:*/*` / `http://127.0.0.1:*/*`)**: Required to support Instagram interactions and dispatch AI requests directly to user-selected providers (Gemini, Groq, OpenRouter, or local Ollama/LM Studio).
- **Optional Host Permissions (`https://*/*`)**: Requested at runtime only when a user configures a custom self-hosted OpenAI-compatible API endpoint URL.
- **Content Scripts (`https://*/*` and `http://*/*`)**: Loaded strictly to support dedicated platform adapters (such as Instagram, Threads, X, LinkedIn, Facebook, Reddit, YouTube, GitHub, Google Play, Gmail/Outlook, and community sites) and to handle user-triggered right-click text refinement and editable field insertion on any page. Content scripts remain dormant and transmit no data until explicitly invoked by the user.

---

## 5. Data Retention & User Controls

- **No Remote Retention**: We do not store any of your data on any server.
- **Clearing Data**: You can clear all extension data, API keys, and cached drafts at any time by right-clicking the InstaReply AI extension icon in Chrome, selecting **Remove from Chrome**, or clicking **Clear Data** in Chrome extension settings.

---

## 6. Children's Privacy

InstaReply AI is not directed at children under the age of 13 and does not knowingly collect any data from children.

---

## 7. Changes to This Policy

If we update this Privacy Policy, we will post the revised version with an updated date in this repository.

---

## 8. Contact Information

If you have any questions or concerns regarding this Privacy Policy or your data, please contact:

- **Developer:** Fung Lam
- **Email:** [fung@androidfung.com](mailto:fung@androidfung.com)
- **Repository:** [https://github.com/seventhmoon/insta-reply-extension](https://github.com/seventhmoon/insta-reply-extension)
- **Issues:** [https://github.com/seventhmoon/insta-reply-extension/issues](https://github.com/seventhmoon/insta-reply-extension/issues)
