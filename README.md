# InstaReply AI - Smart Assistant for Instagram, Threads, X (Twitter), LinkedIn & Facebook

[![GitHub Sponsors](https://img.shields.io/badge/sponsor-GitHub%20Sponsors-ea4aaa?style=flat&logo=github&logoColor=white)](https://github.com/sponsors/seventhmoon)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A high-performance Google Chrome Extension (Manifest V3) that injects an intelligent, contextual AI assistant directly into **Instagram** (Comments, Reels, DMs, Stories), **Threads** (Post Replies, Thread Conversations), **X / Twitter** (Tweets, Replies, DMs), **LinkedIn** (Feed, Comments, InMail), and **Facebook**.

---

## ✨ Core Features

### 🌐 Multi-Platform Social Media Support
- **Meta Threads**: Injects into Threads post reply boxes and composers with 500-character boundary limits, thread context extraction, and conversation starter assistance.
- **X (Twitter)**: Directly injects into tweet composers (`div[data-testid="tweetTextarea_0"]`) and reply toolbars, with strict 280-character boundary enforcement, tweet context parsing, and thread author detection.
- **LinkedIn**: Contextual replies for feed posts, comments (`.comments-comment-box`), and InMail messages with professional networking tone bias.
- **Facebook**: Works seamlessly in Facebook feed comments and group discussions with warm, community-friendly responses.
- **Universal ContentEditable Engine**: Natively supports React, Draft.js, and Lexical rich-text editors without breaking internal state, undo history, or cursor position.

### 📸 Instagram Stories & Story DM Replies
- **Seamless Story Composer Shortcut**: Automatically injects a branded shortcut button into the Story reply pill on desktop web, supporting standard and localized placeholders (*"Reply to..."*, *"Send message..."*, *"Responder..."*, *"メッセージ..."*).
- **Active Slide Isolation**: Scopes extraction strictly to the active slide, preventing multi-slide carousel bleed or background feed post pollution.
- **Smart Story Text Extraction**: Extracts text stickers overlaid on the slide while ignoring Instagram system elements (emoji *"Quick Reactions"* trays and navigation CTAs like *"Watch full reel"* or *"View post"*).
- **Shared Reel & Post Awareness**: Automatically detects when a story is sharing a Reel or Post, identifying the original creator and describing the visual context.
- **Auto-Pauses Story Playback**: Automatically pauses the Story timer and video while the assistant card is open, and resumes playback upon closing.
- **Safe React Input Insertion**: Handles prototype setter resolution between `HTMLInputElement` and `HTMLTextAreaElement` without `TypeError: Illegal invocation`, cleanly updating React internal state.
- **Dynamic Re-Injection**: Listens to React reconciliation and SPA slide transitions, ensuring the shortcut button remains accessible as you browse.

### 💬 Post & Reel Comments
- **Inline Shortcut Button**: Placed right beside Instagram's native "Post" button.
- **Comment-Level "✨ AI Reply" Chips**: Injected next to each comment's "Reply" button for 1-click targeted responses.
- **Reels Drawer Isolation**: Distinguishes comments drawer contents from the main Reel background container, preventing metadata cross-contamination.
- **Creator vs. Fan Perspective**: Automatically detects if you are the author of the post (speaking warmly in 1st person) or a visitor participating in the conversation.

### ✉️ Direct Messages (Fullscreen & Mini-Window PIP)
- **Omnipresent DM Support**: Works in both fullscreen `/direct/` threads and floating bottom-right picture-in-picture (PIP) chat windows.
- **Message Bubble Chips**: Inline "✨ AI Reply" chips on received incoming messages.
- **Conversation Context**: Understands recent message context and addresses the sender naturally.

### 👁️ Visual Scene & Multimodal Vision
- **Multimodal Image Support**: Directly analyzes post/reel photos using the Gemini Vision API.
- **Computer Vision Alt Parsing**: Parses Instagram's accessibility scene descriptions and video posters to ground replies in the actual visual elements of the photo or video.

### 🎯 Customization & Control
- **1-Click Stance Selector**:
  - `🟢 Positive` (Supportive, appreciative, encouraging)
  - `⚪ Neutral` (Objective, informative, balanced)
  - `🔴 Negative` (Polite boundaries, decline, disagreement)
- **10+ Tone Presets**: Quick-switch between *Friendly, Funny, Playful, Savage, Geek, Spicy, Hyped, Professional, Empathetic*, and *Short*.
- **Zero-Latency Multi-Tone Bundling**: Bundles tone drafts in a single AI request for instant tone switching with zero extra API calls.
- **Multi-Language Support**: Choose your response language (*Auto-Detect / Match Context, English, Spanish, French, German, Italian, Portuguese, Japanese, Traditional Chinese, Simplified Chinese, Korean*).
- **Draft Hint Steering**: Type a quick thought into the reply box (e.g., *"friendly decline and ask for email"*), and InstaReply will follow your guidance.
- **Sentiment & Topic Analysis**: Displays sentiment tags (*Praise, Business Inquiry, Issue*) and extracted topic hashtags.

---

## 🤖 Supported AI Providers

| Provider | Description | Recommended Models |
| :--- | :--- | :--- |
| **Google Gemini** | Official API with dynamic model list fetching & multimodal vision. | `gemini-2.0-flash`, `gemini-1.5-flash`, `gemini-1.5-pro` |
| **Groq Cloud** | Ultra-high-speed LPU inference (free tier available). | `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `mixtral-8x7b-32768` |
| **OpenRouter** | Multi-model gateway with free tiers. | `meta-llama/llama-3.3-70b-instruct:free`, `deepseek/deepseek-r1:free`, `qwen/qwen-2.5-72b-instruct:free` |
| **Custom OpenAI-Compatible** | Any OpenAI-spec API (GitHub Models, Mistral AI, Azure, DeepSeek). | `gpt-4o-mini`, `mistral-small-latest`, custom endpoints |
| **Local LLM** | Self-hosted offline models via Ollama or LM Studio. | `llama3.2`, `mistral:latest`, `qwen2.5:7b` |
| **Edge AI (Gemini Nano)** | On-device private inference via Chrome Built-in Prompt API. | Chrome Prompt API (`chrome://flags/#prompt-api-for-gemini-nano`) |

---

## 🚀 Installation Guide

### 1. Load into Google Chrome

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions`.
3. In the top-right corner, enable **Developer mode**.
4. Click **Load unpacked**.
5. Select the `insta-reply-extension` directory.
6. The **InstaReply AI** icon will appear in your Chrome toolbar.

### 2. Configure Your AI Provider

1. Click the **InstaReply AI** icon in your Chrome toolbar.
2. Select your provider:
   - **Gemini API**: Paste your API key from [Google AI Studio](https://aistudio.google.com/app/apikey) and click **Fetch Latest Models**.
   - **Groq API**: Paste your key from [Groq Console](https://console.groq.com/keys).
   - **OpenRouter**: Paste your key from [openrouter.ai](https://openrouter.ai/keys).
   - **Local LLM**: Ensure Ollama or LM Studio is running (e.g. `http://localhost:11434/v1`) and click **Fetch Local Models**.
3. Click **Test Connection** to verify your setup.
4. Customize your default stance, tone, language, and custom persona rules, then click **Save Settings**.

---

## 🧪 Testing & Verification

InstaReply AI includes a comprehensive test harness covering unit logic, regression edge cases, and live headless browser DOM integration:

### Automated Test Suite
Run the test suite with Node.js:
```bash
npm test
```

The test runner validates **36 automated test cases** across:
- **Suite 1: Syntax & Manifest Quality**: Validates all scripts and Manifest V3 structure.
- **Suite 2: Dedicated Post Context Extraction**: Canonical author detection, semantic caption parsing, visual thumbnail filtering.
- **Suite 2b: Instagram Reel Extraction**: Shortcode resolution, comments drawer isolation, reel video visuals.
- **Suite 2c: Instagram Story Reply & Context Extraction**: Multilingual input detection, active slide scoping, React prototype setters, button re-injection, reaction tray exclusion, and shared Reel CTA rejection.
- **Suite 3: Comment Isolation & Anti-Stale Caching**: Thread scoping and cache eviction.
- **Suite 4: Multi-Tone Bundling & AI Response Parsing**: Markdown fence stripping and JSON parsing.
- **Suite 5: Real Headless Chrome DOM Integration**: Automated headless Chrome test executing against `test/browser-test-runner.html`.
- **Suite 6: Multi-Provider & Combobox Configuration**: URL normalization and request headers.

### In-Browser Interactive Testing
You can also run tests visually in Chrome without logging in to Instagram:
- **Interactive DOM Test Runner**:
  ```bash
  open test/browser-test-runner.html
  ```
- **Simulated Instagram Interface**:
  ```bash
  open test/mock-instagram.html
  ```

---

## 📁 Project Structure

```text
insta-reply-extension/
├── manifest.json              # Chrome Extension Manifest V3 configuration
├── background/
│   └── service-worker.js     # Background service worker for LLM API calls, cache & storage
├── content/
│   ├── content.js             # Content script: DOM injection, Story/Reel scoping & event handlers
│   ├── content.css            # Extension styling, dark mode floating assistant card & buttons
│   └── page-bridge.js         # Page-context bridge for native React DOM interactions
├── popup/
│   ├── popup.html             # Extension settings UI with provider combobox
│   ├── popup.css              # Settings popup styling
│   └── popup.js               # Settings controller & API connection testing
├── test/
│   ├── automated-tests.js     # Automated test suite (36 tests)
│   ├── browser-test-runner.html # Headless Chrome DOM integration test harness
│   └── mock-instagram.html    # Interactive Instagram UI test simulator
├── icons/                     # Extension toolbar icons (16px, 48px, 128px)
├── package.json               # Test script and package configuration
└── README.md                  # Project documentation
```

---

## 🔒 Privacy & Permissions

- **Direct Client-to-API**: All AI calls are made directly from your browser's service worker to your selected AI provider. No intermediate backend server is used.
- **Local Storage**: API keys, preferences, and cached responses are stored securely in Chrome's local extension storage.
- **Domain Scoped**: Active only on `instagram.com` domains.

---

## 💖 Support & Sponsorship

If InstaReply AI saves you time and enhances your Instagram workflow, consider supporting ongoing development, new models, and maintenance:

[![Sponsor seventhmoon](https://img.shields.io/badge/Sponsor-%E2%9D%A4-ea4aaa?style=for-the-badge&logo=github&logoColor=white)](https://github.com/sponsors/seventhmoon)

---

## 📄 License

MIT License. See [package.json](package.json) for details.
