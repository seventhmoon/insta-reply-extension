// InstaReply AI - Content Script for Instagram Comments & Direct Messages

(function () {
  'use strict';

  // State
  let activeCard = null;
  let activeInputTarget = null;
  let currentTone = 'friendly';
  let currentStance = 'positive';
  let currentLanguage = 'auto';
  let currentVariation = 0;
  let lastContextData = null;
  let lastActiveCommentContext = null;

  // In-memory predictive cache for instant comment replies
  const replyCache = new Map();
  let prefetchTimer = null;
  let stancePrefetchTimer = null;
  let currentGenerationId = 0;
  let activeGenerationContext = null;

  function setReplyCacheEntry(key, value) {
    if (replyCache.size > 250) {
      const oldestKey = replyCache.keys().next().value;
      if (oldestKey) replyCache.delete(oldestKey);
    }
    replyCache.set(key, value);
  }

  /**
   * Generates a unique post identifier (shortcode or unique caption snippet)
   * to strictly scope cached replies and pre-fetches to the current post
   */
  function extractPostIdentifier(container, postAuthor = '', postCaption = '') {
    const bannedCodes = new Set(['videos', 'audio', 'reels', 'reel', 'explore', 'direct', 'stories', 'create', 'tv']);

    // 1. Direct page route on dedicated /p/, /reel/, or /reels/ URL (authoritative)
    const path = window.location.pathname;
    const pathMatch = path.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
    if (pathMatch && pathMatch[2] && !bannedCodes.has(pathMatch[2].toLowerCase())) {
      return pathMatch[2];
    }

    // 2. Feed post, active reel, or modal post link
    const searchRoots = [container];
    try {
      const activeReel = findActiveReelContainer();
      if (activeReel && !searchRoots.includes(activeReel)) searchRoots.push(activeReel);
    } catch (_) {}

    for (const root of searchRoots) {
      if (!root) continue;
      const links = root.querySelectorAll('a[href*="/p/"], a[href*="/reel/"], a[href*="/reels/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
        if (match && match[2] && !bannedCodes.has(match[2].toLowerCase())) {
          return match[2];
        }
      }
    }

    const cleanCap = (postCaption || '').replace(/\[Author Comment #[0-9]+\]:?/g, '').trim().slice(0, 40);
    return `${postAuthor || 'reel'}_${cleanCap}`;
  }

  function getReplyCacheKey(postId, postAuthor, incomingAuthor, incomingText, stance, tone, language) {
    const textSnippet = (incomingText || '').trim().toLowerCase().slice(0, 80);
    return `${postId || 'post'}|${postAuthor || ''}|${incomingAuthor || ''}|${textSnippet}|${stance || 'positive'}|${tone || 'friendly'}|${language || 'auto'}`;
  }

  const SPARKLE_SVG = `
    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2L14.39 8.26L21 9.27L16.2 13.97L17.5 20.5L12 17.27L6.5 20.5L7.8 13.97L3 9.27L9.61 8.26L12 2Z" fill="white"/>
      <circle cx="19" cy="5" r="2" fill="#FFE082"/>
    </svg>
  `;

  // Initialize observer on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    ensurePageBridgeInjected();
    scanAndInjectShortcuts();
    setupMutationObserver();
    setupGlobalClickListener();
  }

  /**
   * Injects the main world bridge script so Edge AI Prompt API can be called
   */
  function ensurePageBridgeInjected() {
    if (document.getElementById('instareply-page-bridge') || window.__INSTAREPLY_BRIDGE_ACTIVE__) {
      return;
    }
    try {
      const script = document.createElement('script');
      script.id = 'instareply-page-bridge';
      script.src = chrome.runtime.getURL('content/page-bridge.js');
      (document.head || document.documentElement).appendChild(script);
    } catch (_) {}
  }

  /**
   * Observe DOM mutations to catch dynamically loaded posts, modals, and DM threads
   */
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldScan = true;
          break;
        }
      }
      if (shouldScan) {
        scanAndInjectShortcuts();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Scan for Instagram Comment and DM input fields
   */
  function scanAndInjectShortcuts() {
    // 0. Clean up any accidental duplicate buttons first
    pruneDuplicateShortcutButtons();

    // 1. Instagram Post & Modal Comment Inputs
    const commentCandidates = document.querySelectorAll(`
      form textarea[aria-label*="comment" i],
      form textarea[placeholder*="comment" i],
      textarea[aria-label*="comment" i],
      textarea[placeholder*="comment" i],
      form div[role="textbox"][contenteditable="true"],
      form div[contenteditable="true"],
      div[role="textbox"][aria-label*="comment" i],
      div[role="textbox"][placeholder*="comment" i],
      div[role="textbox"][aria-placeholder*="comment" i],
      div[contenteditable="true"][aria-label*="comment" i],
      div[contenteditable="true"][placeholder*="comment" i],
      div[contenteditable="true"][aria-placeholder*="comment" i],
      article div[role="textbox"][contenteditable="true"],
      article div[contenteditable="true"],
      .ig-post-card div[role="textbox"][contenteditable="true"],
      .ig-post-card div[contenteditable="true"]
    `);

    commentCandidates.forEach((el) => {
      if (
        el.closest('.instareply-card-overlay') ||
        el.closest('.instareply-card') ||
        el.classList.contains('instareply-textarea') ||
        el.id === 'instareply-output-text'
      ) {
        return;
      }

      // Exclude DM inputs (which have message cues or are in /direct/ route)
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      const ariaPlaceholder = (el.getAttribute('aria-placeholder') || '').toLowerCase();
      if (
        ariaLabel.includes('message') ||
        placeholder.includes('message') ||
        ariaPlaceholder.includes('message') ||
        el.closest('.ig-dm-composer') ||
        (window.location.pathname.includes('/direct') && !el.closest('article'))
      ) {
        return;
      }

      injectShortcutButton(el, 'comment');
    });

    // 2. Instagram Direct Message (DM) Composers (Fullscreen + PIP / Mini-window mode)
    const dmInputs = findDmInputElements();
    dmInputs.forEach((el) => {
      if (
        el.closest('.instareply-card-overlay') ||
        el.closest('.instareply-card') ||
        el.classList.contains('instareply-textarea') ||
        el.id === 'instareply-output-text'
      ) {
        return;
      }
      injectShortcutButton(el, 'dm');
    });

    // 3. Inline Comment "✨ AI Reply" buttons next to each comment's Reply link
    scanAndInjectCommentActionButtons();

    // 4. Inline DM Message "✨ AI Reply" chips on incoming DM chat bubbles (Fullscreen + PIP)
    scanAndInjectDmMessageReplyButtons();
  }

  /**
   * Detects if an element is inside an Instagram PIP / floating mini-window chat
   */
  function isInsideFloatingChat(el) {
    if (!el) return false;

    // Explicitly exclude any InstaReply UI elements
    if (
      el.closest('.instareply-card-overlay') ||
      el.closest('.instareply-card') ||
      el.closest('.instareply-shortcut-btn') ||
      el.classList.contains('instareply-textarea') ||
      el.id === 'instareply-output-text'
    ) {
      return false;
    }

    // Explicitly exclude comment forms, articles, post cards, and comments dialogs
    if (el.closest('form') || el.closest('article') || el.closest('.ig-post-card')) {
      return false;
    }

    const dialog = el.closest('div[role="dialog"]');
    if (dialog) {
      // Check if dialog is a comments dialog or post modal
      const heading = dialog.querySelector('h1, h2, [role="heading"]');
      const headingText = (heading?.textContent || '').toLowerCase();
      if (
        headingText.includes('comment') ||
        dialog.querySelector('textarea, div[aria-label*="comment" i], div[placeholder*="comment" i]')
      ) {
        return false;
      }
    }

    // Check for explicit DM floating widget markers
    if (el.closest && el.closest('.ig-pip-window, .ig-dm-card, .ig-dm-composer')) {
      return true;
    }

    let curr = el;
    while (curr && curr !== document.body) {
      if (curr.classList && (curr.classList.contains('ig-pip-window') || curr.classList.contains('ig-dm-card') || curr.classList.contains('ig-dm-composer'))) {
        return true;
      }
      if (window.getComputedStyle) {
        const s = window.getComputedStyle(curr);
        if (
          (s.position === 'fixed' || s.position === 'absolute') &&
          parseInt(s.bottom, 10) <= 80 &&
          curr.offsetWidth >= 220 && curr.offsetWidth <= 550 &&
          curr.offsetHeight >= 200 &&
          !curr.querySelector('div[aria-label*="comment" i], textarea[aria-label*="comment" i]')
        ) {
          return true;
        }
      }
      curr = curr.parentElement;
    }

    return false;
  }

  /**
   * Discovers all active DM inputs across Fullscreen DMs, PIP floating dialogs, and test harness
   */
  function findDmInputElements() {
    const results = [];
    const isDirectRoute = window.location.pathname.includes('/direct');

    const candidates = document.querySelectorAll(`
      .ig-dm-composer div[contenteditable="true"],
      .ig-dm-composer textarea,
      div[role="textbox"][contenteditable="true"],
      div[contenteditable="true"][data-lexical-editor="true"],
      div[contenteditable="true"],
      textarea
    `);

    candidates.forEach((el) => {
      // 0. Exclude any element inside InstaReply card or overlay
      if (
        el.closest('.instareply-card-overlay') ||
        el.closest('.instareply-card') ||
        el.closest('.instareply-shortcut-btn') ||
        el.closest('.instareply-dm-reply-chip') ||
        el.closest('.instareply-comment-reply-chip') ||
        el.classList.contains('instareply-textarea') ||
        el.id === 'instareply-output-text'
      ) {
        return;
      }

      // 1. Exclude if inside an article (post card on feed or post page)
      if (el.closest('article') || el.closest('.ig-post-card')) {
        return;
      }

      // 2. Exclude post comment forms and comment dialogs
      const form = el.closest('form');
      if (form) {
        const formText = (form.textContent || '').toLowerCase();
        if (formText.includes('post') || form.querySelector('button[type="submit"], .ig-post-btn')) {
          return;
        }
      }

      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
      const ariaPlaceholder = (el.getAttribute('aria-placeholder') || '').toLowerCase();

      // Exclude comment dialogs and comment inputs
      if (
        ariaLabel.includes('comment') ||
        placeholder.includes('comment') ||
        ariaPlaceholder.includes('comment') ||
        el.closest('div[role="dialog"]')?.querySelector('h1, h2, [role="heading"]')?.textContent?.toLowerCase().includes('comment')
      ) {
        return;
      }

      // 3. Positive identification for DM:
      // Walk up ancestors up to 6 levels to catch Lexical editor placeholder text
      let ancestor = el.parentElement;
      let ancestorText = '';
      for (let i = 0; i < 6 && ancestor && ancestor !== document.body; i++) {
        ancestorText += ' ' + (ancestor.textContent || '');
        ancestor = ancestor.parentElement;
      }
      ancestorText = ancestorText.toLowerCase();

      const hasMessageCue =
        ariaLabel.includes('message') ||
        placeholder.includes('message') ||
        ariaPlaceholder.includes('message') ||
        ancestorText.includes('message...') ||
        ancestorText.includes('mensaje') ||
        ancestorText.includes('nachricht') ||
        ancestorText.includes('訊息') ||
        ancestorText.includes('消息') ||
        ancestorText.includes('メッセージ');

      // Detect PIP / floating mini-window dialog
      const isFloatingChat = isInsideFloatingChat(el);

      const isDm = hasMessageCue || (isDirectRoute && !form) || isFloatingChat;

      if (isDm) {
        // Deduplicate nested contenteditables: keep innermost
        const isChildOfExisting = results.some((existing) => existing.contains(el));
        if (!isChildOfExisting) {
          for (let i = results.length - 1; i >= 0; i--) {
            if (el.contains(results[i])) {
              results.splice(i, 1);
            }
          }
          results.push(el);
        }
      }
    });

    return results;
  }

  /**
   * Prunes duplicate shortcut buttons across forms, post containers, and DM composer bars
   */
  function pruneDuplicateShortcutButtons() {
    // Check all comment forms and post containers (avoid wiping buttons in div[role="dialog"])
    document.querySelectorAll('form, article, .ig-post-card').forEach((container) => {
      const btns = container.querySelectorAll('.instareply-shortcut-btn');
      if (btns.length > 1) {
        for (let i = 1; i < btns.length; i++) {
          btns[i].remove();
        }
      }
    });

    // Check individual DM composer bars
    document.querySelectorAll('.ig-dm-composer, div[role="main"] div[contenteditable="true"]').forEach((el) => {
      const row = el.closest('.ig-dm-composer') || el.closest('form') || el.parentElement;
      if (row) {
        const btns = row.querySelectorAll('.instareply-shortcut-btn');
        if (btns.length > 1) {
          for (let i = 1; i < btns.length; i++) {
            btns[i].remove();
          }
        }
      }
    });

    // Purge any button mistakenly placed in dialog headers or next to close buttons
    document.querySelectorAll('.instareply-shortcut-btn').forEach((btn) => {
      if (
        btn.closest('h1, h2, h3, header') ||
        btn.parentElement?.querySelector('svg[aria-label*="Close" i], svg[aria-label*="close" i]')
      ) {
        btn.remove();
      }
    });

    // Purge any button mistakenly placed inside the InstaReply assistant card itself
    document.querySelectorAll('.instareply-card-overlay .instareply-shortcut-btn, .instareply-card-overlay .instareply-dm-reply-chip, .instareply-card-overlay .instareply-comment-reply-chip').forEach((btn) => {
      btn.remove();
    });

    // Purge any reply chip mistakenly placed inside or near follow buttons, notification items, or headers
    document.querySelectorAll('.instareply-dm-reply-chip, .instareply-comment-reply-chip').forEach((chip) => {
      const parentButton = chip.closest('button:not(.instareply-dm-reply-chip):not(.instareply-comment-reply-chip)');
      if (
        parentButton ||
        chip.parentElement?.textContent?.match(/follow\s*back|following|started following you/i) ||
        chip.closest('h1, h2, h3, header')
      ) {
        chip.remove();
      }
    });
  }

  /**
   * Helper to check if text is a UI metadata token (timestamp, like count, action label, separator)
   */
  function isCommentMetadata(text, rawAuthor = '') {
    if (!text) return true;
    const t = text.trim();
    if (!t) return true;
    if (t === '•' || t === '·' || t === '-' || t === '|' || t === '—') return true;

    const lower = t.toLowerCase();
    if (rawAuthor) {
      const cleanRaw = rawAuthor.toLowerCase().replace(/^@/, '');
      if (lower === cleanRaw || lower === `@${cleanRaw}`) return true;
    }

    // Common UI action buttons / labels
    const exactActions = [
      'reply', 'ai reply', 'like', 'likes', 'liked', 'share', 'view replies', 'hide replies',
      'see translation', 'see original', 'view more comments', 'view all comments',
      'author', 'creator', 'verified', 'pinned', 'follow', 'following', 'follow back',
      'requested', 'message', 'view profile', 'edited', 'just now', 'yesterday',
      'translate', 'report', 'start the conversation', 'no comments yet'
    ];
    if (exactActions.includes(lower)) return true;

    // Timestamps: e.g. "2h", "3d", "5m", "1w", "2 h", "3 days ago", "45m ago", "1s"
    if (/^\d+\s*[smhdwy]$/i.test(t)) return true;
    if (/^\d+\s*(?:sec|second|min|minute|hr|hour|day|wk|week|mo|month|yr|year)s?(?:\s*ago)?$/i.test(t)) return true;

    // Like counts: e.g. "14 likes", "1 like", "2,415 likes"
    if (/^[\d,.]+\s*likes?$/i.test(t)) return true;

    // Reply counts: e.g. "View 4 replies", "Hide 2 replies"
    if (/^(?:view|hide)\s+(?:all\s+)?\d+\s+repl(?:y|ies)$/i.test(t)) return true;

    return false;
  }

  function cleanCommentString(text, author = '') {
    if (!text) return '';
    let cleaned = text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n\n').trim();
    if (author) {
      const cleanAuthor = author.trim().replace(/^@/, '');
      cleaned = cleaned.replace(new RegExp(`^@?${cleanAuthor}\\s*`, 'i'), '');
    }
    return cleaned.trim();
  }

  /**
   * Extracts clean, complete comment text from a comment row/container element
   */
  function extractCommentTextFromContainer(commentItem, rawAuthor = '') {
    if (!commentItem) return '';

    const cleanAuthor = (rawAuthor || '').trim().replace(/^@/, '');

    // 1. Try dedicated Instagram dir="auto" elements (Instagram's standard for comment text)
    const dirAutoElements = commentItem.querySelectorAll('span[dir="auto"], div[dir="auto"], p[dir="auto"]');
    for (const el of dirAutoElements) {
      // Ensure element is not an author link or header
      if (
        (cleanAuthor && el.closest(`a[href*="/${cleanAuthor}"]`)) ||
        el.closest('a[role="link"]') ||
        el.closest('a[href^="/"]') ||
        el.closest('h2') ||
        el.closest('h3') ||
        el.closest('header')
      ) {
        continue;
      }
      // Ensure element is not inside an action row or button
      if (el.closest('button, [role="button"], .instareply-comment-reply-chip, .instareply-shortcut-btn')) {
        continue;
      }
      const text = el.innerText?.trim() || el.textContent?.trim() || '';
      if (text && !isCommentMetadata(text, cleanAuthor) && text.length > 1) {
        return cleanCommentString(text, cleanAuthor);
      }
    }

    // 2. Clone the comment element and strip non-comment sub-trees
    try {
      const clone = commentItem.cloneNode(true);

      // Strip InstaReply injected buttons
      clone.querySelectorAll('.instareply-shortcut-btn, .instareply-comment-reply-chip').forEach(n => n.remove());

      // Strip buttons, roles, SVGs, images
      clone.querySelectorAll('button, [role="button"], img, svg, canvas').forEach(n => n.remove());

      // Strip author link if present
      if (cleanAuthor) {
        clone.querySelectorAll(`a[href*="${cleanAuthor}"], a[role="link"], a[href^="/"]`).forEach(n => n.remove());
        clone.querySelectorAll('h2, h3, header').forEach(n => {
          if (n.textContent.toLowerCase().includes(cleanAuthor.toLowerCase())) {
            n.remove();
          }
        });
      }

      // Strip metadata nodes (timestamps, likes, etc.)
      const nodes = clone.querySelectorAll('span, div, p, time');
      for (const node of nodes) {
        const txt = node.textContent?.trim() || '';
        if (isCommentMetadata(txt, cleanAuthor)) {
          node.remove();
        }
      }

      const cloneText = clone.innerText?.trim() || clone.textContent?.trim() || '';
      if (cloneText && !isCommentMetadata(cloneText, cleanAuthor) && cloneText.length > 1) {
        return cleanCommentString(cloneText, cleanAuthor);
      }
    } catch (_) {}

    // 3. Fallback: Search all spans for valid candidate texts and pick the richest/longest
    const candidates = [];
    const spans = commentItem.querySelectorAll('span, div, p');
    for (const span of spans) {
      if (span.children.length > 1) continue; // prefer leaf nodes
      if (span.closest('button, [role="button"], a[href*="/"], a[role="link"], header, h2, h3')) continue;

      const txt = span.innerText?.trim() || span.textContent?.trim() || '';
      if (txt && !isCommentMetadata(txt, cleanAuthor) && txt.length > 1) {
        candidates.push(txt);
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => b.length - a.length);
      return cleanCommentString(candidates[0], cleanAuthor);
    }

    return '';
  }

  /**
   * Finds the comment text for a given author inside a post article or dialog
   */
  function findCommentByAuthor(article, targetAuthor) {
    if (!article || !targetAuthor) return { author: targetAuthor, incomingText: '', commentItem: null };

    const clean = targetAuthor.trim().replace(/^@/, '');

    // 1. Check if we recently cached this exact comment from a native "Reply" button click
    const currentPostId = extractPostIdentifier(article);
    if (
      lastActiveCommentContext &&
      lastActiveCommentContext.incomingText &&
      lastActiveCommentContext.commentItem &&
      document.contains(lastActiveCommentContext.commentItem) &&
      (!lastActiveCommentContext.postId || !currentPostId || lastActiveCommentContext.postId === currentPostId) &&
      (Date.now() - lastActiveCommentContext.timestamp < 45000)
    ) {
      if (
        clean &&
        lastActiveCommentContext.author.toLowerCase() === clean.toLowerCase()
      ) {
        return {
          author: lastActiveCommentContext.author,
          incomingText: lastActiveCommentContext.incomingText,
          commentItem: lastActiveCommentContext.commentItem
        };
      }
    }

    // 2. Search for the comment item in the article/post container
    const authorMatches = article.querySelectorAll(`
      a[href*="/${clean}/"],
      a[href*="/${clean}"],
      strong,
      h3,
      span[role="link"]
    `);

    for (const el of authorMatches) {
      const text = el.textContent?.trim().replace(/^@/, '') || '';
      const href = el.getAttribute('href') || '';
      const matchesAuthor = text.toLowerCase() === clean.toLowerCase() ||
                            href.toLowerCase().includes(`/${clean.toLowerCase()}`);

      if (!matchesAuthor) continue;

      // Ensure this is a comment and NOT the post author header
      const commentItem = el.closest('li') ||
                          el.closest('.ig-comment') ||
                          el.closest('ul > div') ||
                          el.closest('div[role="button"]')?.parentElement;

      if (!commentItem) continue;

      // Skip if this is the post header (e.g., article > header)
      if (commentItem.closest('header') || commentItem.tagName.toLowerCase() === 'header') {
        continue;
      }

      const commentText = extractCommentTextFromContainer(commentItem, clean);
      if (commentText) {
        return {
          author: clean,
          incomingText: commentText,
          commentItem
        };
      }
    }

    return { author: clean, incomingText: '', commentItem: null };
  }

  /**
   * Scans for individual comment rows and injects an inline "✨ AI Reply" button next to "Reply"
   */
  function scanAndInjectCommentActionButtons() {
    // Find reply buttons/links under individual comments
    const replyElements = document.querySelectorAll('button, span[role="button"], div[role="button"], span');

    replyElements.forEach((el) => {
      if (
        el.dataset.instareplyCommentInjected ||
        el.closest('.instareply-card-overlay') ||
        el.closest('.instareply-shortcut-btn') ||
        el.closest('.instareply-comment-reply-chip')
      ) {
        return;
      }

      const text = el.textContent?.trim() || '';
      const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
      const lowerText = text.toLowerCase();
      const isReplyBtn = (
        lowerText === 'reply' ||
        lowerText === '回覆' ||
        lowerText === '回复' ||
        lowerText === '返信' ||
        lowerText === 'responder' ||
        lowerText === 'répondre' ||
        lowerText === 'antworten' ||
        ariaLabel.includes('reply to') ||
        ariaLabel.includes('回覆') ||
        ariaLabel.includes('回复') ||
        ariaLabel.includes('返信')
      );

      if (!isReplyBtn) return;

      // Never match inside a follow button, notifications panel, or header
      if (
        el.closest('button')?.textContent?.match(/follow\s*back|following|requested/i) ||
        el.closest('header, nav')
      ) {
        return;
      }

      // Ensure this element is inside a comment row / container
      const commentItem = el.closest('li') || el.closest('ul > div') || el.closest('div[role="button"]')?.parentElement || el.closest('.ig-comment');
      if (!commentItem) return;

      // Reject notification items
      if (commentItem.textContent?.match(/started following you|liked your post/i)) {
        return;
      }

      // Extract comment author
      const authorEl = commentItem.querySelector('a[href*="/"] strong, a[href*="/"] span, a[role="link"], strong');
      if (!authorEl) return;

      const rawAuthor = authorEl.textContent.trim().replace(/^@/, '');
      if (!rawAuthor) return;

      el.dataset.instareplyCommentInjected = 'true';

      // Listen for native Instagram "Reply" clicks to capture context immediately
      el.addEventListener('click', () => {
        try {
          const commentText = extractCommentTextFromContainer(commentItem, rawAuthor);
          const postCont = commentItem.closest('article') || commentItem.closest('div[role="dialog"]') || findPostContainer(commentItem);
          const postId = extractPostIdentifier(postCont);
          lastActiveCommentContext = {
            author: rawAuthor,
            incomingText: commentText,
            commentItem,
            postId,
            timestamp: Date.now()
          };
        } catch (_) {}
      });

      // Create the inline AI Reply chip
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'instareply-comment-reply-chip';
      chip.title = `Draft AI Reply to @${rawAuthor}`;
      chip.innerHTML = `<span class="instareply-chip-sparkle">✨</span> AI Reply`;

      chip.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        // Extract the specific comment's body text using the robust extractor
        const commentText = extractCommentTextFromContainer(commentItem, rawAuthor);
        const postCont = commentItem.closest('article') || commentItem.closest('div[role="dialog"]') || findPostContainer(commentItem);
        const postId = extractPostIdentifier(postCont);
        lastActiveCommentContext = {
          author: rawAuthor,
          incomingText: commentText,
          commentItem,
          postId,
          timestamp: Date.now()
        };

        // Trigger native reply button click so Instagram can initialize its reply state
        try {
          el.click();
        } catch (_) {}

        // Locate the comment input for this post
        const article = commentItem.closest('article') || commentItem.closest('div[role="dialog"]') || document.querySelector('article') || document;
        const commentInput = article.querySelector(`
          form div[role="textbox"][contenteditable="true"],
          div[role="textbox"][contenteditable="true"],
          div[contenteditable="true"][aria-label*="comment" i],
          div[contenteditable="true"][aria-placeholder*="comment" i],
          div[contenteditable="true"][data-lexical-editor="true"],
          form textarea,
          textarea[placeholder*="comment" i]
        `) || document.querySelector(`
          form div[role="textbox"][contenteditable="true"],
          div[role="textbox"][contenteditable="true"],
          div[contenteditable="true"][aria-label*="comment" i],
          div[contenteditable="true"][aria-placeholder*="comment" i],
          div[contenteditable="true"][data-lexical-editor="true"],
          form textarea,
          textarea[placeholder*="comment" i]
        `);

        // Open AI assistant card anchored directly to this comment!
        openAssistantCard(commentInput, 'comment', chip, {
          incomingText: commentText,
          author: rawAuthor
        });
      });

      // Insert immediately after native "Reply"
      el.insertAdjacentElement('afterend', chip);
    });
  }

  /**
   * Helper to locate the rounded pill / capsule container of a DM composer
   */
  function findDmPillContainer(inputEl) {
    if (!inputEl) return null;
    if (
      inputEl.closest('.instareply-card-overlay') ||
      inputEl.closest('.instareply-card') ||
      inputEl.classList.contains('instareply-textarea') ||
      inputEl.id === 'instareply-output-text'
    ) {
      return null;
    }

    // 1. Test harness mock
    const mock = inputEl.closest('.ig-dm-composer');
    if (mock) return mock;

    let curr = inputEl.parentElement;
    let bestPill = null;

    // 2. Walk up looking for the rounded pill container (typically has border-radius >= 14px or border)
    for (let i = 0; i < 8 && curr && curr !== document.body; i++) {
      if (
        curr.getAttribute('role') === 'main' ||
        curr.tagName === 'FORM' ||
        curr.classList.contains('instareply-card-overlay') ||
        curr.classList.contains('instareply-card')
      ) {
        break;
      }
      if (window.getComputedStyle) {
        const s = window.getComputedStyle(curr);
        const rTL = parseFloat(s.borderTopLeftRadius) || 0;
        const rTR = parseFloat(s.borderTopRightRadius) || 0;
        const rBL = parseFloat(s.borderBottomLeftRadius) || 0;
        const rBR = parseFloat(s.borderBottomRightRadius) || 0;
        const maxR = Math.max(rTL, rTR, rBL, rBR, parseFloat(s.borderRadius) || 0);

        const bT = parseFloat(s.borderTopWidth) || 0;
        const bR = parseFloat(s.borderRightWidth) || 0;
        const bB = parseFloat(s.borderBottomWidth) || 0;
        const bL = parseFloat(s.borderLeftWidth) || 0;
        const hasBorder = (bT > 0 || bR > 0 || bB > 0 || bL > 0) && s.borderStyle !== 'none';

        const h = curr.offsetHeight;
        // Instagram DM composer pill: rounded corners (>=14px) and height ~28px-100px
        if (maxR >= 14 && h >= 28 && h <= 100) {
          bestPill = curr;
          break;
        }
        if (hasBorder && h >= 28 && h <= 80) {
          if (!bestPill) bestPill = curr;
        }
      }
      curr = curr.parentElement;
    }

    return bestPill || inputEl.parentElement?.parentElement || inputEl.parentElement;
  }

  /**
   * Locates the immediate comment input bar container or form
   * (e.g., in Reels or post modals without a <form> tag)
   */
  function findCommentInputContainer(inputEl) {
    if (!inputEl) return null;
    if (
      inputEl.closest('.instareply-card-overlay') ||
      inputEl.closest('.instareply-card') ||
      inputEl.classList.contains('instareply-textarea') ||
      inputEl.id === 'instareply-output-text'
    ) {
      return null;
    }
    const form = inputEl.closest('form');
    if (form) return form;

    // In Reels or dialogs without <form>, find the immediate comment row or pill
    let curr = inputEl.parentElement;
    let pillContainer = curr;

    while (curr && curr !== document.body) {
      if (
        curr.getAttribute('role') === 'dialog' ||
        curr.tagName.toLowerCase() === 'article' ||
        curr.classList.contains('instareply-card-overlay') ||
        curr.classList.contains('instareply-card')
      ) {
        break;
      }
      // Check if curr is a container holding the input and action icons (⚡, 😊, Post)
      const actions = curr.querySelectorAll('button, [role="button"], svg');
      const hasExternalActions = Array.from(actions).some(a => !inputEl.contains(a) && !a.closest('.instareply-shortcut-btn'));
      if (hasExternalActions) {
        pillContainer = curr;
        break;
      }
      if (curr.clientHeight > 0 && curr.clientHeight < 120) {
        pillContainer = curr;
      } else if (curr.clientHeight >= 120) {
        break;
      }
      curr = curr.parentElement;
    }

    return pillContainer;
  }

  /**
   * Inserts the shortcut button into a comment input bar (Feed, Post modal, or Reels)
   * Sits cleanly on the horizontal row before the action icons (lightning/emoji/post),
   * ensuring it NEVER stacks vertically, overlaps buttons, or escapes to dialog headers.
   */
  function insertShortcutIntoComment(btn, inputEl) {
    if (!inputEl || inputEl.closest('.instareply-card-overlay') || inputEl.closest('.instareply-card')) return;

    const container = findCommentInputContainer(inputEl);
    if (!container) {
      inputEl.insertAdjacentElement('afterend', btn);
      return;
    }

    // Guard against duplicates
    if (container.querySelector('.instareply-shortcut-btn')) return;

    // Reset any DM-specific absolute styles so it functions as an inline flex-row sibling
    btn.classList.remove('instareply-dm-shortcut-btn');
    btn.style.position = 'relative';
    btn.style.transform = 'none';

    // 1. Locate the top-level input column/container inside the container
    let inputColumn = inputEl;
    while (inputColumn.parentElement && inputColumn.parentElement !== container && !inputColumn.parentElement.contains(container)) {
      inputColumn = inputColumn.parentElement;
    }

    // 2. Find any action buttons or icons in the container (Post, Emoji, Lightning, etc.)
    const allActions = Array.from(container.querySelectorAll('button, [role="button"], svg'))
      .filter(b => b !== btn && !inputEl.contains(b) && !b.closest('.instareply-shortcut-btn'));

    // Check if there is an existing submit/post button
    let postBtn = null;
    for (const b of allActions) {
      if (b.tagName === 'BUTTON' && (b.type === 'submit' || b.classList.contains('ig-post-btn'))) {
        postBtn = b;
        break;
      }
    }
    if (!postBtn) {
      for (const b of allActions) {
        const txt = (b.innerText || b.textContent || '').trim().toLowerCase();
        if (txt === 'post' || txt === '發佈' || txt === '发布' || txt === '投稿' || txt === 'publicar' || txt === 'publier' || txt === 'posten' || txt === 'condividi') {
          postBtn = b;
          break;
        }
      }
    }

    // 3. Find the action container on the right side of the container
    let actionTarget = postBtn || (allActions.length > 0 ? allActions[0] : null);

    if (actionTarget) {
      // Walk up from actionTarget to find its wrapper that is a sibling of inputColumn inside container
      let actionColumn = actionTarget;
      while (
        actionColumn.parentElement &&
        actionColumn.parentElement !== container &&
        !actionColumn.parentElement.contains(inputEl)
      ) {
        actionColumn = actionColumn.parentElement;
      }

      if (actionColumn && actionColumn !== container && actionColumn.parentElement) {
        actionColumn.insertAdjacentElement('beforebegin', btn);
        return;
      }
    }

    // 4. Fallback: place immediately after the input's column in the flex row
    if (inputColumn && inputColumn !== container && inputColumn.parentElement) {
      inputColumn.insertAdjacentElement('afterend', btn);
    } else {
      inputEl.insertAdjacentElement('afterend', btn);
    }
  }

  /**
   * Inserts the shortcut button into a DM composer (fullscreen or PIP / mini-window)
   * Absolutely positions it inside the input pill, vertically centered on the far right
   */
  function insertShortcutIntoDm(btn, inputEl) {
    if (!inputEl || inputEl.closest('.instareply-card-overlay') || inputEl.closest('.instareply-card')) return;

    const pill = findDmPillContainer(inputEl);
    if (!pill) {
      inputEl.insertAdjacentElement('afterend', btn);
      return;
    }

    // Guard against duplicates
    if (pill.querySelector('.instareply-shortcut-btn')) return;

    btn.classList.add('instareply-dm-shortcut-btn');

    // Ensure pill has relative positioning so our absolute button anchors cleanly inside it
    if (window.getComputedStyle) {
      const pos = window.getComputedStyle(pill).position;
      if (pos === 'static' || !pos) {
        pill.style.position = 'relative';
      }
    } else {
      pill.style.position = 'relative';
    }

    // Add right padding to input so typed message text doesn't collide with the button
    if (inputEl) {
      inputEl.style.paddingRight = '38px';
    }

    // Check if there are other buttons/icons inside the pill (e.g. Send button or action icons)
    const otherButtons = Array.from(pill.querySelectorAll('button:not(.instareply-shortcut-btn), [role="button"]:not(.instareply-shortcut-btn), svg'))
      .filter(el => !inputEl.contains(el) && !el.closest('.instareply-shortcut-btn'));

    if (otherButtons.length > 0) {
      let rightOffset = 10;
      const pRect = pill.getBoundingClientRect();
      if (pRect.width > 0) {
        otherButtons.forEach(b => {
          const bRect = b.getBoundingClientRect();
          if (bRect.width > 0 && bRect.height > 0) {
            const fromRight = pRect.right - bRect.left + 6;
            if (fromRight > rightOffset && fromRight < pRect.width - 40) {
              rightOffset = Math.round(fromRight);
            }
          }
        });
      }
      btn.style.right = `${rightOffset}px`;
    } else {
      btn.style.right = '10px';
    }

    pill.appendChild(btn);
  }

  /**
   * Injects the InstaReply shortcut button into/near the target input
   */
  function injectShortcutButton(inputEl, contextType) {
    if (!inputEl) return;
    if (
      inputEl.closest('.instareply-card-overlay') ||
      inputEl.closest('.instareply-card') ||
      inputEl.classList.contains('instareply-textarea') ||
      inputEl.id === 'instareply-output-text'
    ) {
      return;
    }

    // Check if the parent comment container or form already has an InstaReply button
    const commentContainer = findCommentInputContainer(inputEl);
    if (commentContainer) {
      const existingBtns = commentContainer.querySelectorAll('.instareply-shortcut-btn');
      if (existingBtns.length > 0) {
        // Prune any extra duplicates
        for (let i = 1; i < existingBtns.length; i++) {
          existingBtns[i].remove();
        }
        inputEl.dataset.instareplyInjected = 'true';
        return;
      }
    }

    // Check if DM composer pill already has an InstaReply button
    if (contextType === 'dm') {
      const dmRow = findDmPillContainer(inputEl) || inputEl.closest('.ig-dm-composer') || inputEl.parentElement;
      if (dmRow) {
        const existingBtns = dmRow.querySelectorAll('.instareply-shortcut-btn');
        if (existingBtns.length > 0) {
          for (let i = 1; i < existingBtns.length; i++) {
            existingBtns[i].remove();
          }
          inputEl.dataset.instareplyInjected = 'true';
          return;
        }
      }
    }

    if (inputEl.dataset.instareplyInjected === 'true') {
      return;
    }

    inputEl.dataset.instareplyInjected = 'true';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'instareply-shortcut-btn';
    btn.title = `Draft ${contextType === 'dm' ? 'DM Reply' : 'Comment'} with InstaReply AI`;
    btn.innerHTML = SPARKLE_SVG;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const activeInput = findActiveInput(btn, contextType) || inputEl;
      openAssistantCard(activeInput, contextType, btn);
    });

    if (contextType === 'comment') {
      insertShortcutIntoComment(btn, inputEl);
    } else {
      insertShortcutIntoDm(btn, inputEl);
    }
  }

  /**
   * Finds current active input in the composer form
   */
  function findActiveInput(btn, contextType) {
    if (!btn) return null;
    if (contextType === 'comment') {
      const form = btn.closest('form');
      if (form) {
        return form.querySelector('div[role="textbox"][contenteditable="true"]') ||
               form.querySelector('textarea:not([aria-hidden="true"])') ||
               form.querySelector('textarea');
      }
      const container = btn.closest('article') || btn.closest('div[role="dialog"]');
      if (container) {
        return container.querySelector('form div[role="textbox"][contenteditable="true"], form textarea');
      }
    } else if (contextType === 'dm') {
      const dmContainer = btn.closest('.ig-dm-composer') ||
                          findDmPillContainer(btn) ||
                          findChatContainerForElement(btn) ||
                          btn.parentElement;
      if (dmContainer) {
        return dmContainer.querySelector('div[role="textbox"][contenteditable="true"]') ||
               dmContainer.querySelector('div[contenteditable="true"]') ||
               dmContainer.querySelector('textarea');
      }
    }
    return null;
  }

  /**
   * Helper to verify if a container is actually a DM chat thread
   * (and NOT a notifications drawer, activity flyout, or comments modal)
   */
  function isRealDmChatContainer(container) {
    if (!container) return false;

    // Reject notifications panel, activity drawer, comments list, post modals
    if (
      container.closest('aside') ||
      container.querySelector('nav, header')?.textContent?.match(/notifications|activity/i)
    ) {
      return false;
    }

    const headings = container.querySelectorAll('h1, h2, h3, [role="heading"]');
    for (const h of headings) {
      const ht = (h.textContent || '').trim().toLowerCase();
      if (ht.includes('notifications') || ht.includes('activity') || ht === 'comments') {
        return false;
      }
    }

    // Must have DM composer, DM markers, or be in /direct/ route main container
    const isDirectMain = window.location.pathname.includes('/direct') && (container.getAttribute('role') === 'main' || container.closest('div[role="main"]'));
    const hasComposer = !!container.querySelector(
      '.ig-dm-composer, div[data-lexical-editor="true"], [aria-label*="message" i], [placeholder*="message" i]'
    );
    const isExplicitDm = !!(
      container.classList.contains('ig-dm-card') ||
      container.classList.contains('ig-dm-messages') ||
      container.classList.contains('ig-pip-window')
    );

    return isDirectMain || hasComposer || isExplicitDm || isInsideFloatingChat(container);
  }

  /**
   * Finds the active DM chat thread container for a given element (bubble, button, input)
   */
  function findChatContainerForElement(el) {
    if (!el) return null;
    const dialog = el.closest('div[role="dialog"]');
    if (dialog && isRealDmChatContainer(dialog)) return dialog;
    return el.closest('.ig-dm-card') ||
           el.closest('.ig-dm-composer')?.parentElement ||
           el.closest('div[role="main"]') ||
           document.querySelector('div[role="main"]');
  }

  /**
   * Scans for incoming DM messages and injects an inline "✨ AI Reply" chip
   * Handles both fullscreen direct chat and PIP / floating mini-windows
   */
  function scanAndInjectDmMessageReplyButtons() {
    // Collect all candidate chat thread containers (fullscreen + floating dialogs + mock)
    const chatContainers = new Set();
    if (window.location.pathname.includes('/direct')) {
      const main = document.querySelector('div[role="main"]');
      if (main && isRealDmChatContainer(main)) chatContainers.add(main);
    }
    document.querySelectorAll('div[role="dialog"], .ig-dm-card, .ig-dm-messages').forEach((el) => {
      if (isRealDmChatContainer(el)) {
        chatContainers.add(el);
      }
    });
    // Check for any floating chat containers
    document.querySelectorAll('div').forEach((el) => {
      if (isInsideFloatingChat(el)) {
        chatContainers.add(el);
      }
    });

    chatContainers.forEach((chatContainer) => {
      const candidateBubbles = chatContainer.querySelectorAll('.ig-msg-received, div[dir="auto"]');

      candidateBubbles.forEach((bubble) => {
        if (
          bubble.dataset.instareplyDmInjected ||
          bubble.closest('.instareply-card-overlay') ||
          bubble.closest('.instareply-shortcut-btn') ||
          bubble.closest('.instareply-dm-reply-chip') ||
          bubble.closest('.instareply-comment-reply-chip') ||
          bubble.closest('button, [role="button"]') ||
          bubble.closest('a[role="link"], a[href^="/"]') ||
          bubble.closest('header, nav, footer') ||
          bubble.closest('.ig-dm-composer') ||
          bubble.closest('form') ||
          bubble.getAttribute('contenteditable') === 'true' ||
          bubble.closest('[contenteditable="true"]')
        ) {
          return;
        }

        // Check if outgoing message
        if (isOutgoingDmBubble(bubble)) return;

        const text = bubble.innerText?.trim() || bubble.textContent?.trim() || '';
        if (
          !text ||
          text.length < 2 ||
          isCommentMetadata(text) ||
          text.match(/^(follow|follow back|following|requested|message|view profile)$/i)
        ) {
          return;
        }

        bubble.dataset.instareplyDmInjected = 'true';

        // Create inline DM Reply chip
        const chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'instareply-dm-reply-chip';
        chip.title = 'Draft AI Reply to this message';
        chip.innerHTML = '<span class="instareply-chip-sparkle">✨</span> AI Reply';

        chip.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          // Locate DM composer input in this thread container
          const dmInput = chatContainer.querySelector(`
            .ig-dm-composer div[contenteditable="true"],
            .ig-dm-composer textarea,
            div[contenteditable="true"][data-lexical-editor="true"],
            div[contenteditable="true"][role="textbox"],
            div[contenteditable="true"],
            textarea
          `) || document.querySelector('div[role="main"] div[contenteditable="true"]') || document.querySelector('div[contenteditable="true"]');

          // Locate chat partner in this thread
          const chatHeader = chatContainer.querySelector('header, .ig-post-header') ||
                             chatContainer.querySelector('h1, h2, h3') ||
                             chatContainer.querySelector('a[role="link"]');
          let author = '';
          if (chatHeader) {
            const nameEl = chatHeader.querySelector('strong, h1, h2, h3, span[dir="auto"]');
            if (nameEl) {
              author = nameEl.innerText?.trim().replace(/^@/, '') || '';
            } else {
              author = chatHeader.innerText?.trim().split('\n')[0].replace(/^@/, '') || '';
            }
          }

          openAssistantCard(dmInput, 'dm', chip, {
            incomingText: text,
            author: author || 'Chat partner'
          });
        });

        bubble.insertAdjacentElement('afterend', chip);
      });
    });
  }

  function isOutgoingDmBubble(bubble) {
    if (bubble.classList.contains('ig-msg-sent') || bubble.closest('.ig-msg-sent')) {
      return true;
    }
    if (bubble.classList.contains('ig-msg-received') || bubble.closest('.ig-msg-received')) {
      return false;
    }

    let curr = bubble;
    while (curr && curr !== document.body && curr.getAttribute('role') !== 'main') {
      const style = window.getComputedStyle ? window.getComputedStyle(curr) : null;
      if (style) {
        if (style.alignSelf === 'flex-end' || style.justifyContent === 'flex-end') {
          return true;
        }
        if (style.marginLeft === 'auto' && style.marginRight !== 'auto') {
          return true;
        }
      }
      curr = curr.parentElement;
    }
    return false;
  }

  /**
   * Helper to check if an element is inside a comments drawer, comments dialog, or comment list
   */
  function isInsideCommentsSection(el) {
    if (!el) return false;
    if (el.closest && (el.closest('.instareply-card-overlay') || el.closest('.instareply-card'))) return false;

    // Direct comments drawer or modal dialog (without video)
    const dialog = el.closest ? el.closest('div[role="dialog"]') : null;
    if (dialog) {
      const heading = dialog.querySelector('h1, h2, h3, [role="heading"]');
      const headingText = (heading?.textContent || '').trim().toLowerCase();
      if (['comments', '留言', 'コメント', 'comentarios', 'kommentare', 'commentaires'].some(k => headingText.includes(k))) {
        return true;
      }
      // If dialog has comment inputs but NO video element, it's a comments drawer
      if (dialog.querySelector('textarea, div[contenteditable="true"]') && !dialog.querySelector('video')) {
        return true;
      }
    }

    // Check parent comment list structures
    if (el.closest) {
      if (
        el.closest('ul') ||
        el.closest('ol') ||
        el.closest('.ig-comments-section') ||
        el.closest('.ig-comment') ||
        el.closest('form')
      ) {
        return true;
      }

      // Element in close proximity to a "Reply" button inside a comment row
      const parentRow = el.closest('div[role="button"]')?.parentElement || el.parentElement;
      if (parentRow) {
        const hasReplyBtn = Array.from(parentRow.querySelectorAll('button, [role="button"], span')).some(b => {
          const t = (b.textContent || '').trim().toLowerCase();
          return t === 'reply' || t === '回复' || t === '返信' || t === 'responder';
        });
        if (hasReplyBtn && !el.matches('button, [role="button"]')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Helper to check if a specific post container is a Reel (and NOT an image/photo post)
   */
  function isReelContainer(container) {
    if (!container) return false;
    if (container.dataset?.instareplyReel === 'true') return true;
    if (window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/')) return true;

    // Check if THIS specific container actually contains a video element
    if (container.querySelector && container.querySelector('video')) return true;

    return false;
  }

  /**
   * Finds the currently visible active Reel video element on the page
   */
  function findActiveReelVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (videos.length === 0) return null;
    if (videos.length === 1) return videos[0];

    // 1. First priority: video that is actively playing (not paused and has played frames)
    const playingVideos = videos.filter(v => {
      try {
        return !v.paused && v.currentTime > 0;
      } catch (_) {
        return false;
      }
    });

    if (playingVideos.length === 1) return playingVideos[0];
    const candidateList = playingVideos.length > 1 ? playingVideos : videos;

    // 2. Pick video with largest visible area intersecting the viewport
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 800;
    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1200;

    let bestVideo = null;
    let maxVisibleArea = -1;

    for (const v of candidateList) {
      try {
        const r = v.getBoundingClientRect();
        const visibleWidth = Math.max(0, Math.min(r.right, viewportWidth) - Math.max(r.left, 0));
        const visibleHeight = Math.max(0, Math.min(r.bottom, viewportHeight) - Math.max(r.top, 0));
        const visibleArea = visibleWidth * visibleHeight;

        if (visibleArea > maxVisibleArea) {
          maxVisibleArea = visibleArea;
          bestVideo = v;
        }
      } catch (_) {}
    }

    return bestVideo || candidateList[0] || videos[0];
  }

  /**
   * Finds the active Reel item container enclosing the video and its overlay metadata
   */
  function findActiveReelContainer(activeVideo) {
    const video = activeVideo || findActiveReelVideo();
    if (!video) return null;

    let curr = video.parentElement;
    let bestContainer = null;

    while (curr && curr !== document.body) {
      if (isInsideCommentsSection(curr)) {
        curr = curr.parentElement;
        continue;
      }

      // Look for author profile link inside this ancestor (excluding reel permalinks)
      const hasAuthor = curr.querySelector('a[href^="/"]:not([href*="/reel/"]):not([href*="/reels/"]):not([href*="/explore/"]):not([href*="/direct/"]):not([href*="/audio/"])');
      const hasButtons = curr.querySelector('button, [role="button"]');

      if (hasAuthor && hasButtons) {
        bestContainer = curr;
        if (
          curr.tagName.toLowerCase() === 'article' ||
          curr.getAttribute('role') === 'region' ||
          curr.getAttribute('role') === 'dialog' ||
          curr.classList.contains('ig-post-card') ||
          curr.classList.contains('reel-item-container')
        ) {
          return curr;
        }
      }

      if (curr.getAttribute('role') === 'main' || curr.tagName.toLowerCase() === 'main') {
        return bestContainer || curr;
      }

      curr = curr.parentElement;
    }

    return bestContainer || video.parentElement;
  }

  /**
   * Extracts post author from an active Reel container
   */
  function extractReelAuthor(reelContainer) {
    // 1. If on dedicated /reel/ or /reels/ URL, check canonical title/og/JSON-LD first
    const isDedicatedRoute = window.location.pathname.startsWith('/reel/') ||
                             (window.location.pathname.startsWith('/reels/') && !window.location.pathname.startsWith('/reels/videos'));
    if (isDedicatedRoute) {
      const canonical = extractPostAuthor(reelContainer);
      if (canonical) return canonical;
    }

    const root = reelContainer || findActiveReelContainer() || document.querySelector('article, div[role="region"]') || document.body;

    const bannedRoutes = new Set([
      'explore', 'reels', 'reel', 'direct', 'stories', 'p', 'tv', 'audio', 'videos',
      'accounts', 'developer', 'about', 'help', 'privacy', 'terms', 'api', 'notifications', 'create'
    ]);

    // 2. Avatar profile picture alt text on Reel overlay (reliable creator handle cue)
    const avatarImgs = Array.from(root.querySelectorAll('img[alt*="profile picture" i], img[alt*="的照片" i], img[alt*="大头贴" i], img[alt*="プロフィール写真" i]'));
    for (const avatarImg of avatarImgs) {
      if (isInsideCommentsSection(avatarImg) || avatarImg.closest('.instareply-card-overlay')) continue;
      const alt = avatarImg.getAttribute('alt') || '';
      const m = alt.match(/([a-zA-Z0-9._]+)(?:'s profile picture|的(?:大头贴|照片)|のプロフィール写真)/i);
      if (m && m[1] && !bannedRoutes.has(m[1].toLowerCase())) {
        return m[1];
      }
    }

    // 3. Check for author profile link near Follow button (strictly outside comments)
    const anchors = Array.from(root.querySelectorAll('a[href^="/"]'));
    for (const a of anchors) {
      if (isInsideCommentsSection(a) || a.closest('nav, aside') || a.closest('.instareply-card-overlay')) continue;
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (m && m[1]) {
        const handle = m[1];
        if (!bannedRoutes.has(handle.toLowerCase())) {
          // Check for nearby follow button
          const parent = a.closest('div, header, span');
          const hasFollowNearby = parent && Array.from(parent.parentElement?.querySelectorAll('button, [role="button"]') || []).some(btn => {
            const t = (btn.textContent || '').trim().toLowerCase();
            return ['follow', 'following', 'requested', '关注', '已关注', 'フォロー', 'suivre'].some(k => t.includes(k));
          });
          if (hasFollowNearby) {
            return handle;
          }
        }
      }
    }

    // 4. Any valid profile link on reel overlay matching anchor text
    for (const a of anchors) {
      if (isInsideCommentsSection(a) || a.closest('nav, aside') || a.closest('.instareply-card-overlay')) continue;
      const href = a.getAttribute('href') || '';
      const m = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
      if (m && m[1]) {
        const handle = m[1];
        if (!bannedRoutes.has(handle.toLowerCase())) {
          const text = (a.textContent || '').trim().replace(/^@/, '');
          if (text && (text.toLowerCase() === handle.toLowerCase() || a.querySelector('strong, span'))) {
            return handle;
          }
        }
      }
    }

    return extractPostAuthor(root);
  }

  /**
   * Extracts post caption from an active Reel container
   */
  function extractReelCaption(reelContainer, postAuthor = '') {
    // 1. If on dedicated /reel/ or /reels/ URL, check canonical h1/og:desc/title/JSON-LD first
    const isDedicatedRoute = window.location.pathname.startsWith('/reel/') ||
                             (window.location.pathname.startsWith('/reels/') && !window.location.pathname.startsWith('/reels/videos'));
    if (isDedicatedRoute) {
      const canonical = extractPostCaption(reelContainer, postAuthor);
      if (canonical) return canonical;
    }

    const root = reelContainer || findActiveReelContainer() || document.querySelector('article, div[role="region"]') || document.body;

    // 2. Candidate caption spans on the Reel video overlay (strictly outside comments)
    const candidateSpans = Array.from(root.querySelectorAll('h1[dir="auto"], span[dir="auto"], div[dir="auto"], h1, p'));
    for (const el of candidateSpans) {
      if (
        isInsideCommentsSection(el) ||
        el.closest('button, [role="button"]') ||
        el.closest('.instareply-card-overlay') ||
        el.closest('form') ||
        el.closest('svg') ||
        el.closest('nav, aside')
      ) {
        continue;
      }

      if (el.closest('a') && !el.textContent.includes('#')) {
        continue;
      }

      const raw = cleanCaptionText(el.textContent || '').trim();
      if (!raw || raw.length < 3) continue;

      if (postAuthor && (raw.toLowerCase() === postAuthor.toLowerCase() || raw.toLowerCase() === `@${postAuthor.toLowerCase()}`)) {
        continue;
      }

      const lower = raw.toLowerCase();
      if (['follow', 'following', 'requested', 'original audio', 'audio', 'like', 'comment', 'share', 'save', 'verified', 'comments'].includes(lower)) {
        continue;
      }

      if (lower.startsWith('原声') || lower.startsWith('original audio') || lower.startsWith('audio -')) {
        continue;
      }

      if (raw.includes('#') || (raw.length >= 3 && !/^\d+[\s,.]?\d*[KkMm]?$/.test(raw))) {
        if (isValidCaption(raw, postAuthor)) {
          return raw;
        }
      }
    }

    return extractPostCaption(root, postAuthor);
  }

  /**
   * Extracts video visuals & poster for an active Reel
   */
  function extractReelVisuals(reelContainer, activeVideo) {
    const root = reelContainer || findActiveReelContainer() || document.body;
    const video = activeVideo || root.querySelector('video') || findActiveReelVideo();
    let thumbnailUrl = '';
    let description = '';

    // 1. Check meta tags (authoritative for dedicated /reel/ and /reels/ routes)
    const ogImage = document.querySelector('meta[property="og:image"]')?.content ||
                    document.querySelector('meta[name="twitter:image"]')?.content;
    if (ogImage && ogImage.startsWith('http')) {
      thumbnailUrl = ogImage;
    }

    const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
    const imgAltMatch = ogDesc.match(/(?:Photo|Video) (?:by|shared by) .+?: (.+)$/i);
    if (imgAltMatch && imgAltMatch[1] && imgAltMatch[1].length > 8) {
      description = imgAltMatch[1].trim();
    }

    // 2. Video element poster
    if (video) {
      const poster = video.getAttribute('poster') || video.poster;
      if (poster && poster.startsWith('http')) {
        thumbnailUrl = poster;
      }
    }

    // 3. Fallback to large image in reel root outside comments
    if (!thumbnailUrl && root) {
      const img = root.querySelector('img[src*="cdninstagram.com"]:not([alt*="profile"]):not([alt*="avatar"]):not([alt*="大头贴"])');
      if (img && img.src && !isInsideCommentsSection(img) && !img.closest('.instareply-card-overlay')) {
        thumbnailUrl = img.src;
      }
    }

    return {
      mediaType: 'video',
      thumbnailUrl,
      description: description || 'Instagram Reel video'
    };
  }

  /**
   * Finds the closest Instagram post or dialog container for a given element
   */
  function findPostContainer(el) {
    if (el && el.closest) {
      // 1. Direct parent article / feed post (highest priority when interacting with feed post)
      const parentArticle = el.closest('article') || el.closest('.ig-post-card');
      if (parentArticle) return parentArticle;

      // 2. Direct comments drawer or modal dialog
      const parentModal = el.closest('div[role="dialog"]');
      if (parentModal) {
        const modalArticle = parentModal.querySelector('article, .ig-post-card');
        if (modalArticle) return modalArticle;

        const heading = parentModal.querySelector('h1, h2, h3, [role="heading"]');
        const headingText = (heading?.textContent || '').trim().toLowerCase();
        const isCommentsDrawer = (
          headingText === 'comments' ||
          headingText === '留言' ||
          headingText === 'コメント' ||
          headingText === 'comentarios' ||
          !parentModal.querySelector('video')
        );

        if (isCommentsDrawer || window.location.pathname.startsWith('/reel') || window.location.pathname.startsWith('/reels')) {
          const activeVideo = findActiveReelVideo();
          if (activeVideo) {
            const activeReel = findActiveReelContainer(activeVideo);
            if (activeReel) return activeReel;
          }
        }

        return parentModal;
      }

      // 3. On reel routes, resolve to active Reel container
      if (window.location.pathname.startsWith('/reel') || window.location.pathname.startsWith('/reels')) {
        const activeVideo = findActiveReelVideo();
        if (activeVideo) {
          const activeReel = findActiveReelContainer(activeVideo);
          if (activeReel) return activeReel;
        }
      }

      // 4. Direct parent main container on dedicated post route
      if (window.location.pathname.startsWith('/p/')) {
        const pageArticle = document.querySelector('article');
        if (pageArticle) return pageArticle;
        const parentMain = el.closest('main') || el.closest('div[role="main"]');
        if (parentMain) return parentMain;
      }
    }

    // 5. Active Reel on screen if on /reel/ or /reels/ route
    if (window.location.pathname.startsWith('/reel') || window.location.pathname.startsWith('/reels')) {
      const activeVideo = findActiveReelVideo();
      if (activeVideo) {
        const activeReel = findActiveReelContainer(activeVideo);
        if (activeReel) return activeReel;
      }
    }

    // 6. Check if an active modal dialog is open
    const openModal = document.querySelector('div[role="dialog"] article') || document.querySelector('div[role="dialog"]');
    if (openModal && openModal.querySelector('video, article, .ig-post-card, img')) {
      return openModal.querySelector('article') || openModal;
    }

    // 7. Fallback on dedicated single-post or reel URL
    if (window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/')) {
      return document.querySelector('article') ||
             document.querySelector('main') ||
             document.querySelector('div[role="main"]') ||
             document.querySelector('.ig-post-card') || null;
    }

    return null;
  }

  /**
   * Validates if a text string is a real Instagram post caption and not a username, handle, or button label
   */
  function isValidCaption(text, author = '') {
    if (!text) return false;
    const trimmed = text.trim();

    // Must have at least 3 characters
    if (trimmed.length < 3) return false;

    // Must not be the post author handle or current user
    if (author) {
      const cleanAuthor = author.toLowerCase().replace(/^@/, '');
      const cleanTrimmed = trimmed.toLowerCase().replace(/^@/, '');
      if (cleanTrimmed === cleanAuthor) return false;
    }

    // Must not be a single username handle or single token without spaces/emojis/punctuation
    if (/^@?[a-zA-Z0-9._]{1,35}$/.test(trimmed)) {
      return false;
    }

    // Must not be an Instagram UI or navigation label
    const lower = trimmed.toLowerCase();
    const banned = [
      'instagram', 'follow', 'following', 'message', 'view profile',
      'posts', 'reels', 'tagged', 'verified', 'switch accounts',
      'log in', 'sign up', 'search', 'explore', 'notifications',
      'reply', 'ai reply', 'add a comment'
    ];
    if (banned.includes(lower)) return false;

    if (
      lower.startsWith('view all') ||
      lower.startsWith('liked by') ||
      lower.endsWith('likes') ||
      lower.endsWith('others') ||
      lower.includes('view more comments') ||
      lower.includes('see translation')
    ) {
      return false;
    }

    const hasSpaces = /\s/.test(trimmed);
    const isCjk = /[\u4e00-\u9fff\u3040-\u30ff]/.test(trimmed);
    const hasEmoji = /\p{Extended_Pictographic}/u.test(trimmed);
    if (!hasSpaces && !hasEmoji && (!isCjk || trimmed.length < 3)) {
      if (/^[a-zA-Z0-9._]+$/.test(trimmed)) return false;
    }

    return true;
  }

  /**
   * Scans all comments in the post/reels comment thread and extracts all comments authored by the creator.
   * Creators frequently share context across their first comment, pinned notes, and follow-up replies.
   */
  function extractAllAuthorComments(container, postAuthor = '') {
    if (!container) return [];
    const cleanAuthor = (postAuthor || extractPostAuthor(container) || '').trim().replace(/^@/, '');
    if (!cleanAuthor) return [];

    const foundComments = [];
    const seenTexts = new Set();

    // Check candidate roots: the post container and any active comments dialog
    const roots = [container];
    const commentsDialog = document.querySelector('div[role="dialog"]');
    if (commentsDialog && commentsDialog !== container) {
      roots.push(commentsDialog);
    }

    for (const root of roots) {
      // 1. Find all author links in the comments area outside header/form
      const authorLinks = root.querySelectorAll(`
        a[href*="/${cleanAuthor}/"],
        a[href*="/${cleanAuthor}"],
        a[href$="/${cleanAuthor}"]
      `);

      for (const link of authorLinks) {
        if (
          link.closest('header') ||
          link.closest('.ig-post-header') ||
          link.closest('form') ||
          link.closest('.instareply-card-overlay')
        ) {
          continue;
        }

        const commentItem = link.closest('li') ||
                            link.closest('.ig-comment') ||
                            link.closest('ul > div') ||
                            link.closest('div[role="button"]')?.parentElement;

        if (!commentItem) continue;

        const commentText = extractCommentTextFromContainer(commentItem, cleanAuthor);
        if (commentText && commentText.length > 2 && !isCommentMetadata(commentText, cleanAuthor)) {
          const lower = commentText.toLowerCase();
          if (!seenTexts.has(lower)) {
            seenTexts.add(lower);
            foundComments.push(commentText);
          }
        }
      }

      // 2. Scan root comment rows (where Instagram caption row or pinned comments might lack explicit username anchor)
      const topItems = root.querySelectorAll(
        'ul > div, ul > li, .ig-comments-section > div, .ig-comments-section > li'
      );

      for (let i = 0; i < Math.min(topItems.length, 6); i++) {
        const item = topItems[i];
        if (
          item.closest('header') ||
          item.closest('.ig-post-header') ||
          item.closest('form') ||
          item.closest('.instareply-card-overlay')
        ) {
          continue;
        }

        const authorEl = item.querySelector('a[href*="/"] strong, a[href*="/"] span, a[role="link"], strong');
        const itemAuthor = authorEl ? authorEl.textContent.trim().replace(/^@/, '') : '';

        const isAuthorMatch = itemAuthor && (
          itemAuthor.toLowerCase() === cleanAuthor.toLowerCase() ||
          itemAuthor.toLowerCase().includes(cleanAuthor.toLowerCase())
        );

        const hasReplyBtn = Boolean(
          Array.from(item.querySelectorAll('button, [role="button"], span')).some(b => {
            const t = b.textContent?.trim().toLowerCase();
            return t === 'reply';
          })
        );

        if (isAuthorMatch || (!hasReplyBtn && i === 0)) {
          const text = extractCommentTextFromContainer(item, itemAuthor || cleanAuthor);
          if (text && text.length > 2 && !isCommentMetadata(text, cleanAuthor)) {
            const lower = text.toLowerCase();
            if (!seenTexts.has(lower)) {
              seenTexts.add(lower);
              if (!hasReplyBtn && i === 0) {
                foundComments.unshift(text);
              } else {
                foundComments.push(text);
              }
            }
          }
        }
      }
    }

    return foundComments;
  }

  function extractAuthorFirstComment(container, postAuthor = '') {
    const all = extractAllAuthorComments(container, postAuthor);
    return all.length > 0 ? all[0] : '';
  }

  /**
   * Robust multi-layer extraction of the Instagram post caption and all author comments
   */
  function extractPostCaption(container, knownAuthor = '') {
    if (!container) return '';
    const author = (knownAuthor || extractPostAuthor(container) || '').trim().replace(/^@/, '');
    const isDedicatedPost = window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/');

    let standardCaption = '';

    // 1. Instagram SEO & Accessibility heading (<h1 dir="auto">)
    // On dedicated post pages and modal dialogs, Instagram renders the canonical post caption as an <h1>
    const articleEl = container.matches && container.matches('article, div[role="dialog"]') ? container : (container.querySelector('article, div[role="dialog"]') || container);
    const h1 = articleEl.querySelector('h1[dir="auto"], h1');
    if (h1 && !h1.closest('header') && !h1.closest('.ig-post-header')) {
      const h1Text = cleanCaptionText(h1.textContent?.trim() || '');
      if (isValidCaption(h1Text, author)) {
        standardCaption = h1Text;
      }
    }

    // 2. Open Graph description & document.title on dedicated post/reel URLs (authoritative)
    if (!standardCaption && isDedicatedPost) {
      const ogDesc = document.querySelector('meta[property="og:description"]')?.content ||
                     document.querySelector('meta[name="description"]')?.content || '';
      if (ogDesc) {
        // IG format: "1,234 likes, 56 comments - user on Date: \"Caption here\""
        const quoteMatch = ogDesc.match(/:\s*[“"']([^”"']{3,})[”"']/);
        if (quoteMatch && quoteMatch[1]) {
          const cleaned = cleanCaptionText(quoteMatch[1]);
          if (isValidCaption(cleaned, author)) {
            standardCaption = cleaned;
          }
        } else {
          const descMatch = ogDesc.match(/-\s*[^:]+:\s*(.+)$/) || ogDesc.match(/shared a post on Instagram:\s*(.+)$/);
          if (descMatch && descMatch[1]) {
            const cleaned = cleanCaptionText(descMatch[1]);
            if (isValidCaption(cleaned, author)) {
              standardCaption = cleaned;
            }
          }
        }
      }

      if (!standardCaption && document.title) {
        const titleQuote = document.title.match(/:\s*[“"']([^”"']{3,})[”"']/);
        if (titleQuote && titleQuote[1]) {
          const cleaned = cleanCaptionText(titleQuote[1]);
          if (isValidCaption(cleaned, author)) {
            standardCaption = cleaned;
          }
        }
      }

      // Try JSON-LD structured data on direct post/reel pages
      if (!standardCaption) {
        try {
          const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
          for (const script of jsonLdScripts) {
            const data = JSON.parse(script.textContent || '{}');
            const cap = data.headline || data.articleBody || data.caption || data.description;
            if (cap && typeof cap === 'string') {
              const cleaned = cleanCaptionText(cap);
              if (isValidCaption(cleaned, author)) {
                standardCaption = cleaned;
                break;
              }
            }
          }
        } catch (_) {}
      }
    }

    // 3. Feed post caption structure (right after the author username link)
    if (!standardCaption) {
      const authorLinks = articleEl.querySelectorAll('a[role="link"], header a, .ig-post-header strong');
      for (const link of authorLinks) {
        // Exclude comment items and modal overlays
        if (link.closest('ul') || link.closest('li') || link.closest('.instareply-card-overlay')) continue;

        // Verify that this link belongs to the post author
        const href = link.getAttribute('href') || '';
        const match = href.match(/(?:instagram\.com|^)\/([a-zA-Z0-9._]+)\/?$/);
        const linkHandle = (match ? match[1] : (link.textContent || '')).replace(/^@/, '').trim().toLowerCase();
        if (author && linkHandle && linkHandle !== author.toLowerCase()) {
          continue;
        }

        const parentContainer = link.parentElement;
        if (parentContainer && !parentContainer.closest('header') && !parentContainer.closest('.ig-post-header')) {
          const captionSpan = parentContainer.querySelector('span[dir="auto"], span');
          if (captionSpan) {
            const txt = cleanCaptionText(captionSpan.textContent?.trim() || '');
            if (isValidCaption(txt, author)) {
              standardCaption = txt;
              break;
            }
          }
        }
      }
    }

    // 4. Scan content spans inside article (filtering out metadata, comments, forms, and buttons)
    if (!standardCaption) {
      const dirSpans = articleEl.querySelectorAll('span[dir="auto"]');
      for (const span of dirSpans) {
        if (
          span.closest('form') ||
          span.closest('ul') ||
          span.closest('li') ||
          span.closest('.instareply-card-overlay') ||
          span.closest('button') ||
          span.closest('header')
        ) {
          continue;
        }
        const txt = cleanCaptionText(span.textContent?.trim() || '');
        if (
          isValidCaption(txt, author) &&
          !txt.startsWith('View all') &&
          !txt.startsWith('Liked by') &&
          !txt.endsWith('likes') &&
          !txt.endsWith('others') &&
          !txt.includes('See translation')
        ) {
          standardCaption = txt;
          break;
        }
      }
    }

    // 5. Post main image alt text fallback
    if (!standardCaption) {
      const imgAlt = articleEl.querySelector('img[alt]')?.getAttribute('alt');
      if (imgAlt && imgAlt.length > 25) {
        const captionMatch = imgAlt.match(/Caption:\s*(.+)$/i) || imgAlt.match(/Photo (?:shared|by) [^.]+.\s*(.+)$/i);
        if (captionMatch && captionMatch[1]) {
          const cleaned = cleanCaptionText(captionMatch[1]);
          if (isValidCaption(cleaned, author)) {
            standardCaption = cleaned;
          }
        }
      }
    }

    // 6. Scan and append any genuine additional author comments (excluding the caption itself)
    const authorComments = extractAllAuthorComments(articleEl, author);
    const uniqueAuthorComments = authorComments.filter(c => {
      if (!standardCaption) return true;
      const lowerC = c.trim().toLowerCase();
      const lowerStd = standardCaption.trim().toLowerCase();
      return lowerC !== lowerStd && !lowerStd.includes(lowerC) && !lowerC.includes(lowerStd);
    });

    if (uniqueAuthorComments.length === 0) {
      return standardCaption || (authorComments[0] || '');
    }

    if (!standardCaption) {
      if (uniqueAuthorComments.length === 1) {
        return uniqueAuthorComments[0];
      }
      return uniqueAuthorComments.map((c, idx) => `[Author Comment #${idx + 1}]:\n${c}`).join('\n\n');
    }

    if (uniqueAuthorComments.length === 1) {
      return `${standardCaption}\n\n[Author's Comment]:\n${uniqueAuthorComments[0]}`;
    }

    const commentsBlock = uniqueAuthorComments.map((c, idx) => `[Author Comment #${idx + 1}]:\n${c}`).join('\n\n');
    return `${standardCaption}\n\n${commentsBlock}`;
  }

  /**
   * Extracts post author username from post header or metadata
   */
  function extractPostAuthor(container) {
    if (!container) container = document.querySelector('article') || document.querySelector('main') || document.querySelector('div[role="main"]') || document.body;

    const bannedRoutes = new Set([
      'explore', 'reels', 'reel', 'direct', 'stories', 'p', 'tv',
      'accounts', 'developer', 'about', 'help', 'privacy', 'terms', 'api', 'notifications', 'create'
    ]);

    const isDedicatedPost = window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/');

    const cleanCandidate = (handle) => {
      if (!handle) return '';
      const clean = handle.replace(/^@/, '').trim();
      if (/^[a-zA-Z0-9._]+$/.test(clean) && !bannedRoutes.has(clean.toLowerCase())) {
        return clean;
      }
      return '';
    };

    // 1. On dedicated post/reel URLs, document.title and Open Graph title are authoritative and unpolluted
    const pageTitle = (document.title || '').trim();
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content ||
                    document.querySelector('meta[name="twitter:title"]')?.content || '';

    // Instagram title formats:
    // - "Name (@handle) on Instagram: ..."
    // - "handle on Instagram: ..."
    // - "handle • Instagram photos and videos"
    for (const titleCandidate of [pageTitle, ogTitle]) {
      if (!titleCandidate) continue;
      // Match (@handle) before "on Instagram" or ":"
      const parenMatch = titleCandidate.match(/^.+?\(@([a-zA-Z0-9._]+)\)/);
      if (parenMatch && parenMatch[1]) {
        const c = cleanCandidate(parenMatch[1]);
        if (c) return c;
      }
      // Match "handle on Instagram"
      const onIgMatch = titleCandidate.match(/^([a-zA-Z0-9._]+)\s+on\s+Instagram/i);
      if (onIgMatch && onIgMatch[1]) {
        const c = cleanCandidate(onIgMatch[1]);
        if (c) return c;
      }
      // Match "handle • Instagram"
      const dotIgMatch = titleCandidate.match(/^([a-zA-Z0-9._]+)\s*•\s*Instagram/i);
      if (dotIgMatch && dotIgMatch[1]) {
        const c = cleanCandidate(dotIgMatch[1]);
        if (c) return c;
      }
    }

    // 2. Try JSON-LD structured data on direct post/reel page
    try {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        const data = JSON.parse(script.textContent || '{}');
        const authorObj = data.author || data.creator;
        if (authorObj) {
          const handle = authorObj.identifier?.value || authorObj.alternateName || authorObj.name;
          const c = cleanCandidate(handle);
          if (c) return c;
        }
      }
    } catch (_) {}

    // 3. Try post header links inside container or article (strictly inside header)
    const headerLinks = container.querySelectorAll(
      'header a[href^="/"], .ig-post-header a[href^="/"], header a[role="link"], .ig-post-header a'
    );
    for (const link of headerLinks) {
      if (link.closest('.instareply-card-overlay') || link.closest('li') || link.closest('.ig-comment')) continue;
      const href = link.getAttribute('href') || '';
      const match = href.match(/(?:instagram\.com|^)\/([a-zA-Z0-9._]+)\/?$/);
      if (match && match[1]) {
        const c = cleanCandidate(match[1]);
        if (c) return c;
      }
    }

    // 4. Feed post fallback: only scan links outside comment lists and forms
    if (!isDedicatedPost) {
      const allLinks = container.querySelectorAll('a[role="link"][href^="/"], a[href^="/"]');
      for (const link of allLinks) {
        if (
          link.closest('.instareply-card-overlay') ||
          link.closest('li') ||
          link.closest('ul') ||
          link.closest('form') ||
          link.closest('.ig-comment')
        ) continue;
        const href = link.getAttribute('href') || '';
        const match = href.match(/(?:instagram\.com|^)\/([a-zA-Z0-9._]+)\/?$/);
        if (match && match[1]) {
          const c = cleanCandidate(match[1]);
          if (c) return c;
        }
      }
    }

    return '';
  }

  function cleanCaptionText(text) {
    if (!text) return '';
    return text
      .replace(/\s*…\s*more$/i, '')
      .replace(/\s*more$/i, '')
      .replace(/\s*See translation$/i, '')
      .trim();
  }

  /**
   * Extracts visual context from the post (photo alt text, scene tags, video type, thumbnail)
   */
  function extractPostVisuals(container) {
    const isDedicatedPost = window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/');
    
    // Find the closest article or media root
    let target = container ? (container.closest('article') || (container.matches && container.matches('article') ? container : null)) : null;
    if (!target && isDedicatedPost) {
      target = document.querySelector('article') || document.querySelector('main') || document.querySelector('div[role="main"]') || document.body;
    }
    if (!target) target = container || document.body;

    let description = '';
    let thumbnailUrl = '';
    let mediaType = 'image';

    const currentPostId = extractPostIdentifier(target);

    // 1. Check for video or reel
    const video = target.querySelector('video') || (isDedicatedPost ? document.querySelector('article video, video') : null);
    if (video) {
      mediaType = 'video';
      if (video.poster) thumbnailUrl = video.poster;
    }

    // 2. Scan media images for visual descriptions and thumbnails
    const images = Array.from(target.querySelectorAll('img')).filter(img => {
      if (img.closest('.instareply-card-overlay')) return false;

      // Filter out images inside suggested post links ("More posts from...")
      const parentLink = img.closest('a[href*="/p/"], a[href*="/reel/"]');
      if (parentLink) {
        const href = parentLink.getAttribute('href') || '';
        if (currentPostId && !href.includes(currentPostId)) return false;
      }

      const alt = (img.getAttribute('alt') || '').toLowerCase();
      if (alt.includes('profile picture') || alt.includes('avatar')) return false;
      if (!img.src || img.src.startsWith('data:image/svg')) return false;
      // Filter out small action icons
      if (img.clientWidth > 0 && img.clientWidth < 80 && img.clientHeight > 0 && img.clientHeight < 80) return false;
      return true;
    });

    if (images.length > 0) {
      // Sort images by rendered/natural area to prioritize the main post photo over icons
      const sorted = [...images].sort((a, b) => {
        const areaA = (a.naturalWidth || a.clientWidth || 50) * (a.naturalHeight || a.clientHeight || 50);
        const areaB = (b.naturalWidth || b.clientWidth || 50) * (b.naturalHeight || b.clientHeight || 50);
        return areaB - areaA;
      });

      if (!thumbnailUrl && sorted[0]?.src) {
        thumbnailUrl = sorted[0].src;
      }

      // Check all candidate images for auto-generated alt text (multi-language support)
      for (const img of sorted) {
        const alt = img.getAttribute('alt') || '';
        if (alt) {
          // English: "May be an image of..."
          // Japanese: "画像に含まれている可能性があるもの:..." or "写真:..."
          // Chinese: "可能包含：..."
          // Spanish: "Puede ser una imagen de..."
          const match = alt.match(/(?:May be an? (?:image|photo|graphic|video) of|画像に含まれている可能性があるもの:?|可能包含：?|Puede ser una imagen de)\s*([^.]+)/i);
          if (match && match[1]) {
            description = match[1].trim();
            break;
          } else if (alt.length > 12 && !alt.toLowerCase().includes('profile picture')) {
            const cleanAlt = alt.replace(/^Photo (?:shared|by) [^.]+?\s*(?:on [^.]+?\.)?\s*/i, '').trim();
            if (cleanAlt.length > 5) {
              description = cleanAlt;
            } else {
              description = alt.trim();
            }
            break;
          }
        }
      }
    }

    // 3. Fallback: Open Graph meta tags (essential for dedicated /p/ or /reel/ URLs)
    if (isDedicatedPost || !thumbnailUrl) {
      if (!thumbnailUrl) {
        const ogImage = document.querySelector('meta[property="og:image"]')?.content ||
                        document.querySelector('meta[name="twitter:image"]')?.content;
        if (ogImage && ogImage.startsWith('http')) {
          thumbnailUrl = ogImage;
        }
      }
      if (!description) {
        const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
        const imgAltMatch = ogDesc.match(/(?:Photo|Video) (?:by|shared by) .+?: (.+)$/i);
        if (imgAltMatch && imgAltMatch[1] && imgAltMatch[1].length > 8) {
          description = imgAltMatch[1].trim();
        }
      }
    }

    // 4. Check aria-label descriptions
    if (!description) {
      const imgRole = target.querySelector('[role="img"][aria-label]');
      if (imgRole) {
        const label = imgRole.getAttribute('aria-label') || '';
        if (label && label.length > 12 && !label.toLowerCase().includes('profile')) {
          description = label.trim();
        }
      }
    }

    return {
      description,
      thumbnailUrl,
      mediaType
    };
  }

  /**
   * Attempts to detect the currently logged in Instagram user's username
   */
  function detectCurrentUser() {
    try {
      const profileLinks = document.querySelectorAll('a[href^="/"][role="link"], nav a[href^="/"]');
      for (const link of profileLinks) {
        const href = link.getAttribute('href') || '';
        if (
          href === '/' ||
          href.startsWith('/explore') ||
          href.startsWith('/reels') ||
          href.startsWith('/direct') ||
          href.startsWith('/notifications') ||
          href.startsWith('/create')
        ) {
          continue;
        }
        const avatarImg = link.querySelector('img[alt*="profile picture" i]');
        if (avatarImg) {
          const matched = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
          if (matched && matched[1]) {
            return matched[1];
          }
        }
      }
    } catch (_) {}
    return '';
  }

  /**
   * Determines the precise interaction role and relationship:
   * - Commenting directly on someone's post vs replying to an individual comment
   * - Whether the current user is the post creator or an outside visitor
   */
  function determineReplyRelationship({ contextType, isSpecificCommentReply, author, postAuthor }) {
    const currentUsername = detectCurrentUser();
    const isCurrentUserPostAuthor = Boolean(
      currentUsername &&
      postAuthor &&
      currentUsername.toLowerCase() === postAuthor.toLowerCase()
    );

    let replyMode = 'post_comment'; // 'post_comment' | 'comment_reply' | 'dm'
    let relationshipSummary = '';
    let target = '';

    if (contextType === 'dm') {
      replyMode = 'dm';
      relationshipSummary = author ? `Direct Message with @${author}` : 'Direct Message Conversation';
      target = author || 'Chat partner';
    } else if (isSpecificCommentReply) {
      replyMode = 'comment_reply';
      target = author;
      if (isCurrentUserPostAuthor) {
        relationshipSummary = `Replying as Creator (@${postAuthor}) to @${author}`;
      } else if (postAuthor && postAuthor !== author) {
        relationshipSummary = `Replying to @${author}'s comment on @${postAuthor}'s post`;
      } else {
        relationshipSummary = `Replying to @${author}'s comment`;
      }
    } else {
      replyMode = 'post_comment';
      target = postAuthor || 'Post';
      if (isCurrentUserPostAuthor) {
        relationshipSummary = `Commenting on your own post (@${postAuthor})`;
      } else if (postAuthor) {
        relationshipSummary = `Commenting on @${postAuthor}'s post`;
      } else {
        relationshipSummary = `Commenting on this post`;
      }
    }

    return {
      replyMode,
      currentUsername,
      isCurrentUserPostAuthor,
      relationshipSummary,
      target
    };
  }

  /**
   * Opens or toggles the AI Reply Assistant Card
   */
  async function openAssistantCard(inputEl, contextType, triggerBtn, specificComment = null) {
    // If card is already open on this input/comment, toggle it closed
    if (activeCard && activeInputTarget === inputEl && !specificComment) {
      closeCard();
      return;
    }

    closeCard();
    activeInputTarget = inputEl;
    currentVariation = 0;

    // Fetch Initial Config first so we know user preferences
    const config = await getConfig();
    currentTone = config.defaultTone || 'friendly';
    currentStance = config.defaultStance || 'positive';
    currentLanguage = config.replyLanguage || 'auto';
    const shouldIncludeCaption = config.includePostCaption !== false;

    // 1. Locate standard post container (feed post, photo modal, reels, etc.)
    const postContainer = shouldIncludeCaption ? findPostContainer(inputEl || triggerBtn) : null;
    let postAuthor = '';
    let postCaption = '';
    let postVisuals = { description: '', thumbnailUrl: '', mediaType: 'image' };

    if (postContainer) {
      const isReel = isReelContainer(postContainer);

      if (isReel) {
        const activeReel = findActiveReelContainer() || postContainer;
        postAuthor = extractReelAuthor(activeReel) || extractReelAuthor(postContainer);
        postCaption = extractReelCaption(activeReel, postAuthor) || extractReelCaption(postContainer, postAuthor);
        postVisuals = extractReelVisuals(activeReel, findActiveReelVideo());
      } else {
        postAuthor = extractPostAuthor(postContainer);
        postCaption = extractPostCaption(postContainer, postAuthor);
        postVisuals = extractPostVisuals(postContainer);
      }
    }

    // Direct page fallbacks for dedicated /p/, /reel/, and /reels/ routes
    if (window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/')) {
      if (!postVisuals.thumbnailUrl || !postVisuals.description || postVisuals.description === 'Instagram Reel video') {
        const canonicalVisuals = extractPostVisuals(postContainer || document.querySelector('main, article, div[role="main"]') || document.body);
        if (canonicalVisuals.thumbnailUrl && !postVisuals.thumbnailUrl) postVisuals.thumbnailUrl = canonicalVisuals.thumbnailUrl;
        if (canonicalVisuals.description && (!postVisuals.description || postVisuals.description === 'Instagram Reel video')) {
          postVisuals.description = canonicalVisuals.description;
        }
      }
      if (!postAuthor) {
        postAuthor = extractPostAuthor(postContainer || document.querySelector('main, article, div[role="main"]') || document.body);
      }
      if (!postCaption) {
        postCaption = extractPostCaption(postContainer || document.querySelector('main, article, div[role="main"]') || document.body, postAuthor);
      }
    }

    // 2. Scan author comments across the thread or comments drawer if caption is still missing
    if (!postCaption && postContainer && postAuthor) {
      const authorComments = extractAllAuthorComments(postContainer, postAuthor);
      if (authorComments.length > 0) {
        postCaption = authorComments.map((c, idx) => `[Author Comment #${idx + 1}]:\n${c}`).join('\n\n');
      }
    }

    const postId = extractPostIdentifier(postContainer, postAuthor, postCaption);

    // Extract Context
    let context;
    if (specificComment) {
      const rawDraft = getElementValue(inputEl).trim();
      let cleanDraft = rawDraft.replace(new RegExp(`^@${specificComment.author}\\s*`, 'i'), '').trim();
      if (/^@?[a-zA-Z0-9._]+$/.test(cleanDraft) && cleanDraft.toLowerCase() === specificComment.author.toLowerCase()) {
        cleanDraft = '';
      }
      const userDraftHint = cleanDraft;

      const rel = determineReplyRelationship({
        contextType: contextType || 'comment',
        isSpecificCommentReply: contextType !== 'dm',
        author: specificComment.author,
        postAuthor
      });

      context = {
        contextType: contextType || 'comment',
        postId,
        incomingText: specificComment.incomingText,
        author: specificComment.author,
        postCaption,
        postAuthor,
        postVisuals,
        ...rel,
        isSpecificCommentReply: contextType !== 'dm',
        userDraftHint
      };
    } else {
      context = extractContext(inputEl, contextType, postContainer);
      context.postId = postId || context.postId || extractPostIdentifier(postContainer, context.postAuthor, context.postCaption);
      if (!context.postCaption) context.postCaption = postCaption;
      if (!context.postAuthor) context.postAuthor = postAuthor;
      if (!context.postVisuals) context.postVisuals = postVisuals;

      const rel = determineReplyRelationship({
        contextType,
        isSpecificCommentReply: Boolean(context.isSpecificCommentReply),
        author: context.author,
        postAuthor: context.postAuthor
      });
      Object.assign(context, rel);
    }

    lastContextData = { ...context, contextType, postId: context.postId || postId };

    // Create & Position Card
    activeCard = createCardDOM(context);
    document.body.appendChild(activeCard);
    positionCard(activeCard, triggerBtn, inputEl);

    // Highlight initial tone chip, stance, and language
    setCardActiveTone(activeCard, currentTone);
    setCardActiveStance(activeCard, currentStance);
    setCardActiveLanguage(activeCard, currentLanguage);

    // Trigger AI Generation
    executeReplyGeneration();
  }

  /**
   * Extracts Context: Incoming comment / post caption / DM messages, and user's draft hint
   */
  function extractContext(inputEl, contextType, postContainer = null) {
    // Read user's existing draft text in the input
    const userDraftHint = getElementValue(inputEl).trim();

    let incomingText = '';
    let author = '';
    let postCaption = '';
    let postAuthor = '';
    let postVisuals = { description: '', thumbnailUrl: '', mediaType: 'image' };

    if (contextType === 'comment') {
      const article = postContainer || findPostContainer(inputEl);
      if (article) {
        const isReel = isReelContainer(article);

        if (isReel) {
          const activeReel = findActiveReelContainer() || article;
          postAuthor = extractReelAuthor(activeReel) || extractPostAuthor(article);
          postCaption = extractReelCaption(activeReel, postAuthor) || extractPostCaption(article, postAuthor);
          postVisuals = extractReelVisuals(activeReel, findActiveReelVideo());
        } else {
          postAuthor = extractPostAuthor(article);
          postCaption = extractPostCaption(article, postAuthor);
          postVisuals = extractPostVisuals(article);
        }
      }

      // Also fallback to canonical page metadata on dedicated post/reel routes
      if (window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/')) {
        if (!postVisuals.thumbnailUrl || !postVisuals.description || postVisuals.description === 'Instagram Reel video') {
          const canonicalVisuals = extractPostVisuals(article || document.querySelector('main, article, div[role="main"]') || document.body);
          if (canonicalVisuals.thumbnailUrl && !postVisuals.thumbnailUrl) postVisuals.thumbnailUrl = canonicalVisuals.thumbnailUrl;
          if (canonicalVisuals.description && (!postVisuals.description || postVisuals.description === 'Instagram Reel video')) {
            postVisuals.description = canonicalVisuals.description;
          }
        }
        if (!postAuthor) {
          postAuthor = extractPostAuthor(article || document.querySelector('main, article, div[role="main"]') || document.body);
        }
        if (!postCaption) {
          postCaption = extractPostCaption(article || document.querySelector('main, article, div[role="main"]') || document.body, postAuthor);
        }
      }

      // 1. Check if there is an author tagged in the input (e.g., "@username hello")
      const mentionMatch = userDraftHint.match(/^@([a-zA-Z0-9._]+)/);
      if (mentionMatch) {
        author = mentionMatch[1];
      }

      // 2. Check for Instagram's reply banner near the form: e.g. "Replying to @username"
      if (!author && article) {
        const allTextEls = article.querySelectorAll('div, span');
        for (const el of allTextEls) {
          const txt = el.textContent?.trim() || '';
          const match = txt.match(/^Replying to\s+@?([a-zA-Z0-9._]+)/i);
          if (match) {
            author = match[1];
            break;
          }
        }
      }

      // 3. Resolve specific comment text from either searching article or recently cached active comment
      const currentPostId = extractPostIdentifier(article);
      if (author) {
        const found = findCommentByAuthor(article, author);
        if (found && found.incomingText) {
          incomingText = found.incomingText;
          author = found.author;
        }
      } else if (
        lastActiveCommentContext &&
        lastActiveCommentContext.incomingText &&
        lastActiveCommentContext.commentItem &&
        document.contains(lastActiveCommentContext.commentItem) &&
        (!lastActiveCommentContext.postId || !currentPostId || lastActiveCommentContext.postId === currentPostId) &&
        (Date.now() - lastActiveCommentContext.timestamp < 45000)
      ) {
        // If no @mention was in the box, but user recently clicked "Reply" on a comment in THIS post
        author = lastActiveCommentContext.author;
        incomingText = lastActiveCommentContext.incomingText;
      }

      // Fallback: If author still not found, check post author
      if (!author) {
        author = postAuthor;
      }

      if (!incomingText) {
        incomingText = '';
      }
    } else if (contextType === 'dm') {
      // Find DM conversation thread container for this input (PIP floating window or fullscreen direct)
      const chatContainer = findChatContainerForElement(inputEl) || document.body;
      const messageBubbles = chatContainer.querySelectorAll('div[dir="auto"]');

      // Grab the last few incoming messages
      const recentMessages = [];
      for (let i = messageBubbles.length - 1; i >= 0 && recentMessages.length < 3; i--) {
        const bubble = messageBubbles[i];
        if (isOutgoingDmBubble(bubble)) continue;
        const text = bubble.innerText?.trim();
        // Ignore the input's own content, UI metadata, or trivial text
        if (text && text !== userDraftHint && text.length > 1 && !isCommentMetadata(text)) {
          recentMessages.unshift(text);
        }
      }

      incomingText = recentMessages.join('\n');

      // Attempt to extract chat partner name from header of this chat container
      const chatHeader = chatContainer.querySelector('header, .ig-post-header') ||
                         chatContainer.querySelector('h1, h2, h3') ||
                         chatContainer.querySelector('a[role="link"]');
      if (chatHeader) {
        const nameEl = chatHeader.querySelector('strong, h1, h2, h3, span[dir="auto"]');
        if (nameEl) {
          author = nameEl.innerText?.trim().replace(/^@/, '') || '';
        } else {
          author = chatHeader.innerText?.trim().split('\n')[0].replace(/^@/, '') || '';
        }
      }
    }

    // Clean userDraftHint by removing leading @author mention or bare handle
    let cleanHint = userDraftHint;
    if (author) {
      cleanHint = cleanHint.replace(new RegExp(`^@${author}\\s*`, 'i'), '').trim();
    }
    if (/^@?[a-zA-Z0-9._]+$/.test(cleanHint) && author && cleanHint.toLowerCase() === author.toLowerCase()) {
      cleanHint = '';
    }

    const isReplyingToComment = Boolean(incomingText && author);

    return {
      incomingText,
      author,
      postCaption,
      postAuthor,
      postVisuals,
      isSpecificCommentReply: isReplyingToComment,
      userDraftHint: cleanHint
    };
  }

  /**
   * Main generator execution: sends message to service worker
   */
  async function executeReplyGeneration() {
    if (!activeCard) return;

    const thisGenId = ++currentGenerationId;

    const payload = {
      contextType: lastContextData.contextType,
      replyMode: lastContextData.replyMode || 'post_comment',
      isCurrentUserPostAuthor: Boolean(lastContextData.isCurrentUserPostAuthor),
      relationshipSummary: lastContextData.relationshipSummary || '',
      incomingText: lastContextData.incomingText || '',
      postCaption: lastContextData.postCaption || '',
      postAuthor: lastContextData.postAuthor || '',
      postVisuals: lastContextData.postVisuals || { description: '', thumbnailUrl: '', mediaType: 'image' },
      author: lastContextData.author || '',
      isSpecificCommentReply: Boolean(lastContextData.isSpecificCommentReply),
      userDraftHint: lastContextData.userDraftHint || '',
      stance: currentStance,
      tone: currentTone,
      variationIndex: currentVariation
    };

    const cacheKey = getReplyCacheKey(
      lastContextData.postId,
      lastContextData.postAuthor,
      lastContextData.author,
      lastContextData.incomingText,
      currentStance,
      currentTone,
      currentLanguage
    );

    // 1. Instant Cache Hit: Return cached reply immediately without spinner flash if user hasn't asked for a new variation or custom draft
    if (currentVariation === 0 && !lastContextData.userDraftHint && replyCache.has(cacheKey)) {
      const cached = replyCache.get(cacheKey);
      console.log(`[InstaReply AI] ⚡ Instant reply served from cache for @${lastContextData.author} (${currentStance} / ${currentTone})`);
      renderAIResult(cached, true);
      schedulePrefetchForAlternativeStances();
      schedulePrefetchForVisibleComments();
      return;
    }

    // 2. In-Flight Bundling Reuse: If an active primary request is already computing that bundles this requested tone, wait on it instead of duplicating network call
    if (
      currentVariation === 0 &&
      !lastContextData.userDraftHint &&
      activeGenerationContext &&
      activeGenerationContext.postId === lastContextData.postId &&
      activeGenerationContext.author === lastContextData.author &&
      activeGenerationContext.stance === currentStance &&
      activeGenerationContext.bundledTones.includes(currentTone.toLowerCase())
    ) {
      console.log(`[InstaReply AI] ⏳ Waiting on in-flight bundled generation for '${currentTone}'...`);
      showCardLoading(activeCard, true);
      await activeGenerationContext.promise.catch(() => null);

      if (thisGenId !== currentGenerationId) return;

      if (replyCache.has(cacheKey)) {
        const cached = replyCache.get(cacheKey);
        renderAIResult(cached, true);
        schedulePrefetchForAlternativeStances();
        schedulePrefetchForVisibleComments();
        return;
      }
    }

    showCardLoading(activeCard, true);

    try {
      const config = await getConfig();
      payload.replyLanguage = currentLanguage || config.replyLanguage || 'auto';

      // Check if user chose Edge AI (Prompt API)
      if (config.provider === 'edge_ai') {
        await generateViaEdgeAI(payload, cacheKey, thisGenId);
        return;
      }

      const bundledCandidates = ['friendly', 'humorous', 'playful', 'savage', 'concise'];
      const currentBundled = bundledCandidates.filter(t => t !== currentTone.toLowerCase());

      const requestPromise = chrome.runtime.sendMessage({
        action: 'GENERATE_REPLY',
        payload
      });

      if (currentVariation === 0 && !lastContextData.userDraftHint) {
        activeGenerationContext = {
          promise: requestPromise,
          postId: lastContextData.postId,
          author: lastContextData.author,
          stance: currentStance,
          bundledTones: currentBundled
        };
      }

      const response = await requestPromise;

      if (activeGenerationContext && activeGenerationContext.promise === requestPromise) {
        activeGenerationContext = null;
      }

      if (response && response.success) {
        if (!lastContextData.userDraftHint) {
          setReplyCacheEntry(cacheKey, response);

          // Ingest any bundled alternative tone drafts into cache for instant switching
          if (response.toneDrafts && typeof response.toneDrafts === 'object') {
            for (const [altTone, altReply] of Object.entries(response.toneDrafts)) {
              if (!altReply || typeof altReply !== 'string' || !altReply.trim()) continue;
              const altKey = getReplyCacheKey(
                lastContextData.postId,
                lastContextData.postAuthor,
                lastContextData.author,
                lastContextData.incomingText,
                currentStance,
                altTone,
                payload.replyLanguage || currentLanguage
              );
              if (!replyCache.has(altKey)) {
                setReplyCacheEntry(altKey, {
                  ...response,
                  reply: altReply.trim(),
                  toneUsed: altTone
                });
                console.log(`[InstaReply AI] ⚡ Pre-cached bundled tone '${altTone}' for instant switching`);
              }
            }
          }
        }

        // Stale check: Discard rendering if a newer user click arrived while waiting
        if (thisGenId !== currentGenerationId) {
          console.log(`[InstaReply AI] Discarding outdated generation response (#${thisGenId} vs current #${currentGenerationId})`);
          return;
        }

        renderAIResult(response, false);
        schedulePrefetchForAlternativeStances();
        schedulePrefetchForVisibleComments();
      } else {
        if (thisGenId !== currentGenerationId) return;
        renderAIError(response?.error || 'Failed to generate reply. Check your API settings.');
      }
    } catch (err) {
      if (thisGenId !== currentGenerationId) return;
      renderAIError(err.message || 'Error communicating with AI service.');
    } finally {
      if (activeGenerationContext && activeGenerationContext.promise === requestPromise) {
        activeGenerationContext = null;
      }
    }
  }

  /**
   * Edge AI on-device generation via Main World Bridge (Prompt API / Gemini Nano)
   */
  async function generateViaEdgeAI(payload, cacheKey, genId) {
    ensurePageBridgeInjected();
    const requestId = 'edge_ai_' + Math.random().toString(36).substring(2, 10);

    return new Promise((resolve) => {
      let timeoutId = setTimeout(() => {
        window.removeEventListener('message', handleBridgeResponse);
        if (!genId || genId === currentGenerationId) {
          renderAIError('Edge AI request timed out. Chrome Prompt API may not be enabled (visit chrome://flags/#prompt-api-for-gemini-nano) or model is still downloading.');
        }
        resolve();
      }, 12000);

      function handleBridgeResponse(event) {
        if (
          event.source !== window ||
          !event.data ||
          event.data.type !== 'INSTAREPLY_PROMPT_API_RESPONSE' ||
          event.data.requestId !== requestId
        ) {
          return;
        }

        clearTimeout(timeoutId);
        window.removeEventListener('message', handleBridgeResponse);

        if (event.data.success) {
          if (cacheKey && !lastContextData?.userDraftHint) {
            setReplyCacheEntry(cacheKey, event.data);

            if (event.data.toneDrafts && typeof event.data.toneDrafts === 'object') {
              for (const [altTone, altReply] of Object.entries(event.data.toneDrafts)) {
                if (!altReply || typeof altReply !== 'string' || !altReply.trim()) continue;
                const altKey = getReplyCacheKey(
                  lastContextData.postId,
                  lastContextData.postAuthor,
                  lastContextData.author,
                  lastContextData.incomingText,
                  currentStance,
                  altTone,
                  currentLanguage
                );
                if (!replyCache.has(altKey)) {
                  setReplyCacheEntry(altKey, {
                    ...event.data,
                    reply: altReply.trim(),
                    toneUsed: altTone
                  });
                }
              }
            }
          }
          if (!genId || genId === currentGenerationId) {
            renderAIResult(event.data, false);
            schedulePrefetchForAlternativeStances();
            schedulePrefetchForVisibleComments();
          }
        } else {
          if (!genId || genId === currentGenerationId) {
            renderAIError(event.data.error || 'Edge AI generation failed.');
          }
        }
        resolve();
      }

      window.addEventListener('message', handleBridgeResponse);

      // Post message to page bridge in main world
      window.postMessage({
        type: 'INSTAREPLY_RUN_PROMPT_API',
        requestId,
        payload
      }, '*');
    });
  }

  /**
   * Proactively pre-fetches alternative reply stances (neutral, negative/firm)
   * and their bundled tone styles for the current comment/post concurrently in the background.
   * This enables instantaneous (0ms) stance & tone toggling without spinners.
   */
  function schedulePrefetchForAlternativeStances() {
    clearTimeout(stancePrefetchTimer);
    if (!lastContextData || lastContextData.userDraftHint) return;

    // Freeze current context parameters
    const snapshot = { ...lastContextData };
    const baseTone = currentTone;
    const baseStance = currentStance;
    const baseLang = currentLanguage;

    stancePrefetchTimer = setTimeout(async () => {
      try {
        const allStances = ['positive', 'neutral', 'negative'];
        const remainingStances = allStances.filter(s => s !== baseStance);

        await Promise.all(remainingStances.map(async (altStance) => {
          // If user moved to another comment/post during warmup, abort
          if (!lastContextData || lastContextData.postId !== snapshot.postId || lastContextData.author !== snapshot.author) {
            return;
          }

          const altKey = getReplyCacheKey(
            snapshot.postId,
            snapshot.postAuthor,
            snapshot.author,
            snapshot.incomingText,
            altStance,
            baseTone,
            baseLang
          );
          if (replyCache.has(altKey)) return;

          const prefetchPayload = {
            contextType: snapshot.contextType || 'comment',
            replyMode: snapshot.replyMode || 'comment_reply',
            isCurrentUserPostAuthor: Boolean(snapshot.isCurrentUserPostAuthor),
            relationshipSummary: snapshot.relationshipSummary || '',
            incomingText: snapshot.incomingText || '',
            postCaption: snapshot.postCaption || '',
            postAuthor: snapshot.postAuthor || '',
            postVisuals: snapshot.postVisuals || null,
            author: snapshot.author || '',
            isSpecificCommentReply: Boolean(snapshot.isSpecificCommentReply),
            userDraftHint: '',
            stance: altStance,
            tone: baseTone,
            variationIndex: 0,
            replyLanguage: baseLang
          };

          const res = await chrome.runtime.sendMessage({
            action: 'GENERATE_REPLY',
            payload: prefetchPayload
          }).catch(() => null);

          if (res && res.success) {
            setReplyCacheEntry(altKey, res);

            // Ingest any bundled tone drafts for this stance as well
            if (res.toneDrafts && typeof res.toneDrafts === 'object') {
              for (const [bundledTone, bundledReply] of Object.entries(res.toneDrafts)) {
                if (!bundledReply || typeof bundledReply !== 'string' || !bundledReply.trim()) continue;
                const bundledKey = getReplyCacheKey(
                  snapshot.postId,
                  snapshot.postAuthor,
                  snapshot.author,
                  snapshot.incomingText,
                  altStance,
                  bundledTone,
                  baseLang
                );
                if (!replyCache.has(bundledKey)) {
                  setReplyCacheEntry(bundledKey, {
                    ...res,
                    reply: bundledReply.trim(),
                    toneUsed: bundledTone
                  });
                }
              }
            }
            console.log(`[InstaReply AI] ⚡ Pre-cached stance '${altStance}' + tone drafts for @${snapshot.author}`);
          }
        }));
      } catch (err) {
        console.debug('[InstaReply AI] Stance prefetch skipped:', err);
      }
    }, 350);
  }

  /**
   * Proactively pre-fetches suggested replies for other visible comments in the thread
   * so that when the creator moves to reply to the next comment, it loads instantly.
   */
  function schedulePrefetchForVisibleComments() {
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(async () => {
      try {
        if (!lastContextData || !lastContextData.postAuthor) return;

        // Check if there is an active comments container (drawer or feed post)
        const commentsContainer = (activeInputTarget ? findPostContainer(activeInputTarget) : null) ||
                                  document.querySelector('div[role="dialog"]');
        if (!commentsContainer) return;

        const commentItems = commentsContainer.querySelectorAll('.ig-comment, li, ul > div');
        const queue = [];

        for (const item of commentItems) {
          if (queue.length >= 3) break;
          if (
            item.closest('.instareply-card-overlay') ||
            item.closest('form') ||
            item.closest('header')
          ) {
            continue;
          }

          const authorEl = item.querySelector('a[href*="/"] strong, a[href*="/"] span, a[role="link"], strong');
          if (!authorEl) continue;
          const author = authorEl.textContent.trim().replace(/^@/, '');
          if (!author || author === lastContextData.postAuthor || author === lastContextData.author) continue;

          const commentText = extractCommentTextFromContainer(item, author);
          if (!commentText || commentText.length < 2 || isCommentMetadata(commentText, author)) continue;

          const key = getReplyCacheKey(lastContextData.postId, lastContextData.postAuthor, author, commentText, currentStance, currentTone, currentLanguage);
          if (!replyCache.has(key)) {
            queue.push({ author, commentText, key });
          }
        }

        if (queue.length === 0) return;

        console.log(`[InstaReply AI] ⚡ Background predictive pre-fetching for ${queue.length} visible comments...`);

        for (const item of queue) {
          const prefetchPayload = {
            contextType: 'comment',
            replyMode: 'comment_reply',
            isCurrentUserPostAuthor: Boolean(lastContextData.isCurrentUserPostAuthor),
            relationshipSummary: `Replying to @${item.author}'s comment`,
            incomingText: item.commentText,
            postCaption: lastContextData.postCaption || '',
            postAuthor: lastContextData.postAuthor || '',
            postVisuals: lastContextData.postVisuals || null,
            author: item.author,
            isSpecificCommentReply: true,
            userDraftHint: '',
            stance: currentStance,
            tone: currentTone,
            variationIndex: 0,
            replyLanguage: currentLanguage
          };

          chrome.runtime.sendMessage({
            action: 'GENERATE_REPLY',
            payload: prefetchPayload
          }).then(res => {
            if (res && res.success) {
              setReplyCacheEntry(item.key, res);

              // Ingest bundled tone drafts for visible comments as well
              if (res.toneDrafts && typeof res.toneDrafts === 'object') {
                for (const [bundledTone, bundledReply] of Object.entries(res.toneDrafts)) {
                  if (!bundledReply || typeof bundledReply !== 'string' || !bundledReply.trim()) continue;
                  const bundledKey = getReplyCacheKey(
                    lastContextData.postId,
                    lastContextData.postAuthor,
                    item.author,
                    item.commentText,
                    currentStance,
                    bundledTone,
                    currentLanguage
                  );
                  if (!replyCache.has(bundledKey)) {
                    setReplyCacheEntry(bundledKey, {
                      ...res,
                      reply: bundledReply.trim(),
                      toneUsed: bundledTone
                    });
                  }
                }
              }
              console.log(`[InstaReply AI] ⚡ Pre-cached instant reply + tone drafts for @${item.author}`);
            }
          }).catch(() => {});
        }
      } catch (err) {
        console.debug('[InstaReply AI] Background prefetch skipped:', err);
      }
    }, 450);
  }

  /**
   * Renders AI response details: Sentiment pill, Topics, and Reply textarea
   */
  function renderAIResult(data, isFromCache = false) {
    if (!activeCard) return;

    showCardLoading(activeCard, false);

    const insightBar = activeCard.querySelector('.instareply-insight-bar');
    const outputArea = activeCard.querySelector('.instareply-output-textarea');
    const errorContainer = activeCard.querySelector('.instareply-error-container');
    const modelBadge = activeCard.querySelector('.instareply-model-badge');

    if (errorContainer) errorContainer.classList.add('hidden');
    if (outputArea) {
      outputArea.classList.remove('hidden');
      outputArea.value = data.reply || '';
      outputArea.focus();
    }

    if (modelBadge) {
      let baseModel = data.modelUsed || 'AI Assistant';
      // Beautify long model names for badge display
      baseModel = baseModel
        .replace('meta-llama/llama-3.3-70b-instruct:free', 'Llama 3.3 70B')
        .replace('meta-llama/llama-3.1-8b-instruct:free', 'Llama 3.1 8B')
        .replace('llama-3.3-70b-versatile', 'Llama 3.3 70B')
        .replace('llama-3.1-8b-instant', 'Llama 3.1 8B')
        .replace('deepseek/deepseek-r1:free', 'DeepSeek R1')
        .replace('qwen/qwen-2.5-72b-instruct:free', 'Qwen 2.5 72B')
        .replace('mistralai/mistral-7b-instruct:free', 'Mistral 7B')
        .replace(':free', '');
      modelBadge.innerHTML = isFromCache ? `${baseModel} &bull; <span style="color: #34d399; font-weight: 600;">⚡ Instant</span>` : baseModel;
    }

    // Sentiment Pill
    let sentimentClass = 'positive';
    if (data.sentiment === 'question') sentimentClass = 'question';
    if (data.sentiment === 'negative' || data.sentiment === 'complaint') sentimentClass = 'negative';

    let pillsHTML = `
      <span class="instareply-sentiment-pill ${sentimentClass}">
        ${data.sentimentLabel || '✨ Analyzed'}
      </span>
      ${isFromCache ? `<span class="instareply-sentiment-pill" style="background: rgba(16, 185, 129, 0.15); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.3);" title="Loaded instantly from predictive reply cache">⚡ Instant Cache</span>` : ''}
    `;

    // Key Topics
    if (data.topics && data.topics.length > 0) {
      pillsHTML += data.topics.map(t => `<span class="instareply-topic-tag">#${escapeHTML(t)}</span>`).join('');
    }

    if (insightBar) {
      insightBar.innerHTML = pillsHTML;
    }

    // Update or dynamically insert AI Visual Analysis ("What does the AI see in this post")
    const isGenericFallback = !data.visualAnalysis ||
      /no visual provided|no image provided|assuming a high-quality|lacks visual details/i.test(data.visualAnalysis);

    if (data.visualAnalysis && !isGenericFallback) {
      const visionTextEl = activeCard.querySelector('.instareply-vision-text');
      if (visionTextEl) {
        visionTextEl.textContent = `"${data.visualAnalysis}"`;
      } else {
        const cardBody = activeCard.querySelector('.instareply-card-body');
        const insightBarEl = activeCard.querySelector('.instareply-insight-bar');
        if (cardBody) {
          const banner = document.createElement('div');
          banner.className = 'instareply-context-banner instareply-visual-banner';
          banner.title = 'Post Image & AI Vision Analysis';
          banner.innerHTML = `
            ${lastContextData?.postVisuals?.thumbnailUrl ? `
              <img src="${escapeHTML(lastContextData.postVisuals.thumbnailUrl)}" class="instareply-visual-thumb" alt="Post thumbnail">
            ` : `<span class="instareply-banner-icon">👁️</span>`}
            <div class="instareply-context-text">
              <strong style="color: #a78bfa;">👁️ AI Vision:</strong> <span class="instareply-vision-text">"${escapeHTML(data.visualAnalysis)}"</span>
            </div>
            <button type="button" class="instareply-unbind-btn" id="instareply-unbind-visual" title="Unbind image context">&times;</button>
          `;
          if (insightBarEl && insightBarEl.nextSibling) {
            cardBody.insertBefore(banner, insightBarEl.nextSibling);
          } else {
            cardBody.prepend(banner);
          }
          setupUnbindButtons(activeCard);
        }
      }
    } else {
      const existingBanner = activeCard.querySelector('.instareply-visual-banner');
      if (existingBanner) existingBanner.remove();
    }
  }

  /**
   * Renders Error banner in the card
   */
  function renderAIError(errorMessage) {
    if (!activeCard) return;

    showCardLoading(activeCard, false);

    const insightBar = activeCard.querySelector('.instareply-insight-bar');
    const errorContainer = activeCard.querySelector('.instareply-error-container');
    const outputArea = activeCard.querySelector('.instareply-output-textarea');

    if (insightBar) {
      insightBar.innerHTML = `<span class="instareply-sentiment-pill negative">⚠️ Generation Error</span>`;
    }

    if (outputArea) {
      outputArea.classList.add('hidden');
    }

    if (errorContainer) {
      errorContainer.classList.remove('hidden');
      errorContainer.innerHTML = `
        <div class="instareply-error-banner">
          ⚠️ <strong>Notice:</strong> ${escapeHTML(errorMessage)}
          <div style="margin-top: 6px; font-size: 11px; color: #e5e7eb;">
            💡 Open the <strong>InstaReply AI</strong> icon in your Chrome toolbar to verify your API Key and Model settings.
          </div>
        </div>
      `;
    }
  }

  /**
   * Sets up or refreshes event listeners on context unbind buttons (visual, post caption, comment target)
   */
  function setupUnbindButtons(card) {
    if (!card) return;

    // Unbind Visual Context button
    const unbindVisualBtn = card.querySelector('#instareply-unbind-visual');
    if (unbindVisualBtn && !unbindVisualBtn._hasClickListener) {
      unbindVisualBtn._hasClickListener = true;
      unbindVisualBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (lastContextData) {
          lastContextData.postVisuals = { description: '', thumbnailUrl: '', mediaType: 'image' };
        }
        const banner = unbindVisualBtn.closest('.instareply-context-banner');
        if (banner) {
          banner.style.opacity = '0';
          banner.style.transform = 'translateY(-4px)';
          setTimeout(() => banner.remove(), 180);
        }
        currentVariation = 0;
        executeReplyGeneration();
      });
    }

    // Unbind Post Context button
    const unbindPostBtn = card.querySelector('#instareply-unbind-post');
    if (unbindPostBtn && !unbindPostBtn._hasClickListener) {
      unbindPostBtn._hasClickListener = true;
      unbindPostBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (lastContextData) {
          lastContextData.postCaption = '';
          lastContextData.postAuthor = '';
          lastContextData.postId = 'unbound_' + Date.now();
        }
        const banner = unbindPostBtn.closest('.instareply-context-banner');
        if (banner) {
          banner.style.opacity = '0';
          banner.style.transform = 'translateY(-4px)';
          setTimeout(() => banner.remove(), 180);
        }
        currentVariation = 0;
        executeReplyGeneration();
      });
    }

    // Unbind Comment Context button
    const unbindCommentBtn = card.querySelector('#instareply-unbind-comment');
    if (unbindCommentBtn && !unbindCommentBtn._hasClickListener) {
      unbindCommentBtn._hasClickListener = true;
      unbindCommentBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (lastContextData) {
          lastContextData.incomingText = '';
          lastContextData.author = '';
          lastContextData.isSpecificCommentReply = false;
        }
        const banner = unbindCommentBtn.closest('.instareply-context-banner');
        if (banner) {
          banner.style.opacity = '0';
          banner.style.transform = 'translateY(-4px)';
          setTimeout(() => banner.remove(), 180);
        }
        currentVariation = 0;
        executeReplyGeneration();
      });
    }
  }

  /**
   * Constructs the Floating AI Card DOM
   */
  function createCardDOM(context) {
    const card = document.createElement('div');
    card.className = 'instareply-card-overlay';

    const hasHint = Boolean(context.userDraftHint);

    card.innerHTML = `
      <div class="instareply-card-header">
        <div class="instareply-header-left">
          <span class="instareply-title">InstaReply AI</span>
          <span class="instareply-model-badge">AI Assistant</span>
        </div>
        <button type="button" class="instareply-close-btn" title="Close">&times;</button>
      </div>

      <div class="instareply-card-body">
        <!-- Interaction Role & Relationship Badge -->
        ${context.relationshipSummary ? `
          <div class="instareply-relationship-badge ${context.replyMode === 'comment_reply' ? 'is-comment-reply' : 'is-post-comment'}">
            <span>${context.replyMode === 'comment_reply' ? '💬' : (context.contextType === 'dm' ? '✉️' : '📝')}</span>
            <span>${escapeHTML(context.relationshipSummary)}</span>
          </div>
        ` : ''}

        <!-- Sentiment & Key Topics Bar -->
        <div class="instareply-insight-bar">
          <span class="instareply-sentiment-pill">🔍 Analyzing sentiment...</span>
        </div>

        <!-- Detected Image/Video Visual Context Banner -->
        ${(context.postVisuals?.thumbnailUrl || context.postVisuals?.description) ? `
          <div class="instareply-context-banner instareply-visual-banner" title="Post Image & AI Vision Analysis">
            ${context.postVisuals.thumbnailUrl ? `
              <img src="${escapeHTML(context.postVisuals.thumbnailUrl)}" class="instareply-visual-thumb" alt="Post thumbnail">
            ` : `<span class="instareply-banner-icon">👁️</span>`}
            <div class="instareply-context-text">
              <strong style="color: #a78bfa;">👁️ AI Vision:</strong> <span class="instareply-vision-text">${context.postVisuals.description ? `"${escapeHTML(context.postVisuals.description)}"` : 'Analyzing post visual content...'}</span>
            </div>
            <button type="button" class="instareply-unbind-btn" id="instareply-unbind-visual" title="Unbind image context">&times;</button>
          </div>
        ` : ''}

        <!-- Post Caption Banner -->
        ${context.postCaption ? `
          <div class="instareply-context-banner instareply-post-banner" title="Referenced Post Caption">
            <span class="instareply-banner-icon">📌</span>
            <div class="instareply-context-text">
              <strong>Post:</strong> "${escapeHTML(context.postCaption)}"
            </div>
            <button type="button" class="instareply-unbind-btn" id="instareply-unbind-post" title="Unbind / Remove post context">&times;</button>
          </div>
        ` : ''}

        <!-- Specific Comment / DM Message Target Banner (if different from caption) -->
        ${context.incomingText && context.incomingText !== context.postCaption ? `
          <div class="instareply-context-banner instareply-comment-banner" style="border-left-color: ${context.contextType === 'dm' ? '#8b5cf6' : '#ec4899'}; background: ${context.contextType === 'dm' ? 'rgba(139, 92, 246, 0.08)' : 'rgba(236, 72, 153, 0.08)'}; color: ${context.contextType === 'dm' ? '#ddd6fe' : '#fbcfe8'};" title="${context.contextType === 'dm' ? 'Replying to DM Message' : 'Replying to Comment'}">
            <span class="instareply-banner-icon">${context.contextType === 'dm' ? '✉️' : '💬'}</span>
            <div class="instareply-context-text">
              <strong>${context.author ? `@${escapeHTML(context.author)}` : (context.contextType === 'dm' ? 'Incoming Message' : 'Replying')}:</strong> "${escapeHTML(context.incomingText)}"
            </div>
            <button type="button" class="instareply-unbind-btn" id="instareply-unbind-comment" title="Unbind / Remove message context">&times;</button>
          </div>
        ` : ''}

        <!-- User Draft Hint Banner -->
        ${hasHint ? `
          <div class="instareply-hint-banner">
            <span>💡</span>
            <div><strong>Using Draft Hint:</strong> "${escapeHTML(context.userDraftHint)}"</div>
          </div>
        ` : ''}

        <!-- Reply Stance (Positive / Neutral / Negative) -->
        <div class="instareply-stance-wrapper">
          <div class="instareply-control-header">
            <span class="instareply-control-label">Reply Stance</span>
            <span class="instareply-stance-hint" id="instareply-stance-hint">Encouraging & warm</span>
          </div>
          <div class="instareply-stance-row">
            <button type="button" class="instareply-stance-btn" data-stance="positive" title="Positive: Warm, supportive, agreeable">
              🟢 Positive
            </button>
            <button type="button" class="instareply-stance-btn" data-stance="neutral" title="Neutral: Balanced, factual, objective">
              ⚪ Neutral
            </button>
            <button type="button" class="instareply-stance-btn" data-stance="negative" title="Negative: Disagree, decline, or set firm boundaries">
              🔴 Negative
            </button>
          </div>
        </div>

        <!-- Tone Chips -->
        <div class="instareply-tones-wrapper">
          <div class="instareply-control-header">
            <span class="instareply-control-label">Tone Style</span>
          </div>
          <div class="instareply-tones-row">
            <button type="button" class="instareply-tone-chip" data-tone="friendly" title="Friendly & Casual">😊 Friendly</button>
            <button type="button" class="instareply-tone-chip" data-tone="humorous" title="Witty & Funny">😄 Funny</button>
            <button type="button" class="instareply-tone-chip" data-tone="playful" title="Playful & Naughty / Cheeky">😈 Playful</button>
            <button type="button" class="instareply-tone-chip" data-tone="savage" title="Savage & Roast / Sarcastic Clapback">😏 Savage</button>
            <button type="button" class="instareply-tone-chip" data-tone="geek" title="Geek & Tech / Nerd Culture">🤓 Geek</button>
            <button type="button" class="instareply-tone-chip" data-tone="spicy" title="Spicy & Flirty / Charismatic">🌶️ Spicy</button>
            <button type="button" class="instareply-tone-chip" data-tone="enthusiastic" title="Enthusiastic & Hyped">🔥 Hyped</button>
            <button type="button" class="instareply-tone-chip" data-tone="professional" title="Professional & Polished">💼 Professional</button>
            <button type="button" class="instareply-tone-chip" data-tone="empathetic" title="Empathetic & Caring">❤️ Empathetic</button>
            <button type="button" class="instareply-tone-chip" data-tone="concise" title="Short & Punchy">⚡ Short</button>
          </div>
        </div>

        <!-- Reply Language Preference -->
        <div class="instareply-lang-wrapper">
          <div class="instareply-control-header">
            <span class="instareply-control-label">Reply Language</span>
            <span class="instareply-lang-hint" id="instareply-lang-hint">Auto (Match Context)</span>
          </div>
          <div class="instareply-lang-row">
            <select class="instareply-lang-select" id="instareply-card-lang" title="Reply language preference">
              <option value="auto">🌐 Match Context Language (Auto-Detect)</option>
              <option value="en">🇺🇸 English</option>
              <option value="ja">🇯🇵 Japanese (日本語)</option>
              <option value="zh-TW">🇹🇼 Traditional Chinese (繁體中文)</option>
              <option value="zh-CN">🇨🇳 Simplified Chinese (简体中文)</option>
              <option value="es">🇪🇸 Spanish (Español)</option>
              <option value="fr">🇫🇷 French (Français)</option>
              <option value="de">🇩🇪 German (Deutsch)</option>
              <option value="ko">🇰🇷 Korean (한국어)</option>
              <option value="pt">🇧🇷 Portuguese (Português)</option>
              <option value="it">🇮🇹 Italian (Italiano)</option>
            </select>
          </div>
        </div>

        <!-- Textarea & Loading State -->
        <div class="instareply-output-wrapper">
          <div class="instareply-loading-container hidden">
            <div class="instareply-pulse-ring"></div>
            <span class="instareply-loading-text">Analyzing & drafting with AI...</span>
          </div>
          <div class="instareply-error-container hidden"></div>
          <textarea class="instareply-output-textarea" placeholder="Drafting reply..."></textarea>
        </div>
      </div>

      <div class="instareply-card-footer">
        <div class="instareply-footer-left">
          <button type="button" class="instareply-btn instareply-btn-regen" title="Generate another reply variation">
            🔄 Regen
          </button>
          <button type="button" class="instareply-btn instareply-btn-copy" title="Copy to clipboard">
            📋 Copy
          </button>
        </div>
        <button type="button" class="instareply-btn instareply-btn-insert" title="Insert directly into Instagram reply box">
          Insert Reply ↵
        </button>
      </div>
    `;

    // Setup unbind context buttons
    setupUnbindButtons(card);

    // Stance button clicks
    card.querySelectorAll('.instareply-stance-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const nextStance = btn.dataset.stance;
        if (currentStance === nextStance) return;
        currentStance = nextStance;
        setCardActiveStance(card, currentStance);
        currentVariation = 0;
        executeReplyGeneration();
      });
    });

    // Tone chip clicks
    card.querySelectorAll('.instareply-tone-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        if (currentTone === chip.dataset.tone) return;
        currentTone = chip.dataset.tone;
        setCardActiveTone(card, currentTone);
        currentVariation = 0;
        executeReplyGeneration();
      });
    });

    // Language select change
    const langSelect = card.querySelector('#instareply-card-lang');
    if (langSelect) {
      langSelect.value = currentLanguage;
      setCardActiveLanguage(card, currentLanguage);
      langSelect.addEventListener('change', () => {
        const nextLang = langSelect.value;
        if (currentLanguage === nextLang) return;
        currentLanguage = nextLang;
        setCardActiveLanguage(card, currentLanguage);
        try {
          chrome.storage?.sync?.set({ replyLanguage: currentLanguage });
        } catch (_) {}
        currentVariation = 0;
        executeReplyGeneration();
      });
    }

    // Regen button
    card.querySelector('.instareply-btn-regen').addEventListener('click', () => {
      currentVariation += 1;
      executeReplyGeneration();
    });

    // Copy button
    const copyBtn = card.querySelector('.instareply-btn-copy');
    copyBtn.addEventListener('click', () => {
      const text = card.querySelector('.instareply-output-textarea')?.value || '';
      if (text) {
        navigator.clipboard.writeText(text);
        const originalText = copyBtn.innerHTML;
        copyBtn.innerHTML = '✓ Copied!';
        setTimeout(() => { copyBtn.innerHTML = originalText; }, 1800);
      }
    });

    // Insert button
    card.querySelector('.instareply-btn-insert').addEventListener('click', () => {
      const text = card.querySelector('.instareply-output-textarea')?.value || '';
      if (text && activeInputTarget) {
        insertTextIntoInstagramInput(activeInputTarget, text);
        closeCard();
      }
    });

    // Close button
    card.querySelector('.instareply-close-btn').addEventListener('click', closeCard);

    return card;
  }

  /**
   * Sets active visual state on stance buttons
   */
  function setCardActiveStance(card, stance) {
    if (!card) return;
    card.querySelectorAll('.instareply-stance-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.stance === stance);
    });
    const hintEl = card.querySelector('#instareply-stance-hint');
    if (hintEl) {
      if (stance === 'negative') {
        hintEl.textContent = 'Polite decline & firm boundary';
      } else if (stance === 'neutral') {
        hintEl.textContent = 'Objective, balanced & factual';
      } else {
        hintEl.textContent = 'Encouraging, supportive & warm';
      }
    }
  }

  /**
   * Sets active visual state on tone chips
   */
  function setCardActiveTone(card, tone) {
    card.querySelectorAll('.instareply-tone-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.tone === tone);
    });
  }

  /**
   * Sets active visual state on language select and hint
   */
  function setCardActiveLanguage(card, lang) {
    if (!card) return;
    const select = card.querySelector('#instareply-card-lang');
    if (select && select.value !== lang) {
      select.value = lang;
    }
    const hintEl = card.querySelector('#instareply-lang-hint');
    if (hintEl) {
      const langNames = {
        auto: 'Auto (Match Context)',
        en: 'English',
        ja: 'Japanese (日本語)',
        'zh-TW': 'Trad. Chinese (繁體中文)',
        'zh-CN': 'Simp. Chinese (简体中文)',
        es: 'Spanish (Español)',
        fr: 'French (Français)',
        de: 'German (Deutsch)',
        ko: 'Korean (한국어)',
        pt: 'Portuguese (Português)',
        it: 'Italian (Italiano)'
      };
      hintEl.textContent = langNames[lang] || lang;
    }
  }

  /**
   * Shows/hides loading spinner in output wrapper
   */
  function showCardLoading(card, isLoading) {
    if (!card) return;
    const loadingEl = card.querySelector('.instareply-loading-container');
    const errorEl = card.querySelector('.instareply-error-container');
    const textarea = card.querySelector('.instareply-output-textarea');
    const insightBar = card.querySelector('.instareply-insight-bar');

    if (isLoading) {
      if (loadingEl) loadingEl.classList.remove('hidden');
      if (errorEl) errorEl.classList.add('hidden');
      if (textarea) textarea.classList.add('hidden');
      if (insightBar) {
        insightBar.innerHTML = `<span class="instareply-sentiment-pill">🔍 Analyzing sentiment & context...</span>`;
      }
    } else {
      if (loadingEl) loadingEl.classList.add('hidden');
    }
  }

  /**
   * Injects drafted text into Instagram React inputs (ContentEditable or Textarea)
   */
  function insertTextIntoInstagramInput(element, text) {
    if (!element) {
      element = document.querySelector('form textarea, div[role="textbox"][contenteditable="true"]');
    }
    if (!element) return;

    // Prepend @author mention if replying to an individual comment and not already present
    let textToInsert = text;
    if (lastContextData?.author && lastContextData.contextType === 'comment') {
      const shouldPrepend = lastContextData.isSpecificCommentReply ||
        (lastContextData.postAuthor && lastContextData.author !== lastContextData.postAuthor);
      if (shouldPrepend) {
        const authorMention = `@${lastContextData.author}`;
        const currentVal = getElementValue(element);
        if (!textToInsert.startsWith('@') && !currentVal.includes(authorMention)) {
          textToInsert = `${authorMention} ${textToInsert}`;
        }
      }
    }

    element.focus();

    if (element.tagName.toLowerCase() === 'textarea' || element.tagName.toLowerCase() === 'input') {
      // Standard input or textarea
      // Use native value setter to trigger React state updates
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
        || Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

      if (nativeSetter) {
        nativeSetter.call(element, textToInsert);
      } else {
        element.value = textToInsert;
      }

      element.dispatchEvent(new Event('input', { bubbles: true }));
      element.dispatchEvent(new Event('change', { bubbles: true }));
    } else if (element.isContentEditable || element.getAttribute('contenteditable') === 'true') {
      // React ContentEditable div (Instagram DM and Feed Comments)
      element.innerText = textToInsert;

      // Dispatch input events
      const inputEvent = new InputEvent('input', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: textToInsert
      });
      element.dispatchEvent(inputEvent);

      // Move cursor to end
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(element);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    }

    element.focus();

    // Scroll comment input into view smoothly
    try {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } catch (_) {}
  }

  /**
   * Helper to check if element is inside a position:fixed container
   */
  function isFixedElement(el) {
    let curr = el;
    while (curr && curr !== document.body) {
      if (window.getComputedStyle && window.getComputedStyle(curr).position === 'fixed') {
        return true;
      }
      curr = curr.parentElement;
    }
    return false;
  }

  /**
   * Helper to locate the outer floating mini-window / dialog container
   */
  function findFloatingChatContainer(el) {
    if (!el) return null;
    if (el.closest) {
      const modal = el.closest('.ig-pip-window, .ig-dm-card');
      if (modal) return modal;
    }
    let curr = el;
    while (curr && curr !== document.body) {
      if (curr.classList && (curr.classList.contains('ig-pip-window') || curr.classList.contains('ig-dm-card') || curr.classList.contains('ig-dm-composer'))) {
        return curr;
      }
      if (window.getComputedStyle) {
        const s = window.getComputedStyle(curr);
        if (
          (s.position === 'fixed' || s.position === 'absolute') &&
          parseInt(s.bottom, 10) <= 80 &&
          curr.offsetWidth >= 220 && curr.offsetWidth <= 550 &&
          curr.offsetHeight >= 200 &&
          !curr.querySelector('div[aria-label*="comment" i], textarea[aria-label*="comment" i]')
        ) {
          return curr;
        }
      }
      curr = curr.parentElement;
    }
    return null;
  }

  /**
   * Position the floating card directly above, below, or beside the trigger
   */
  function positionCard(card, triggerBtn, inputEl) {
    const target = triggerBtn || inputEl;
    const rect = target.getBoundingClientRect();
    const cardWidth = card.offsetWidth || 390;
    const cardHeight = card.offsetHeight || 330;

    const inFloatingChat = isInsideFloatingChat(target);
    const isFixed = inFloatingChat || isFixedElement(target);

    if (inFloatingChat) {
      // For PIP floating mini-window: position to the LEFT of the mini-window so the chat is never covered!
      const floatingChat = findFloatingChatContainer(target);
      const chatRect = floatingChat ? floatingChat.getBoundingClientRect() : rect;

      card.style.position = 'fixed';
      let left = chatRect.left - cardWidth - 12;
      let top = chatRect.bottom - cardHeight;

      // If screen is too narrow to fit side-by-side on the left, try placing above the chat window
      if (left < 10) {
        if (chatRect.top - cardHeight - 12 >= 10) {
          top = chatRect.top - cardHeight - 12;
          left = Math.max(10, Math.min(chatRect.right - cardWidth, window.innerWidth - cardWidth - 16));
        } else {
          left = 10;
        }
      }

      // Vertical viewport boundary checks
      if (top < 10) {
        top = 10;
      }
      if (top + cardHeight > window.innerHeight - 10) {
        top = window.innerHeight - cardHeight - 10;
      }

      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    } else if (isFixed) {
      card.style.position = 'fixed';
      let top = rect.top - cardHeight - 12;
      let left = rect.left;

      if (top < 10) {
        top = rect.bottom + 10;
      }
      if (left < 10) {
        left = 10;
      }
      if (left + cardWidth > window.innerWidth - 16) {
        left = window.innerWidth - cardWidth - 16;
      }
      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    } else {
      card.style.position = 'absolute';
      let top = window.scrollY + rect.top - cardHeight - 12;
      let left = window.scrollX + rect.left;

      // Boundary check for top edge
      if (top < window.scrollY + 10) {
        top = window.scrollY + rect.bottom + 10;
      }

      // Boundary check for left edge
      if (left < 10) {
        left = 10;
      }

      // Boundary check for right edge
      if (left + cardWidth > window.innerWidth - 16) {
        left = window.innerWidth - cardWidth - 16;
      }

      card.style.top = `${top}px`;
      card.style.left = `${left}px`;
    }
  }

  /**
   * Closes the active card
   */
  function closeCard() {
    clearTimeout(prefetchTimer);
    clearTimeout(stancePrefetchTimer);
    currentGenerationId++;
    activeGenerationContext = null;
    if (activeCard && activeCard.parentNode) {
      activeCard.parentNode.removeChild(activeCard);
    }
    activeCard = null;
    activeInputTarget = null;
  }

  /**
   * Global click listener to close card on outside click
   */
  function setupGlobalClickListener() {
    document.addEventListener('click', (e) => {
      if (activeCard && !activeCard.contains(e.target) && !e.target.closest('.instareply-shortcut-btn')) {
        closeCard();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && activeCard) {
        closeCard();
      }
    });
  }

  /**
   * Helper to get value from either textarea or contenteditable element
   */
  function getElementValue(el) {
    if (!el) return '';
    if (el.tagName.toLowerCase() === 'textarea' || el.tagName.toLowerCase() === 'input') {
      return el.value || '';
    }
    return el.innerText || el.textContent || '';
  }

  /**
   * Helper: Escape HTML string
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Helper: Fetch config from service worker
   */
  async function getConfig() {
    try {
      return await chrome.runtime.sendMessage({ action: 'GET_CONFIG' }) || {};
    } catch {
      return {};
    }
  }

})();
