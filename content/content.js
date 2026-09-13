// InstaReply AI - Content Script for Instagram Comments & Direct Messages

(function () {
  'use strict';

  // State
  let activeCard = null;
  let activeInputTarget = null;
  let currentTone = 'friendly';
  let currentStance = 'positive';
  let currentVariation = 0;
  let lastContextData = null;
  let lastActiveCommentContext = null;

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
    const commentSelectors = [
      'form textarea[aria-label*="comment" i]',
      'form textarea[placeholder*="comment" i]',
      'textarea[aria-label*="Add a comment" i]',
      'textarea[placeholder*="Add a comment" i]',
      'form div[role="textbox"][contenteditable="true"]',
      'div[role="textbox"][aria-label*="Add a comment" i]'
    ];

    document.querySelectorAll(commentSelectors.join(',')).forEach((el) => {
      injectShortcutButton(el, 'comment');
    });

    // 2. Instagram Direct Message (DM) Composers (Fullscreen + PIP / Mini-window mode)
    const dmInputs = findDmInputElements();
    dmInputs.forEach((el) => {
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
   * Prunes duplicate shortcut buttons across forms, dialogs, and DM composer bars
   */
  function pruneDuplicateShortcutButtons() {
    // Check all comment forms and dialogs
    document.querySelectorAll('form, div[role="dialog"]').forEach((container) => {
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
    if (
      lastActiveCommentContext &&
      lastActiveCommentContext.incomingText &&
      (Date.now() - lastActiveCommentContext.timestamp < 300000)
    ) {
      if (
        !clean ||
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
      const isReplyBtn = (text === 'Reply' || text === 'reply' || ariaLabel.startsWith('reply to'));

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
          lastActiveCommentContext = {
            author: rawAuthor,
            incomingText: commentText,
            commentItem,
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
        lastActiveCommentContext = {
          author: rawAuthor,
          incomingText: commentText,
          commentItem,
          timestamp: Date.now()
        };

        // Trigger native reply button click so Instagram can initialize its reply state
        try {
          el.click();
        } catch (_) {}

        // Locate the comment input for this post
        const article = commentItem.closest('article') || commentItem.closest('div[role="dialog"]') || document.querySelector('article') || document;
        const commentInput = article.querySelector('form div[role="textbox"][contenteditable="true"], form textarea, textarea[placeholder*="comment" i]');

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

    // 1. Test harness mock
    const mock = inputEl.closest('.ig-dm-composer');
    if (mock) return mock;

    let curr = inputEl.parentElement;
    let bestPill = null;

    // 2. Walk up looking for the rounded pill container (typically has border-radius >= 14px or border)
    for (let i = 0; i < 8 && curr && curr !== document.body; i++) {
      if (curr.getAttribute('role') === 'main' || curr.tagName === 'FORM') {
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
    const form = inputEl.closest('form');
    if (form) return form;

    // In Reels or dialogs without <form>, find the immediate comment row or pill
    let curr = inputEl.parentElement;
    let pillContainer = curr;

    while (curr && curr !== document.body) {
      if (curr.getAttribute('role') === 'dialog' || curr.tagName.toLowerCase() === 'article') {
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
    let postBtn = container.querySelector('button[type="submit"], .ig-post-btn');
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
   * Opens or toggles the AI Reply Assistant Card
   */
  /**
   * Finds the currently visible active Reel on the page
   */
  function findActiveReelContainer() {
    // 1. Look for active article on the page containing video
    const articles = Array.from(document.querySelectorAll('article'));
    for (const a of articles) {
      if (a.querySelector('video')) {
        const rect = a.getBoundingClientRect();
        if (rect.bottom > 0 && rect.top < window.innerHeight) {
          return a;
        }
      }
    }
    if (articles.length > 0) return articles[0];

    // 2. Find currently visible video
    const videos = Array.from(document.querySelectorAll('video'));
    for (const v of videos) {
      const rect = v.getBoundingClientRect();
      if (rect.width > 80 && rect.height > 80 && rect.bottom > 0 && rect.top < window.innerHeight) {
        let p = v.parentElement;
        while (p && p !== document.body) {
          if (
            p.tagName.toLowerCase() === 'article' ||
            p.getAttribute('role') === 'region' ||
            p.classList.contains('ig-post-card') ||
            (p.getAttribute('tabindex') === '0' && p.clientHeight > 300)
          ) {
            return p;
          }
          p = p.parentElement;
        }
        return v.parentElement || v;
      }
    }
    return null;
  }

  /**
   * Finds the closest Instagram post or dialog container for a given element
   */
  function findPostContainer(el) {
    if (el && el.closest) {
      // 1. Direct modal dialog
      const parentModal = el.closest('div[role="dialog"]');
      if (parentModal) {
        // If parentModal is a post modal (contains header or video), return it
        if (parentModal.querySelector('header, .ig-post-header, video')) {
          return parentModal;
        }
        // If parentModal is a comments drawer (Reels), look for the active Reel behind it
        const activeReel = findActiveReelContainer();
        if (activeReel) return activeReel;
        return parentModal;
      }

      // 2. Direct parent article / feed post
      const parentArticle = el.closest('article') || el.closest('.ig-post-card');
      if (parentArticle) return parentArticle;
    }

    // 3. Check if an active modal dialog is open on the screen
    const openModal = document.querySelector('div[role="dialog"] article') || document.querySelector('div[role="dialog"]');
    if (openModal) {
      if (openModal.querySelector('header, .ig-post-header, video')) {
        return openModal;
      }
      const activeReel = findActiveReelContainer();
      if (activeReel) return activeReel;
      return openModal;
    }

    // 4. If an element was clicked but was outside an article/dialog, check active Reel
    const activeReel = findActiveReelContainer();
    if (activeReel) return activeReel;

    // 5. Fallback only if on a dedicated single-post URL
    if (window.location.pathname.startsWith('/p/') || window.location.pathname.startsWith('/reel/')) {
      return document.querySelector('article') || document.querySelector('.ig-post-card') || null;
    }

    return null;
  }

  /**
   * Validates if a text string is a real Instagram post caption and not a username, handle, or button label
   */
  function isValidCaption(text, author = '') {
    if (!text) return false;
    const trimmed = text.trim();

    // Must have at least 10 characters
    if (trimmed.length < 10) return false;

    // Must not be the post author handle or current user
    if (author) {
      const cleanAuthor = author.toLowerCase().replace(/^@/, '');
      const cleanTrimmed = trimmed.toLowerCase().replace(/^@/, '');
      if (cleanTrimmed === cleanAuthor) return false;
    }

    // Must not be a single username handle or single token (e.g. "gangshanjingyan1")
    // Instagram usernames consist of letters, digits, periods, and underscores without spaces
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

    // Captions in Latin scripts MUST contain spaces (sentences/phrases); CJK text must have > 8 characters
    const hasSpaces = /\s/.test(trimmed);
    const isCjk = /[\u4e00-\u9fff\u3040-\u30ff]/.test(trimmed);
    if (!hasSpaces && (!isCjk || trimmed.length < 8)) {
      return false;
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
    const author = (knownAuthor || extractPostAuthor(container) || '').trim();

    // 1. Scan and extract all comments authored by the creator in the comment stream
    const authorComments = extractAllAuthorComments(container, author);

    let standardCaption = '';

    // 2. Feed post caption structure (right after the author username link)
    const authorLinks = container.querySelectorAll('a[role="link"], header a, .ig-post-header strong');
    for (const link of authorLinks) {
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

    // 3. Instagram SEO & Accessibility heading (present inside post article on post pages)
    if (!standardCaption) {
      const h1 = container.querySelector('article h1[dir="auto"], div[role="dialog"] h1');
      if (h1 && !h1.closest('header')) {
        const h1Text = cleanCaptionText(h1.textContent?.trim() || '');
        if (isValidCaption(h1Text, author)) {
          standardCaption = h1Text;
        }
      }
    }

    // 4. Scan content spans inside container (filtering out metadata, forms, and button labels)
    if (!standardCaption) {
      const dirSpans = container.querySelectorAll('span[dir="auto"]');
      for (const span of dirSpans) {
        if (
          span.closest('form') ||
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

    // 5. Open Graph meta tags (ONLY on dedicated post/reel URLs, NOT on profile or feed pages)
    if (!standardCaption) {
      const path = window.location.pathname;
      if (path.startsWith('/p/') || path.startsWith('/reel/')) {
        const ogDesc = document.querySelector('meta[property="og:description"]')?.content;
        if (ogDesc) {
          // IG format: "1,234 likes, 56 comments - user on Date: \"Caption here\""
          const quoteMatch = ogDesc.match(/:\s*[“"']([^”"']{10,})[”"']/);
          if (quoteMatch && quoteMatch[1]) {
            const cleaned = cleanCaptionText(quoteMatch[1]);
            if (isValidCaption(cleaned, author)) {
              standardCaption = cleaned;
            }
          }
        }
      }
    }

    // 6. Post main image alt text fallback
    if (!standardCaption) {
      const imgAlt = container.querySelector('img[alt]')?.getAttribute('alt');
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

    // Deduplicate author comments against standardCaption
    const uniqueAuthorComments = authorComments.filter(c => {
      if (!standardCaption) return true;
      const lowerC = c.toLowerCase();
      const lowerStd = standardCaption.toLowerCase();
      return !lowerStd.includes(lowerC) && !lowerC.includes(lowerStd);
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
    if (!container) return '';

    // 1. Try anchor hrefs inside header (most reliable)
    // Profile links are typically /username/ or https://www.instagram.com/username/
    const headerLinks = container.querySelectorAll(
      'header a[href^="/"], .ig-post-header a[href^="/"], header a[role="link"], .ig-post-header a'
    );
    for (const link of headerLinks) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/(?:instagram\.com|^)\/([a-zA-Z0-9._]+)\/?$/);
      if (match && match[1]) {
        const handle = match[1];
        const lower = handle.toLowerCase();
        if (!['explore', 'reels', 'direct', 'stories', 'p', 'reel', 'tv'].includes(lower)) {
          return handle;
        }
      }
    }

    // 2. Try text inside header link or strong (handling "username\nAI-generated profile" or "username • Following")
    const headerAuthor = container.querySelector(
      'header a[role="link"], header a, .ig-post-header strong, .ig-post-header a, header h2, header h3'
    );
    if (headerAuthor) {
      // Split text by whitespace, newlines, and bullet separators
      const tokens = (headerAuthor.textContent || '')
        .trim()
        .replace(/^@/, '')
        .split(/[\s\n•·|]+/);
      for (const token of tokens) {
        const cleanToken = token.trim();
        if (/^[a-zA-Z0-9._]{1,35}$/.test(cleanToken)) {
          const lower = cleanToken.toLowerCase();
          if (!['following', 'follow', 'verified', 'ai-generated', 'profile', 'audio', 'original', 'posts', 'reels'].includes(lower)) {
            return cleanToken;
          }
        }
      }
    }

    // 3. Check Open Graph or page title if on post/reel page
    const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
    if (ogTitle) {
      const match = ogTitle.match(/@([a-zA-Z0-9._]+)/);
      if (match && match[1]) {
        return match[1];
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
    if (!container) return { description: '', thumbnailUrl: '', mediaType: 'image' };

    let description = '';
    let thumbnailUrl = '';
    let mediaType = 'image';

    // 1. Check for video or reel
    const video = container.querySelector('video');
    if (video) {
      mediaType = 'video';
      if (video.poster) thumbnailUrl = video.poster;
    }

    // 2. Scan media images for visual descriptions and thumbnails
    const images = Array.from(container.querySelectorAll('img')).filter(img => {
      if (img.closest('.instareply-card-overlay')) return false;
      const alt = (img.getAttribute('alt') || '').toLowerCase();
      if (alt.includes('profile picture') || alt.includes('avatar')) return false;
      if (!img.src || img.src.startsWith('data:image/svg')) return false;
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
          } else if (alt.length > 15 && !alt.toLowerCase().includes('profile picture')) {
            description = alt.trim();
            break;
          }
        }
      }
    }

    // 3. Check aria-label descriptions
    if (!description) {
      const imgRole = container.querySelector('[role="img"][aria-label]');
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
    const shouldIncludeCaption = config.includePostCaption !== false;

    // Locate post container to extract post caption, author, and visuals
    const postContainer = shouldIncludeCaption ? findPostContainer(inputEl || triggerBtn) : null;
    let postAuthor = postContainer ? extractPostAuthor(postContainer) : '';
    let postCaption = postContainer ? extractPostCaption(postContainer, postAuthor) : '';
    let postVisuals = postContainer ? extractPostVisuals(postContainer) : { description: '', thumbnailUrl: '', mediaType: 'image' };

    // In Reels or dialogs, if postAuthor or postCaption was not inside the comments drawer, check active Reel
    const activeReel = findActiveReelContainer();
    if (activeReel && activeReel !== postContainer) {
      if (!postAuthor) postAuthor = extractPostAuthor(activeReel);
      if (!postCaption) postCaption = extractPostCaption(activeReel, postAuthor);
      if (!postVisuals.thumbnailUrl && !postVisuals.description) {
        const rv = extractPostVisuals(activeReel);
        if (rv.thumbnailUrl || rv.description) postVisuals = rv;
      }
    }

    // Also fallback to Open Graph meta tags for Reel pages
    if ((!postAuthor || !postCaption) && (window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/'))) {
      if (!postAuthor) {
        const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
        const m = ogTitle.match(/@([a-zA-Z0-9._]+)/);
        if (m) postAuthor = m[1];
      }
      if (!postCaption) {
        const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
        const quoteMatch = ogDesc.match(/:\s*[“"']([^”"']{5,})[”"']/);
        if (quoteMatch && quoteMatch[1]) {
          postCaption = cleanCaptionText(quoteMatch[1]);
        }
      }
    }

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

    lastContextData = { ...context, contextType };

    // Create & Position Card
    activeCard = createCardDOM(context);
    document.body.appendChild(activeCard);
    positionCard(activeCard, triggerBtn, inputEl);

    // Highlight initial tone chip and stance
    setCardActiveTone(activeCard, currentTone);
    setCardActiveStance(activeCard, currentStance);

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
        postAuthor = extractPostAuthor(article);
        postCaption = extractPostCaption(article, postAuthor);
        postVisuals = extractPostVisuals(article);

        // In Reels, if postAuthor or postCaption was not inside the comments drawer, check active Reel
        const activeReel = findActiveReelContainer();
        if (activeReel && activeReel !== article) {
          if (!postAuthor) postAuthor = extractPostAuthor(activeReel);
          if (!postCaption) postCaption = extractPostCaption(activeReel, postAuthor);
          if (!postVisuals.thumbnailUrl && !postVisuals.description) {
            const rv = extractPostVisuals(activeReel);
            if (rv.thumbnailUrl || rv.description) postVisuals = rv;
          }
        }

        // Also fallback to Open Graph meta tags for Reel pages
        if ((!postAuthor || !postCaption) && (window.location.pathname.startsWith('/reel/') || window.location.pathname.startsWith('/reels/'))) {
          if (!postAuthor) {
            const ogTitle = document.querySelector('meta[property="og:title"]')?.content || '';
            const m = ogTitle.match(/@([a-zA-Z0-9._]+)/);
            if (m) postAuthor = m[1];
          }
          if (!postCaption) {
            const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
            const quoteMatch = ogDesc.match(/:\s*[“"']([^”"']{5,})[”"']/);
            if (quoteMatch && quoteMatch[1]) {
              postCaption = cleanCaptionText(quoteMatch[1]);
            }
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

        // 3. Resolve specific comment text from either cached active comment or searching article
        if (author) {
          const found = findCommentByAuthor(article, author);
          if (found && found.incomingText) {
            incomingText = found.incomingText;
            author = found.author;
          }
        } else if (lastActiveCommentContext && (Date.now() - lastActiveCommentContext.timestamp < 300000)) {
          // If no @mention was in the box, but user recently clicked "Reply" on a comment
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

    showCardLoading(activeCard, true);

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

    try {
      const config = await getConfig();
      payload.replyLanguage = config.replyLanguage || 'auto';

      // Check if user chose Edge AI (Prompt API)
      if (config.provider === 'edge_ai') {
        await generateViaEdgeAI(payload);
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'GENERATE_REPLY',
        payload
      });

      if (response && response.success) {
        renderAIResult(response);
      } else {
        renderAIError(response?.error || 'Failed to generate reply. Check your API settings.');
      }
    } catch (err) {
      renderAIError(err.message || 'Error communicating with AI service.');
    }
  }

  /**
   * Edge AI on-device generation via Main World Bridge (Prompt API / Gemini Nano)
   */
  async function generateViaEdgeAI(payload) {
    ensurePageBridgeInjected();
    const requestId = 'edge_ai_' + Math.random().toString(36).substring(2, 10);

    return new Promise((resolve) => {
      let timeoutId = setTimeout(() => {
        window.removeEventListener('message', handleBridgeResponse);
        renderAIError('Edge AI request timed out. Chrome Prompt API may not be enabled (visit chrome://flags/#prompt-api-for-gemini-nano) or model is still downloading.');
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
          renderAIResult(event.data);
        } else {
          renderAIError(event.data.error || 'Edge AI generation failed.');
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
   * Renders AI response details: Sentiment pill, Topics, and Reply textarea
   */
  function renderAIResult(data) {
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

    if (modelBadge && data.modelUsed) {
      modelBadge.textContent = data.modelUsed;
    }

    // Sentiment Pill
    let sentimentClass = 'positive';
    if (data.sentiment === 'question') sentimentClass = 'question';
    if (data.sentiment === 'negative' || data.sentiment === 'complaint') sentimentClass = 'negative';

    let pillsHTML = `
      <span class="instareply-sentiment-pill ${sentimentClass}">
        ${data.sentimentLabel || '✨ Analyzed'}
      </span>
    `;

    // Key Topics
    if (data.topics && data.topics.length > 0) {
      pillsHTML += data.topics.map(t => `<span class="instareply-topic-tag">#${escapeHTML(t)}</span>`).join('');
    }

    if (insightBar) {
      insightBar.innerHTML = pillsHTML;
    }

    // Update or dynamically insert AI Visual Analysis ("What does the AI see in this post")
    if (data.visualAnalysis) {
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
            <button type="button" class="instareply-tone-chip" data-tone="friendly">😊 Friendly</button>
            <button type="button" class="instareply-tone-chip" data-tone="enthusiastic">🔥 Hyped</button>
            <button type="button" class="instareply-tone-chip" data-tone="humorous">😄 Humorous</button>
            <button type="button" class="instareply-tone-chip" data-tone="professional">💼 Professional</button>
            <button type="button" class="instareply-tone-chip" data-tone="empathetic">❤️ Empathetic</button>
            <button type="button" class="instareply-tone-chip" data-tone="concise">⚡ Short</button>
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
        currentTone = chip.dataset.tone;
        setCardActiveTone(card, currentTone);
        currentVariation = 0;
        executeReplyGeneration();
      });
    });

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
