/**
 * InstaReply AI - Community & Maker Platforms Adapter (Hacker News, Product Hunt, Substack)
 * Handles discussion context extraction, comment composer discovery,
 * toolbar attachment, and reply injection across news.ycombinator.com, producthunt.com, and substack.com.
 */

(function () {
  'use strict';

  const CommunityAdapter = {
    platform: 'community',

    /**
     * Checks if this adapter can handle the given URL or hostname
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return (
        target.includes('news.ycombinator.com') ||
        target.includes('producthunt.com') ||
        target.includes('substack.com')
      );
    },

    /**
     * Finds active comment and discussion composers on Hacker News, Product Hunt, and Substack
     */
    findComposerElements(root = document) {
      const selectors = [
        'textarea[name="text"]',
        'textarea[placeholder*="What do you think" i]',
        'textarea[placeholder*="Write a comment" i]',
        'textarea[placeholder*="Leave a comment" i]',
        'div.ProseMirror[contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][aria-label*="comment" i]'
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
        const tag = (el.tagName || '').toUpperCase();
        return tag === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
      });

      return results.filter((el, idx) => {
        return !results.some((other, oIdx) => oIdx !== idx && el.contains(other));
      });
    },

    /**
     * Finds the submit button or toolbar container near the composer
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const submitBtn = curr.querySelector('input[type="submit"], button[type="submit"]');
        if (submitBtn && submitBtn.parentElement) {
          return submitBtn.parentElement;
        }
        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the AI shortcut button cleanly near the submit button
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
        btn.style.marginLeft = '8px';
        toolbar.appendChild(btn);
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
     * Extracts discussion title, parent comment, and author across HN, Product Hunt, and Substack
     */
    extractContext(inputEl) {
      const doc = (inputEl && inputEl.ownerDocument) ? inputEl.ownerDocument : document;

      // Title (HN .titleline, PH/Substack h1)
      const titleEl = doc.querySelector('.titleline a, td.title a, h1.post-title, h1');
      const title = titleEl ? titleEl.textContent.trim() : (doc.title || '');

      // Parent comment or article body (HN .commtext, .toptext; PH/Substack article/comment body)
      const commentEl = doc.querySelector('.commtext, .toptext, [data-test="comment-body"], .comment-body, article p');
      const incomingText = commentEl ? commentEl.textContent.trim().slice(0, 1200) : '';

      // Author (HN .hnuser, PH/Substack author link)
      const authorEl = doc.querySelector('.hnuser, a[href*="/@"], .author-name');
      const author = authorEl ? authorEl.textContent.trim().replace(/^@/, '') : '';

      const existingDraft = (inputEl && (inputEl.value || inputEl.textContent) || '').trim();
      const postCaption = [
        title ? `Discussion: ${title}` : '',
        incomingText
      ].filter(Boolean).join('\n').trim();

      return {
        platform: 'community',
        contextType: 'comment',
        postId: title || 'community_thread',
        author,
        postAuthor: author,
        postCaption: postCaption || title,
        incomingText: incomingText || existingDraft || title,
        incomingAuthor: author,
        isSpecificCommentReply: Boolean(incomingText),
        draftNotes: existingDraft,
        postVisuals: { description: '', thumbnailUrl: '', mediaType: 'none' },
        toneBias: 'geek'
      };
    },

    /**
     * Inserts text into textarea or contenteditable composer
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
        const ok = document.execCommand && document.execCommand('insertText', false, text);
        if (!ok) {
          inputEl.textContent = text;
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
      } catch (_) {
        inputEl.textContent = text;
        return true;
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = CommunityAdapter;
  }
  if (typeof window !== 'undefined') {
    window.CommunityAdapter = CommunityAdapter;
    if (window.SocialPlatformDetector && typeof window.SocialPlatformDetector.registerAdapter === 'function') {
      window.SocialPlatformDetector.registerAdapter(CommunityAdapter);
    }
  }
})();

