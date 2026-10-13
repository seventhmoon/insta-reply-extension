# Security Policy

## 🔒 Supported Versions

We release security and stability updates for the latest minor and patch versions:

| Version | Supported |
| :--- | :--- |
| 1.4.x | :white_check_mark: Yes |
| < 1.4.0 | :x: No (Please upgrade to latest) |

---

## 🛡️ Security Architecture & Philosophy

InstaReply AI follows a strict **zero-intermediate-server** security model:

1. **Client-Only Execution**: The extension runs entirely inside your browser. There is no intermediate proxy or analytics server.
2. **Local Credential Storage**: All AI provider API keys (Google Gemini, Groq, OpenRouter, custom OpenAI) are stored strictly on your local machine using Chrome's protected `chrome.storage.local` API. They are never sent to any server other than your selected AI endpoint.
3. **Encrypted Transit**: All external API interactions occur strictly over TLS/HTTPS directly to your configured provider.
4. **No Arbitrary Remote Code**: Compliant with Chrome Extension Manifest V3, the extension does not use `eval()` or fetch remote executable code.

---

## 🚨 Reporting a Vulnerability

If you discover a potential security vulnerability in InstaReply AI:

1. **Do NOT report security vulnerabilities via public GitHub Issues.**
2. Send an email directly to the maintainer at **`fung@androidfung.com`** with:
   - A description of the vulnerability.
   - Steps to reproduce or a proof of concept.
   - Affected platforms or browser configurations.
3. You will receive an initial response within 48 hours acknowledging receipt.
4. Once verified, a fix will be published in a patch release and submitted to the Chrome Web Store.
