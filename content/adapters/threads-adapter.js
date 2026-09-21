/**
 * InstaReply AI - Meta Threads Adapter
 * Handles Threads context extraction, composer discovery, post drafting,
 * and reply injection on threads.net.
 */

(function () {
  'use strict';

  const ThreadsAdapter = {
    platform: 'threads',

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('threads.net') || target.includes('threads.com');
    },

    /**
     * Finds active comment and post composer inputs on Threads
     */
    findComposerElements(root = document) {
      const selectors = [
        'div[data-lexical-editor="true"][contenteditable="true"]',
        'div[role="textbox"][contenteditable="true"]',
        'div[contenteditable="true"][aria-label*="thread" i]',
        'div[contenteditable="true"][aria-label*="reply" i]',
        'div[contenteditable="true"][aria-placeholder*="thread" i]',
        'div[contenteditable="true"][aria-placeholder*="reply" i]',
        'div[contenteditable="true"][data-placeholder*="thread" i]',
        'div[contenteditable="true"][data-placeholder*="reply" i]',
        'div[role="dialog"] div[contenteditable="true"]',
        'div[data-pressable-container="true"] div[contenteditable="true"]',
        'form div[contenteditable="true"]',
        'div[contenteditable="true"]'
      ];
      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        // Exclude our own extension inputs
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) return false;

        // Exclude search inputs
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (ariaLabel.includes('search') || placeholder.includes('search') || el.closest('input[type="search"], form[role="search"]')) {
          return false;
        }

        const isEditable = el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
        return isEditable;
      });

      // Deduplicate nested elements: keep only innermost editable textbox
      return results.filter((el, idx) => {
        return !results.some((other, oIdx) => oIdx !== idx && el.contains(other));
      });
    },

    /**
     * Finds toolbar / action container adjacent to Threads composer
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Priority A: Action icons bar containing attachment/media/GIF/poll icons
        const mediaIcon = curr.querySelector(
          'svg[aria-label*="Attach" i], svg[aria-label*="media" i], svg[aria-label*="GIF" i], svg[aria-label*="poll" i], svg[aria-label*="photo" i], svg[aria-label*="image" i], svg[aria-label*="相片" i], svg[aria-label*="附件" i], svg[aria-label*="メディア" i]'
        );
        if (mediaIcon) {
          const iconBtn = mediaIcon.closest('div[role="button"], div[tabindex="0"], button');
          if (iconBtn && iconBtn.parentElement && iconBtn.parentElement !== inputEl.parentElement) {
            return iconBtn.parentElement;
          }
        }

        // Priority B: Role toolbar
        const toolbar = curr.querySelector('div[role="toolbar"]');
        if (toolbar && toolbar !== inputEl.parentElement) {
          return toolbar;
        }

        // Priority C: Container holding Post / Reply button
        const buttons = Array.from(curr.querySelectorAll('div[role="button"], button'));
        const postBtn = buttons.find(b => {
          const txt = (b.textContent || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return (
            txt === 'post' || txt === 'reply' || txt === '發佈' || txt === '回覆' || txt === '投稿' || txt === '返信' ||
            aria.includes('post') || aria.includes('reply')
          ) && b !== inputEl && !b.closest('.instareply-shortcut-btn');
        });
        if (postBtn && postBtn.parentElement && postBtn.parentElement !== inputEl.parentElement) {
          return postBtn.parentElement;
        }

        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the actionsWrapper directly into Threads native toolbar
     */
    attachToToolbar(btn, inputEl) {
      if (!btn || !inputEl) return false;

      // Reset any old position/styles
      btn.classList.remove('instareply-dm-shortcut-btn', 'instareply-dm-actions');
      btn.style.position = 'relative';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.transform = 'none';

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Prevent duplicate attachment in this container
        if (curr.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
          const existing = curr.querySelector('.instareply-composer-actions, .instareply-shortcut-btn');
          if (existing && existing !== btn && !existing.contains(btn) && !btn.contains(existing)) {
            return true;
          }
        }

        // 1. Attach alongside media/GIF/poll action icons (bottom toolbar)
        const mediaIcon = curr.querySelector(
          'svg[aria-label*="Attach" i], svg[aria-label*="media" i], svg[aria-label*="GIF" i], svg[aria-label*="poll" i], svg[aria-label*="photo" i], svg[aria-label*="image" i], svg[aria-label*="相片" i], svg[aria-label*="附件" i], svg[aria-label*="メディア" i]'
        );
        if (mediaIcon) {
          const iconBtn = mediaIcon.closest('div[role="button"], div[tabindex="0"], button');
          if (iconBtn && iconBtn.parentElement) {
            iconBtn.parentElement.appendChild(btn);
            return true;
          }
        }

        // 2. Attach in role="toolbar" if present
        const toolbar = curr.querySelector('div[role="toolbar"]');
        if (toolbar) {
          toolbar.appendChild(btn);
          return true;
        }

        // 3. Attach adjacent to Post / Reply button on a horizontal flex row
        const buttons = Array.from(curr.querySelectorAll('div[role="button"], button'));
        const postBtn = buttons.find(b => {
          const txt = (b.textContent || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return (
            txt === 'post' || txt === 'reply' || txt === '發佈' || txt === '回覆' || txt === '投稿' || txt === '返信' ||
            aria.includes('post') || aria.includes('reply')
          ) && b !== inputEl && !b.closest('.instareply-shortcut-btn');
        });
        if (postBtn && postBtn.parentElement) {
          const parent = postBtn.parentElement;
          parent.style.display = 'flex';
          parent.style.flexDirection = 'row';
          parent.style.alignItems = 'center';
          parent.style.gap = '8px';
          btn.style.marginRight = '8px';
          btn.style.alignSelf = 'center';
          parent.insertBefore(btn, postBtn);
          return true;
        }

        curr = curr.parentElement;
      }

      // Safe fallback: append into inputEl's parent container
      if (inputEl.parentElement) {
        inputEl.parentElement.style.position = 'relative';
        inputEl.parentElement.appendChild(btn);
        return true;
      }

      return false;
    },

    /**
     * Finds parent thread item container on Threads
     */
    findThreadContainer(el) {
      if (!el) return null;
      return el.closest('div[data-pressable-container="true"], div[role="article"], article') || null;
    },

    /**
     * Extracts author handle from Threads post container
     */
    extractAuthor(threadContainer) {
      if (!threadContainer) return '';

      const authorLink = threadContainer.querySelector('a[href*="/@"]');
      if (authorLink) {
        const href = authorLink.getAttribute('href') || '';
        const match = href.match(/@([a-zA-Z0-9._]+)/);
        if (match) return `@${match[1]}`;
        const text = authorLink.textContent.trim();
        if (text) return text.startsWith('@') ? text : `@${text}`;
      }

      const text = threadContainer.textContent || '';
      const handleMatch = text.match(/@([a-zA-Z0-9._]+)/);
      if (handleMatch) return `@${handleMatch[1]}`;

      return '';
    },

    /**
     * Extracts text content of target Thread post
     */
    extractPostText(threadContainer) {
      if (!threadContainer) return '';

      const textEls = threadContainer.querySelectorAll('div[dir="auto"], span[dir="auto"]');
      for (const el of textEls) {
        const text = el.textContent.trim();
        if (text.length > 5 && !el.closest('a[href*="/@"]') && !el.closest('div[role="button"]')) {
          return text;
        }
      }
      return '';
    },

    /**
     * Extracts visuals (images or video) from Threads post
     */
    extractVisuals(threadContainer) {
      if (!threadContainer) return { description: '', thumbnailUrl: '', mediaType: 'none' };

      const imgEl = threadContainer.querySelector('img[src*="cdninstagram"], img[src*="fbcdn"]');
      if (imgEl && !imgEl.src.includes('profile')) {
        return {
          description: imgEl.getAttribute('alt') || 'Threads Post Image',
          thumbnailUrl: imgEl.getAttribute('src') || '',
          mediaType: 'image'
        };
      }

      const videoEl = threadContainer.querySelector('video');
      if (videoEl) {
        return {
          description: 'Threads Video',
          thumbnailUrl: videoEl.getAttribute('poster') || '',
          mediaType: 'video'
        };
      }

      return { description: '', thumbnailUrl: '', mediaType: 'none' };
    },

    /**
     * Extracts complete context from active Threads post or composer
     */
    extractContext(inputEl, threadContainer = null) {
      const target = threadContainer || this.findThreadContainer(inputEl);
      const postAuthor = target ? this.extractAuthor(target) : '';
      const postCaption = target ? this.extractPostText(target) : '';
      const postVisuals = target ? this.extractVisuals(target) : { description: '', thumbnailUrl: '', mediaType: 'none' };

      const isDraft = !target;
      const existingText = (inputEl?.textContent || inputEl?.value || '').trim();

      return {
        platform: 'threads',
        contextType: isDraft ? 'post_draft' : 'comment',
        postId: target ? (target.getAttribute('data-thread-id') || postAuthor) : 'threads_composer',
        author: postAuthor,
        postAuthor: postAuthor,
        postCaption: postCaption,
        incomingText: postCaption || existingText,
        incomingAuthor: postAuthor,
        draftNotes: existingText,
        postVisuals: postVisuals,
        charLimit: 500, // Threads has a 500-character limit
        toneBias: 'conversational'
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = ThreadsAdapter;
  }
  if (typeof window !== 'undefined') {
    window.ThreadsAdapter = ThreadsAdapter;
  }
})();
