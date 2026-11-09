/**
 * InstaReply AI - Universal / Generic Web Page Adapter
 * Provides a general fallback for ANY website. Extracts whole-page semantic context
 * (title, metadata, headings, main article/thread content, and local input neighborhood)
 * so AI can refine user drafts or craft context-aware replies on any webpage.
 */

(function () {
  'use strict';

  const NOISE_SELECTOR = [
    'script',
    'style',
    'noscript',
    'svg',
    'nav',
    'footer',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '.instareply-card',
    '.instareply-card-overlay',
    '.instareply-shortcut-btn',
    '.instareply-quick-toast'
  ].join(', ');

  /**
   * Cleans and normalizes extracted text
   */
  function cleanText(raw, maxLen = 1500) {
    if (!raw || typeof raw !== 'string') return '';
    const normalized = raw
      .replace(/\r\n/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (!maxLen || normalized.length <= maxLen) return normalized;
    return normalized.slice(0, maxLen).trim();
  }

  /**
   * Extracts clean text from a DOM container by cloning and stripping noise nodes
   */
  function extractCleanNodeText(node, maxLen = 1500) {
    if (!node) return '';
    if (typeof node.cloneNode === 'function') {
      try {
        const clone = node.cloneNode(true);
        if (typeof clone.querySelectorAll === 'function') {
          const noise = clone.querySelectorAll(NOISE_SELECTOR);
          if (noise && typeof noise.forEach === 'function') {
            noise.forEach(n => n.remove?.());
          }
        }
        return cleanText(clone.innerText || clone.textContent || '', maxLen);
      } catch (_) {}
    }
    return cleanText(node.innerText || node.textContent || '', maxLen);
  }

  /**
   * Reads current text value from an input, textarea, or contenteditable element
   */
  function readEditableValue(el) {
    if (!el) return '';
    const tag = (el.tagName || '').toUpperCase();
    if (tag === 'TEXTAREA' || tag === 'INPUT' || typeof el.value === 'string') {
      return (el.value || '').trim();
    }
    return (el.innerText || el.textContent || '').trim();
  }

  const GenericPageAdapter = {
    platform: 'generic',
    charLimit: null,

    /**
     * Specific platform adapters take precedence during hostname detection;
     * GenericPageAdapter serves as the universal fallback when platform === 'generic'.
     */
    canHandle() {
      return false;
    },

    /**
     * Finds editable text fields on a generic page
     */
    findComposerElements(root = document) {
      if (!root || !root.querySelectorAll) return [];
      const selectors = [
        'textarea',
        'div[contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        '[contenteditable="plaintext-only"]',
        'input[type="text"]'
      ];

      return Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        if (
          el.closest?.('.instareply-card-overlay') ||
          el.closest?.('.instareply-card') ||
          el.classList?.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) {
          return false;
        }
        const aria = (el.getAttribute?.('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute?.('placeholder') || '').toLowerCase();
        const name = (el.getAttribute?.('name') || '').toLowerCase();
        if (
          aria.includes('search') ||
          placeholder.includes('search') ||
          name === 'q' ||
          name === 'search' ||
          el.closest?.('[role="search"], nav, header')
        ) {
          return false;
        }
        return true;
      });
    },

    /**
     * Finds toolbar container near a generic form/editor
     */
    findToolbarContainer(inputEl) {
      if (!inputEl || typeof inputEl.closest !== 'function') return null;
      const form = inputEl.closest('form, .comment-form, .reply-form, [role="dialog"]');
      if (!form || typeof form.querySelector !== 'function') return null;
      const submitBtn = form.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn && submitBtn.parentElement && submitBtn.parentElement !== inputEl.parentElement) {
        return submitBtn.parentElement;
      }
      return null;
    },

    /**
     * Attaches shortcut button to generic toolbar or input parent
     */
    attachToToolbar(btn, inputEl) {
      if (!btn || !inputEl) return false;
      const toolbar = this.findToolbarContainer(inputEl);
      if (toolbar) {
        toolbar.insertBefore(btn, toolbar.firstChild);
        return true;
      }
      if (inputEl.parentElement) {
        inputEl.parentElement.style.position = 'relative';
        inputEl.parentElement.appendChild(btn);
        return true;
      }
      return false;
    },

    /**
     * Finds the nearest semantic container enclosing an editable element
     */
    findPostContainer(el) {
      if (!el || typeof el.closest !== 'function') return null;
      return (
        el.closest('article, [role="article"], [role="dialog"], .comment, .post, .message, .thread, .review, .ticket, section, form, main, [role="main"]') ||
        el.parentElement ||
        null
      );
    },

    /**
     * Extracts whole-page semantic context and local neighborhood around the active input
     */
    extractWholePageContext(doc = document, inputEl = null, containerOverride = null) {
      const rootDoc = doc || (inputEl && inputEl.ownerDocument) || (typeof document !== 'undefined' ? document : null);
      if (!rootDoc) {
        return {
          pageTitle: '',
          siteName: '',
          pageUrl: '',
          metaDescription: '',
          mainHeading: '',
          fieldLabel: '',
          localAuthor: '',
          localContext: '',
          pageContentDigest: '',
          visuals: { description: '', thumbnailUrl: '', mediaType: 'image' }
        };
      }

      const winLoc = (typeof window !== 'undefined' && window.location) ? window.location : { hostname: '', pathname: '', href: '' };
      const pageTitle = (
        rootDoc.title ||
        rootDoc.querySelector?.('meta[property="og:title"]')?.getAttribute?.('content') ||
        ''
      ).trim();

      const siteName = (
        rootDoc.querySelector?.('meta[property="og:site_name"]')?.getAttribute?.('content') ||
        winLoc.hostname ||
        'Webpage'
      ).trim();

      const metaDescription = (
        rootDoc.querySelector?.('meta[name="description"]')?.getAttribute?.('content') ||
        rootDoc.querySelector?.('meta[property="og:description"]')?.getAttribute?.('content') ||
        ''
      ).trim();

      const h1El = rootDoc.querySelector?.('h1, main h1, article h1, [role="main"] h1');
      const mainHeading = h1El ? cleanText(h1El.textContent, 240) : '';

      // 1. Extract input field label / placeholder cues
      let fieldLabel = '';
      if (inputEl && typeof inputEl.getAttribute === 'function') {
        const ariaLabel = inputEl.getAttribute('aria-label') || '';
        const placeholder = inputEl.getAttribute('placeholder') || inputEl.getAttribute('aria-placeholder') || '';
        fieldLabel = cleanText(ariaLabel || placeholder, 160);
      }

      // 2. Extract immediate local context around the input element
      const localContainer = containerOverride || this.findPostContainer(inputEl);
      let localAuthor = '';
      let localContext = '';

      if (localContainer) {
        if (typeof localContainer.querySelector === 'function') {
          const authorEl = localContainer.querySelector(
            '[rel="author"], [itemprop="author"], .author, .username, [class*="author" i], [class*="sender" i], [class*="user-name" i], header strong, h3, h4'
          );
          if (authorEl && authorEl !== inputEl && (!inputEl || !inputEl.contains?.(authorEl))) {
            const candidateAuthor = cleanText(authorEl.textContent, 60);
            if (candidateAuthor && candidateAuthor.length <= 50) {
              localAuthor = candidateAuthor;
            }
          }
        }

        const clonedText = extractCleanNodeText(localContainer, 800);
        const draftVal = readEditableValue(inputEl);
        if (clonedText && clonedText !== draftVal) {
          localContext = clonedText;
        }
      }

      // 3. Extract Whole-Page Semantic Content Digest
      const mainRoot =
        (rootDoc.querySelector && rootDoc.querySelector('article, main, [role="main"], #content, .content, .post, .thread')) ||
        rootDoc.body;

      let pageContentDigest = '';
      if (mainRoot) {
        pageContentDigest = extractCleanNodeText(mainRoot, 1800);
      }

      // 4. Visual context (og:image or prominent article image)
      let thumbnailUrl = rootDoc.querySelector?.('meta[property="og:image"]')?.getAttribute?.('content') || '';
      let visualDesc = '';
      const imgRoot = localContainer || mainRoot;
      if (imgRoot && typeof imgRoot.querySelector === 'function') {
        const imgEl = imgRoot.querySelector('img[alt]:not([alt=""])') || imgRoot.querySelector('img[src^="http"]');
        if (imgEl) {
          if (!thumbnailUrl) thumbnailUrl = imgEl.getAttribute?.('src') || '';
          visualDesc = cleanText(imgEl.getAttribute?.('alt') || '', 200);
        }
      }

      return {
        pageTitle,
        siteName,
        pageUrl: winLoc.href || '',
        metaDescription,
        mainHeading,
        fieldLabel,
        localAuthor,
        localContext,
        pageContentDigest,
        visuals: {
          description: visualDesc,
          thumbnailUrl: thumbnailUrl && thumbnailUrl.startsWith('http') ? thumbnailUrl : '',
          mediaType: 'image'
        }
      };
    },

    /**
     * Standard adapter extractContext entrypoint
     */
    extractContext(inputEl, postContainer = null) {
      const doc = (inputEl && inputEl.ownerDocument) ? inputEl.ownerDocument : (typeof document !== 'undefined' ? document : null);
      const pageCtx = this.extractWholePageContext(doc, inputEl, postContainer);
      const userDraft = readEditableValue(inputEl);

      // Assemble comprehensive whole-page context for postCaption
      const captionParts = [];
      if (pageCtx.pageTitle) {
        captionParts.push(`Page Title: ${pageCtx.pageTitle}`);
      }
      if (pageCtx.metaDescription) {
        captionParts.push(`Summary: ${pageCtx.metaDescription}`);
      }
      if (pageCtx.mainHeading && pageCtx.mainHeading !== pageCtx.pageTitle) {
        captionParts.push(`Heading: ${pageCtx.mainHeading}`);
      }
      if (pageCtx.pageContentDigest) {
        captionParts.push(`Page Context:\n${pageCtx.pageContentDigest}`);
      }
      const postCaption = captionParts.join('\n').trim();

      const incomingText = pageCtx.localContext || pageCtx.mainHeading || pageCtx.pageTitle || pageCtx.fieldLabel || '';

      const lowerLabel = (pageCtx.fieldLabel || '').toLowerCase();
      const isDmLike = lowerLabel.includes('message') || lowerLabel.includes('chat') || lowerLabel.includes('dm') || lowerLabel.includes('email');

      const winLoc = (typeof window !== 'undefined' && window.location) ? window.location : { hostname: 'web', pathname: '/' };
      const postId = `web_${winLoc.hostname}${winLoc.pathname}`.slice(0, 80);

      return {
        platform: 'generic',
        contextType: isDmLike ? 'dm' : 'comment',
        postId,
        author: pageCtx.localAuthor || pageCtx.siteName || '',
        postAuthor: pageCtx.localAuthor || pageCtx.siteName || '',
        postCaption,
        incomingText,
        incomingAuthor: pageCtx.localAuthor || '',
        userDraftHint: userDraft,
        draftNotes: userDraft,
        pageTitle: pageCtx.pageTitle,
        siteName: pageCtx.siteName,
        postVisuals: pageCtx.visuals,
        toneBias: 'friendly'
      };
    },

    /**
     * Inserts or replaces text in any standard input, textarea, or contenteditable element
     */
    insertText(inputEl, text) {
      if (!inputEl || !text) return false;
      inputEl.focus?.();

      const tag = (inputEl.tagName || '').toUpperCase();
      if (tag === 'TEXTAREA' || tag === 'INPUT') {
        const proto = tag === 'TEXTAREA'
          ? (typeof window !== 'undefined' ? window.HTMLTextAreaElement?.prototype : null)
          : (typeof window !== 'undefined' ? window.HTMLInputElement?.prototype : null);
        const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
        if (nativeSetter) {
          nativeSetter.call(inputEl, text);
        } else {
          inputEl.value = text;
        }
        inputEl.dispatchEvent?.(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent?.(new Event('change', { bubbles: true }));
        return true;
      }

      if (inputEl.isContentEditable || inputEl.getAttribute?.('contenteditable') === 'true') {
        try {
          if (typeof window !== 'undefined' && window.getSelection && typeof document !== 'undefined' && document.createRange) {
            const range = document.createRange();
            range.selectNodeContents(inputEl);
            const sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
          }
          if (typeof document !== 'undefined' && document.execCommand('insertText', false, text)) {
            return true;
          }
        } catch (_) {}
        inputEl.innerText = text;
        inputEl.dispatchEvent?.(new Event('input', { bubbles: true }));
        return true;
      }

      return false;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GenericPageAdapter;
  }
  if (typeof window !== 'undefined') {
    window.GenericPageAdapter = GenericPageAdapter;
    window.GenericAdapter = GenericPageAdapter;
    if (window.SocialPlatformDetector && typeof window.SocialPlatformDetector.registerAdapter === 'function') {
      window.SocialPlatformDetector.registerAdapter(GenericPageAdapter);
    }
  }
})();
