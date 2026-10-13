# Contributing to InstaReply AI

First off, thank you for considering contributing to InstaReply AI! Community contributions help keep the extension fast, secure, and compatible with ever-changing social media DOM structures.

---

## 🛠️ Development Setup

InstaReply AI is a vanilla JavaScript Chrome Extension (Manifest V3) with zero external runtime build dependencies.

1. **Fork and Clone the Repository**:
   ```bash
   git clone https://github.com/<your-username>/insta-reply-extension.git
   cd insta-reply-extension
   ```

2. **Load the Unpacked Extension in Chrome**:
   - Open Google Chrome and navigate to `chrome://extensions`.
   - Enable **Developer mode** in the top-right corner.
   - Click **Load unpacked** and select the root directory of this repository.
   - The InstaReply AI icon will appear in your extensions toolbar.

3. **Reloading After Changes**:
   - For changes to `popup/` or `content/`: Refresh the web page you are testing or reopen the popup.
   - For changes to `background/service-worker.js` or `manifest.json`: Click the **Reload (🔄)** button on the extension card in `chrome://extensions`.

---

## 🧪 Running Tests

We maintain a rigorous automated test suite to ensure stability across platforms:

```bash
# Run tests directly with Node.js
node test/automated-tests.js
```

All **15 suites** must pass before any pull request can be merged.

### In-Browser Interactive Testing
You can also run tests visually without an active social media session:
- Headless DOM integration runner: `open test/browser-test-runner.html`
- Simulated Instagram UI playground: `open test/mock-instagram.html`

---

## 🧩 Architecture Overview

- **`manifest.json`**: Chrome Extension Manifest V3 configuration, permissions (`storage`, `declarativeNetRequest`), and content script match patterns.
- **`background/service-worker.js`**: Background service worker. Handles all outbound LLM API requests, payload construction, token management, LRU response caching, and configuration defaults.
- **`content/adapters/`**: Platform-specific adapters:
  - `platform-detector.js`: Detects active site (Instagram, Threads, X, LinkedIn, Facebook, Meta Business).
  - `threads-adapter.js`: Handles Threads post replies and character limits (500 chars).
  - `x-adapter.js`: Handles X / Twitter tweet composers, tweet extraction, and 280-char enforcement.
  - `linkedin-adapter.js`: Handles LinkedIn feed, comment boxes, and messaging toolbars.
  - `facebook-adapter.js`: Handles Facebook feed posts and comments.
  - `meta-business-adapter.js`: Handles Meta Business Suite inbox and composer toolbars.
- **`content/content.js`**: Universal content script managing shortcut button injections, floating assistant card, quick-reply shortcuts (<kbd>Alt</kbd>+<kbd>Q</kbd>), and rich-text insertion.
- **`content/page-bridge.js`**: Executes in the `MAIN` world to handle React/Draft.js synthetic events and input prototype setters safely.
- **`popup/`**: Toolbar settings popup UI for choosing AI providers, entering API keys, adjusting default tone, stance, language, and custom prompt rules.

---

## 📐 Coding Guidelines

1. **Vanilla JavaScript & CSS**: Keep runtime dependencies to 0. Do not introduce heavy frontend frameworks or bundling steps for content scripts.
2. **Defensive DOM Querying**: Social media platforms change class names and DOM structures frequently.
   - Use stable attributes (`data-testid`, `aria-label`, `role`, semantic tags) rather than ephemeral minified CSS classes (`.x123abc`).
   - Use optional chaining (`el?.parentElement`) and check `if (!el) return null;`.
3. **Respect Character Limits**:
   - X / Twitter: strictly 280 characters.
   - Meta Threads: 500 characters.
4. **Preserve User Privacy**:
   - Never send user data to third-party tracking services.
   - All AI calls must go directly from the client service worker to the user-selected AI endpoint.
   - API keys and user preferences must be stored locally via `chrome.storage.local`.

---

## 📦 Submitting a Pull Request

1. Create a feature branch:
   ```bash
   git checkout -b feature/my-new-adapter
   ```
2. Commit your changes with a clear commit message:
   ```bash
   git commit -m "feat(x-adapter): support new quote tweet composer layout"
   ```
3. Run the automated test suite to ensure no regressions:
   ```bash
   node test/automated-tests.js
   ```
4. Push your branch to GitHub and submit a Pull Request against the `main` branch.

Thank you for helping make InstaReply AI better for everyone!
