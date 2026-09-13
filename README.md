# InstaReply AI - Smart Instagram Comment & DM Assistant

A Google Chrome Extension (Manifest V3) that provides a convenient, inline AI assistant directly within Instagram comments and Direct Messages (DMs).

---

## ✨ Features

- **Inline Shortcut Icon**: Seamlessly injects an Instagram-gradient shortcut button into comment boxes (right next to "Post") and DM composers (inside the pill on the right) on `instagram.com`.
- **PIP & Fullscreen DM Support**: Works seamlessly in both fullscreen Direct Messages and floating bottom-right mini-windows, with inline "✨ AI Reply" chips on received chat bubbles.
- **Visual Scene Awareness**: Automatically parses Instagram's computer vision alt text and media thumbnails to ground AI replies in the actual visual elements of the photo or video.
- **Creator vs. Visitor Perspective**: Detects if you are the author of the post or an outside commenter, automatically speaking in the 1st person ("I", "my") when answering fans.
- **1-Click Stance Control**: Toggle replies between `🟢 Positive` (enthusiastic/agree), `⚪ Neutral` (balanced/factual), and `🔴 Negative` (polite decline/firm boundary).
- **Sentiment & Topic Analysis**:
  - Automatically analyzes the incoming comment or conversation thread.
  - Displays sentiment tags (e.g. `🟢 Positive / Praise`, `💼 Business Inquiry`, `🔴 Issue`) and extracted topic hashtags (`#Presets`, `#Pricing`, `#Collaboration`).
  - Uses this context to craft authentic, relevant replies.
- **Draft Hint Awareness**:
  - If you type a quick thought or guidance into the reply box (e.g., *"friendly decline and ask for email"* or *"mention our new spring line"*), InstaReply reads your text as a **draft hint** and directs the AI according to your intention.
- **AI Model Selection & Dynamic Model Fetching**:
  - 🌟 **Google Gemini API**: Native integration with dynamic model fetching for `gemini-1.5-flash`, `gemini-2.0-flash`, `gemini-1.5-pro`, etc.
  - ⚡ **Chrome Built-in Prompt API (Edge AI)**: Supports on-device Gemini Nano via Chrome's Prompt API (`chrome://flags/#prompt-api-for-gemini-nano`) for private, zero-latency inference.
  - 🖥️ **Local LLM**: Supports local Ollama or OpenAI-compatible endpoints (e.g., `http://localhost:11434/v1`) with 1-click model detection.
- **Tone Presets**: Quick switch between tones with one click:
  - 😊 Friendly & Casual
  - 💼 Professional & Polished
  - 🔥 Enthusiastic & Hyped
  - 😄 Witty & Humorous
  - ❤️ Empathetic & Caring
  - ⚡ Short & Sweet
- **Regenerate ("Regen")**: Generates alternate response variations with different angles and phrasing.
- **One-Click Insert**: Safely dispatches React synthetic input events to inject drafted replies directly into Instagram's inputs without breaking UI state.

---

## 🚀 Installation Guide

### 1. Load into Google Chrome

1. Open Google Chrome and navigate to `chrome://extensions`.
2. In the top-right corner, turn on **Developer mode**.
3. Click the **Load unpacked** button.
4. Select the extension directory:
   `/Users/fung/.gemini/antigravity/scratch/insta-reply-extension`
5. The **InstaReply AI** icon will appear in your Chrome toolbar.

### 2. Configure Your AI Provider

1. Click the **InstaReply AI** icon in your Chrome toolbar.
2. Choose your preferred AI provider:
   - **Gemini API (Recommended)**:
     - Paste your Gemini API key (obtain a free key from [Google AI Studio](https://aistudio.google.com/app/apikey)).
     - Select your model (e.g., `gemini-1.5-flash`).
     - Click **Test Connection** to verify.
   - **Edge AI (On-Device)**:
     - Uses Chrome's built-in Prompt API if enabled via `chrome://flags/#prompt-api-for-gemini-nano`.
   - **Local LLM**:
     - Set endpoint (e.g. `http://localhost:11434/v1`) and model name (e.g. `llama3.2`).
3. Set your preferred default tone and custom persona rules.
4. Click **Save Settings**.

---

## 🧪 Local Testing & Verification

You can test the extension directly without needing to log in to Instagram:

1. Open the mock test page in Chrome:
   ```bash
   open /Users/fung/.gemini/antigravity/scratch/insta-reply-extension/test/mock-instagram.html
   ```
2. The page simulates both an Instagram post feed comment section and a DM chat window.
3. Test clicking the shortcut icon, typing draft hints into the comment box, regenerating responses, and inserting replies.

---

## 📁 Project Structure

```
insta-reply-extension/
├── manifest.json                  # Chrome Extension Manifest V3 configuration
├── background/
│   └── service-worker.js         # Service worker handling storage & AI APIs
├── content/
│   ├── content.js                 # Content script for Instagram DOM injection & React events
│   └── content.css                # Instagram-native UI styles & floating AI card
├── popup/
│   ├── popup.html                 # Settings & configuration popup UI
│   ├── popup.css                  # Popup modern dark theme styling
│   └── popup.js                   # Settings state & connection test controller
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
├── test/
│   └── mock-instagram.html        # Local Instagram test harness
└── README.md
```
