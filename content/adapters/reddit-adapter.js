/**
 * InstaReply AI - Reddit Platform Adapter
 * Handles subreddit context extraction, shreddit-composer / markdown / rich-text comment discovery,
 * toolbar attachment, and reply injection on reddit.com.
 */

(function () {
  'use strict';

  const RedditAdapter = {
    platform: 'reddit',

    /**
     * Checks if this adapter can handle the given URL or hostname
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('reddit.com');
    },

    /**
     * Finds active comment, reply, and post composers on Reddit (Shreddit & Legacy)
     */
    findComposerElements(root = document) {
      const selectors = [
        'shreddit-composer div[contenteditable="true"]',
        'shreddit-composer textarea',
        'div[slot="text-inputs"] div[contenteditable="true"]',
        'div[data-lexical-editor="true"][contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        'textarea[name="text"]',
        'textarea[placeholder*="Add a comment" i]',
        'textarea[placeholder*="What are your thoughts" i]',
        'div[contenteditable="true"][aria-label*="comment" i]',
        'div[contenteditable="true"][placeholder*="Add a comment" i]'
      ];

      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) {
          return false;
        }

        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (
          ariaLabel.includes('search') ||
          placeholder.includes('search') ||
          el.closest('header, nav, [role="search"], reddit-search-large')
        ) {
          return false;
        }

        const tag = (el.tagName || '').toUpperCase();
        return tag === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
      });

      return results.filter((el, idx) => {
        return !results.some((other, oIdx) => oIdx !== idx && el.contains(other));
      });
    },

    /**
     * Finds the toolbar or action footer associated with a Reddit composer
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const actionSlot = curr.querySelector(
          '[slot="action-bar"], [slot="submit-button"], [role="toolbar"], .BottomBar, [class*="action-bar"]'
        );
        if (actionSlot && actionSlot !== inputEl.parentElement) {
          return actionSlot;
        }

        const buttons = Array.from(curr.querySelectorAll('button[type="submit"], button'));
        const submitBtn = buttons.find(b => {
          const txt = (b.textContent || '').trim().toLowerCase();
          return (
            (txt === 'comment' || txt === 'reply' || txt === 'post' || txt === 'save') &&
            b !== inputEl &&
            !b.closest('.instareply-shortcut-btn')
          );
        });
        if (submitBtn && submitBtn.parentElement && submitBtn.parentElement !== inputEl.parentElement) {
          return submitBtn.parentElement;
        }

        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the AI shortcut button cleanly into Reddit's composer toolbar
     */
    attachToToolbar(btn, inputEl) {
      if (!btn || !inputEl) return false;

      btn.classList.remove('instareply-dm-shortcut-btn', 'instareply-dm-actions');
      btn.style.position = 'relative';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.transform = 'none';

      const toolbar = this.findToolbarContainer(inputEl);
      if (toolbar) {
        toolbar.style.display = 'inline-flex';
        toolbar.style.alignItems = 'center';
        toolbar.style.gap = '6px';
        btn.style.marginRight = '6px';
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
     * Finds the enclosing comment or post container on Reddit
     */
    findPostContainer(el) {
      if (!el) return null;
      return (
        el.closest('shreddit-comment, [data-testid="comment"], .Comment, .thing.comment') ||
        el.closest('shreddit-post, [data-testid="post-container"], .Post, main') ||
        null
      );
    },

    /**
     * Extracts subreddit name, post title, post body, and parent comment context
     */
    extractContext(inputEl, postContainer = null) {
      const doc = (inputEl && inputEl.ownerDocument) ? inputEl.ownerDocument : document;
      const container = postContainer || this.findPostContainer(inputEl) || doc;

      // Subreddit detection
      let subreddit = '';
      const subEl = doc.querySelector('shreddit-post[subreddit-prefixed-name], a[data-testid="subreddit-name"], a[href*="/r/"]');
      if (subEl) {
        subreddit = subEl.getAttribute('subreddit-prefixed-name') || (subEl.textContent || '').trim();
      }
      if (!subreddit && typeof window !== 'undefined') {
        const match = (window.location.pathname || '').match(/\/r\/([A-Za-z0-9_]+)/);
        if (match) subreddit = `r/${match[1]}`;
      }

      // Post title & OP author
      const postEl = doc.querySelector('shreddit-post');
      const titleEl = doc.querySelector('h1[slot="title"], [data-testid="post-title"], h1');
      const postTitle = (postEl && postEl.getAttribute('post-title')) || (titleEl ? titleEl.textContent.trim() : '');
      const postAuthor = (postEl && postEl.getAttribute('author')) || '';

      // Post body
      const postBodyEl = doc.querySelector('div[slot="text-body"], [data-testid="post-content"] p, [data-click-id="text"]');
      const postBody = postBodyEl ? postBodyEl.textContent.trim().slice(0, 1000) : '';

      // Specific parent comment if replying to a comment
      const commentNode = inputEl ? inputEl.closest('shreddit-comment, .Comment, .thing.comment') : null;
      let incomingText = '';
      let commentAuthor = '';
      let isSpecificCommentReply = false;

      if (commentNode) {
        isSpecificCommentReply = true;
        commentAuthor = commentNode.getAttribute('author') || '';
        if (!commentAuthor) {
          const authorLink = commentNode.querySelector('a[href*="/user/"], .author');
          if (authorLink) commentAuthor = authorLink.textContent.trim().replace(/^u\//, '');
        }
        const commentBodyEl = commentNode.querySelector('div[slot="comment"], [data-testid="comment"], .md');
        if (commentBodyEl) {
          incomingText = commentBodyEl.textContent.trim().slice(0, 1000);
        }
      }

      const existingDraft = (inputEl && (inputEl.value || inputEl.textContent) || '').trim();
      const postCaption = [
        subreddit ? `[Subreddit: ${subreddit}]` : '',
        postTitle ? `Title: ${postTitle}` : '',
        postBody
      ].filter(Boolean).join('\n').trim();

      const isPostCreation = typeof window !== 'undefined' && /\/submit\/?$/i.test(window.location.pathname || '');

      return {
        platform: 'reddit',
        contextType: isPostCreation ? 'post_draft' : 'comment',
        postId: postTitle || subreddit || 'reddit_thread',
        author: commentAuthor || postAuthor,
        postAuthor: postAuthor || commentAuthor,
        postCaption: postCaption || postTitle,
        incomingText: incomingText || postCaption || existingDraft,
        incomingAuthor: commentAuthor || postAuthor,
        isSpecificCommentReply,
        draftNotes: existingDraft,
        postVisuals: { description: '', thumbnailUrl: '', mediaType: 'none' },
        toneBias: 'humorous'
      };
    },

    /**
     * Inserts text into Reddit's Lexical rich-text contenteditable or markdown textarea
     */
    insertText(inputEl, text) {
      if (!inputEl || !text) return false;
      inputEl.focus();

      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        const proto = inputEl.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement && window.HTMLTextAreaElement.prototype
          : window.HTMLInputElement && window.HTMLInputElement.prototype;
        const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value') && Object.getOwnPropertyDescriptor(proto, 'value').set : null;
        if (nativeSetter) {
          nativeSetter.call(inputEl, text);
        } else {
          inputEl.value = text;
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      try {
        const selection = window.getSelection && window.getSelection();
        if (selection && document.createRange) {
          const range = document.createRange();
          range.selectNodeContents(inputEl);
          selection.removeAllRanges();
          selection.addRange(range);
        }
        const ok = document.execCommand && document.execCommand('insertText', false, text);
        if (!ok) {
          inputEl.textContent = text;
        }
        inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
        return true;
      } catch (_) {
        inputEl.textContent = text;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = RedditAdapter;
  }
  if (typeof window !== 'undefined') {
    window.RedditAdapter = RedditAdapter;
    if (window.SocialPlatformDetector && typeof window.SocialPlatformDetector.registerAdapter === 'function') {
      window.SocialPlatformDetector.registerAdapter(RedditAdapter);
    }
  }
})();

