# Privacy Policy for InstaReply AI

**Last updated:** September 14, 2026

InstaReply AI ("we", "our", or "the extension") is committed to protecting your privacy. This Privacy Policy explains how information is handled when you use the InstaReply AI Google Chrome Extension.

---

## 1. Single Purpose & Overview

InstaReply AI is a browser productivity tool designed to help you draft contextual responses to Instagram comments, Direct Messages (DMs), Reels, and Stories. 

**We operate with a strict privacy-first, client-only architecture:**
- We do **NOT** own, operate, or route your data through any intermediate server.
- We do **NOT** collect, log, track, sell, or monetize any personal data.
- All AI processing requests are dispatched directly from your browser to your chosen AI provider (e.g. Google Gemini, Groq, OpenRouter, or your local/private LLM).

---

## 2. What Information Is Handled

InstaReply AI only handles the minimum data necessary to generate relevant reply drafts when you explicitly interact with the extension:

1. **User Configuration & Preferences**:
   - Your API keys (e.g., Google Gemini, Groq, OpenRouter, or custom OpenAI endpoints).
   - Your preferences (default tone, stance, language, custom persona rules).
   - *Storage:* Stored locally on your device via Chrome's secure `chrome.storage.local` and `chrome.storage.sync` APIs.

2. **On-Page Instagram Context (Ephemeral & User-Triggered)**:
   - When you click the InstaReply AI shortcut button or reply chip, the extension reads the immediate context of that specific interaction:
     - The target comment or DM message text.
     - The post caption or story text sticker (if enabled).
     - Visual description (accessibility alt text or video poster) to understand the scene.
     - Any draft hint keywords you type into the reply input.
   - *Processing:* This context is assembled into a prompt and transmitted directly to your configured AI provider over HTTPS.
   - *Retention:* This context is cached temporarily in memory (`chrome.storage.local`) solely to avoid duplicate API calls if you regenerate or switch tones. It is not transmitted anywhere else.

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

- **`storage`**: Used to save your API keys, default tones, and user preferences locally in your browser.
- **`activeTab`**: Used to identify the active tab when opening the extension popup settings.
- **`declarativeNetRequest`**: Used strictly to strip the `Origin` header when sending requests to local offline endpoints (`http://localhost:*` and `http://127.0.0.1:*`) so that Ollama and LM Studio CORS policies succeed.
- **Host Permissions (`https://*.instagram.com/*`)**: Required to inject shortcut buttons and read context on Instagram pages when requested by the user.
- **Host Permissions (`https://*/*`)**: Required to communicate with your chosen AI API endpoints (Google, Groq, OpenRouter, or custom self-hosted endpoints) and to load post media thumbnails for visual analysis.

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
