# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.4.2] - 2026-10-11

### Added
- Chrome Web Store official release links and badges.
- Automated validation tests for Manifest V3 length constraints and formatting.

### Changed
- License updated from MIT to GNU General Public License v3.0 (GPLv3).
- Improved rich-text `contenteditable` insertion across React, Lexical, and Draft.js inputs.

---

## [1.4.1] - 2026-10-10

### Added
- Post drafting detection: Standalone composers classified as new post drafts.
- In-page prompt framework adjustments for fresh post generation vs reply drafting.

### Fixed
- Fixed selector query edge-cases in dynamic toolbar discovery.
- Resolved input boundary spacing on compact message composer fields.

---

## [1.4.0] - 2026-10-09

### Added
- **Multi-Platform Support**: Injected contextual AI assistance across:
  - Meta Threads (`threads.net`, `threads.com`)
  - X / Twitter (`x.com`, `twitter.com`)
  - LinkedIn (`linkedin.com` feed, comments, and InMail)
  - Facebook (`facebook.com`)
  - Meta Business Suite (`business.facebook.com`)
- **Strict Character Limit Enforcement**:
  - 280-character boundary enforcement and badge indicators for X / Twitter.
  - 500-character boundary limits for Meta Threads.
- **Store Graphics & Promo Media**: High-res promotional marquee banner and promotional tiles.

---

## [1.3.0] - 2026-10-06

### Added
- **1-Click Quick Reply**: Press <kbd>Alt</kbd>+<kbd>Q</kbd> (or <kbd>Option</kbd>+<kbd>Q</kbd> on Mac) to insert AI reply directly into target field with zero popup dialog.
- **In-Flight Locking**: Added mutex locks preventing duplicate concurrent API calls during generation.
- **Comment Button Display Modes**: Added *Auto*, *Standard*, and *Icon-Only* compact button modes.

---

## [1.2.0] - 2026-10-04

### Added
- **Resizable UI**: In-page assistant card and popup can be freely resized with boundary math clamping and persistence.
- **Desktop Tone Navigation**: Desktop chevrons, mouse wheel horizontal scroll, grab-to-drag, and grid view toggles.
- **GitHub Sponsors Integration**: Added community sponsorship links and funding configurations.

---

## [1.1.0] - 2026-10-02

### Added
- **Voice Mimicry Prompting**: Added `myVoiceSamples` few-shot training support to match user's personal writing voice.
- **Anti-Troll Shield**: Automatic comment classification for spam, harassment, and bad-faith comments.
- **Draggable & Minimized Card**: In-page assistant can be dragged across viewport and minimized.
- **LRU Response Caching**: Background service worker LRU cache for tone and stance replies.
- **Extended Tone Styles**: Added Flirting, Seductive, Evil, Mean, and Spicy presets.

---

## [1.0.0] - 2026-09-28

### Added
- Initial release of **InstaReply AI**.
- Support for Instagram Comments, Reels, Direct Messages (fullscreen & PIP), and Stories.
- Story auto-pause during drafting and slide isolation.
- Multi-provider support: Google Gemini, Groq Cloud, OpenRouter, Custom OpenAI, and Local LLMs (Ollama / LM Studio).
- Stance controls (Positive, Neutral, Negative) and 10 base tone presets.
- 10+ language translations.
- Manifest V3 architecture with direct client-to-API communication.
