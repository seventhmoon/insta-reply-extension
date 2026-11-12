/**
 * InstaReply AI - Shared Adapter & DOM Utilities
 * Provides reusable, XSS-safe, and framework-compatible DOM helpers across
 * platform adapters and content scripts (UMD: browser global + CommonJS).
 */

(function () {
  'use strict';

  const EXTENSION_UI_SELECTOR = [
    '.instareply-card-overlay',
    '.instareply-card',
    '.instareply-shortcut-btn',
    '.instareply-composer-actions',
    '.instareply-quick-toast'
  ].join(', ');

  const PLATFORM_CHAR_LIMITS = Object.freeze({
    x: 280,
    google_play: 350,
    threads: 500
  });

  const HANDLE_MENTION_PLATFORMS = new Set(['instagram', 'threads']);

  /**
   * Returns true if the given element belongs to InstaReply AI's own injected UI
   */
  function isExtensionElement(el) {
    if (!el) return false;
    if (el.id === 'instareply-output-text') return true;
    if (el.classList && (
      el.classList.contains('instareply-textarea') ||
      el.classList.contains('instareply-output-textarea') ||
      el.classList.contains('instareply-topic-input') ||
      el.classList.contains('instareply-card-overlay')
    )) {
      return true;
    }
    if (typeof el.closest === 'function' && el.closest(EXTENSION_UI_SELECTOR)) {
      return true;
    }
    return false;
  }

  /**
   * Returns true if the given element is a search box or inside primary site navigation
   */
  function isSearchOrNavElement(el) {
    if (!el) return false;
    const ariaLabel = (el.getAttribute && el.getAttribute('aria-label') || '').toLowerCase();
    const placeholder = (el.getAttribute && el.getAttribute('placeholder') || '').toLowerCase();
    const name = (el.getAttribute && el.getAttribute('name') || '').toLowerCase();
    if (
      ariaLabel.includes('search') ||
      placeholder.includes('search') ||
      name === 'q' ||
      name === 'search'
    ) {
      return true;
    }
    if (typeof el.closest === 'function' && el.closest('header, nav, [role="navigation"], [role="search"], input[type="search"], input[role="combobox"]')) {
      return true;
    }
    return false;
  }

  /**
   * Deduplicates an array of DOM elements, keeping only the innermost editable elements
   */
  function deduplicateInnermostElements(elements) {
    if (!Array.isArray(elements) || elements.length <= 1) return elements || [];
    return elements.filter((el, idx) => {
      return !elements.some((other, oIdx) => oIdx !== idx && typeof el.contains === 'function' && el.contains(other));
    });
  }

  /**
   * Resets positioning classes/styles on a shortcut button wrapper before toolbar insertion
   */
  function resetToolbarButtonStyle(btn) {
    if (!btn) return;
    if (btn.classList) {
      btn.classList.remove('instareply-dm-shortcut-btn', 'instareply-dm-actions');
    }
    if (btn.style) {
      btn.style.position = 'relative';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.transform = 'none';
    }
  }

  /**
   * Escapes untrusted strings for safe HTML interpolation (XSS protection)
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
   * Resolves the strict character limit for a given platform ID (or null if unconstrained)
   */
  function getPlatformCharLimit(platform, explicitLimit = null) {
    if (typeof explicitLimit === 'number' && explicitLimit > 0) {
      return explicitLimit;
    }
    if (!platform) return null;
    return PLATFORM_CHAR_LIMITS[String(platform).toLowerCase()] || null;
  }

  /**
   * Trims text cleanly on sentence or word boundaries to fit a platform character limit
   */
  function enforceCharLimit(text, limitOrPlatform) {
    const limit = typeof limitOrPlatform === 'string'
      ? getPlatformCharLimit(limitOrPlatform)
      : limitOrPlatform;
    if (!text || typeof text !== 'string' || !limit || text.length <= limit) {
      return text;
    }
    const trimmed = text.slice(0, limit);
    const lastSentenceEnd = Math.max(
      trimmed.lastIndexOf('. '),
      trimmed.lastIndexOf('! '),
      trimmed.lastIndexOf('? '),
      trimmed.lastIndexOf('.\n'),
      trimmed.lastIndexOf('!\n'),
      trimmed.lastIndexOf('?\n')
    );
    if (lastSentenceEnd > limit * 0.6) {
      return trimmed.slice(0, lastSentenceEnd + 1).trim();
    }
    const lastSpace = trimmed.lastIndexOf(' ');
    if (lastSpace > limit * 0.7) {
      return trimmed.slice(0, lastSpace).trim();
    }
    return trimmed.trim();
  }

  /**
   * Checks whether an author string is a valid single-token @handle (no spaces or headlines)
   */
  function isValidMentionHandle(author) {
    if (!author || typeof author !== 'string') return false;
    const clean = author.trim().replace(/^@/, '');
    return clean.length > 0 && clean.length <= 40 && /^[a-zA-Z0-9._-]+$/.test(clean);
  }

  /**
   * Returns true if @handle prepending should apply for the given platform and author
   */
  function shouldAutoPrependMention(platform, author) {
    const plat = String(platform || 'instagram').toLowerCase();
    if (!HANDLE_MENTION_PLATFORMS.has(plat)) return false;
    return isValidMentionHandle(author);
  }

  const InstaReplyUtils = {
    EXTENSION_UI_SELECTOR,
    PLATFORM_CHAR_LIMITS,
    isExtensionElement,
    isSearchOrNavElement,
    deduplicateInnermostElements,
    resetToolbarButtonStyle,
    escapeHTML,
    getPlatformCharLimit,
    enforceCharLimit,
    isValidMentionHandle,
    shouldAutoPrependMention
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = InstaReplyUtils;
  }
  if (typeof window !== 'undefined') {
    window.InstaReplyUtils = InstaReplyUtils;
  }
})();

