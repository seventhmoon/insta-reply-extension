/**
 * InstaReply AI - Facebook Adapter
 * Handles Facebook feed post context extraction, comment box discovery,
 * post drafting, and reply injection.
 */

(function () {
  'use strict';

  const FacebookAdapter = {
    platform: 'facebook',

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('facebook.com') || target.includes('fb.com');
    },

    /**
     * Finds active comment and post composer inputs on Facebook
     */
    findComposerElements(root = document) {
      const selectors = [
        'div[role="textbox"][contenteditable="true"][aria-label*="comment" i]',
        'div[role="textbox"][contenteditable="true"][aria-label*="reply" i]',
        'div[role="textbox"][contenteditable="true"][aria-label*="留言" i]',
        'div[role="textbox"][contenteditable="true"][aria-label*="回覆" i]',
        'div[role="textbox"][contenteditable="true"][aria-label*="评论" i]',
        'div[role="textbox"][contenteditable="true"][aria-label*="mind" i]',
        'form div[role="textbox"][contenteditable="true"]',
        'div[aria-label*="Write a comment" i] div[role="textbox"]',
        'div[aria-label*="Write an answer" i] div[role="textbox"]'
      ];
      return Array.from(root.querySelectorAll(selectors.join(', ')));
    },

    /**
     * Finds toolbar / action container adjacent to Facebook comment or post box
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Look for bottom icon actions container (emoji, sticker, photo icons)
        const emojiBtn = curr.querySelector(
          'div[aria-label*="emoji" i], div[aria-label*="sticker" i], div[aria-label*="photo" i], div[aria-label*="GIF" i], div[aria-label*="Attach" i], div[aria-label*="表情" i], div[aria-label*="貼圖" i], div[aria-label*="相片" i]'
        );
        if (emojiBtn && emojiBtn.parentElement && emojiBtn.parentElement !== inputEl.parentElement) {
          return emojiBtn.parentElement;
        }

        const iconTray = curr.querySelector('ul[role="presentation"], div[role="toolbar"]');
        if (iconTray && iconTray !== inputEl.parentElement) {
          return iconTray;
        }

        const bottomBar = curr.querySelector('div[aria-label*="Add to your post" i], div[data-testid="react-composer-post-button"]');
        if (bottomBar && bottomBar.parentElement && bottomBar.parentElement !== inputEl.parentElement) {
          return bottomBar.parentElement;
        }

        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the actionsWrapper directly into Facebook's native toolbars
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
        // Look for action icons (emoji, sticker, photo, GIF)
        const actionBtn = curr.querySelector(
          'div[aria-label*="emoji" i], div[aria-label*="sticker" i], div[aria-label*="photo" i], div[aria-label*="GIF" i], div[aria-label*="Attach" i], div[aria-label*="表情" i], div[aria-label*="貼圖" i], div[aria-label*="相片" i]'
        );
        if (actionBtn && actionBtn.parentElement) {
          actionBtn.parentElement.appendChild(btn);
          return true;
        }

        const iconTray = curr.querySelector('ul[role="presentation"], div[role="toolbar"]');
        if (iconTray) {
          iconTray.appendChild(btn);
          return true;
        }

        const bottomBar = curr.querySelector('div[aria-label*="Add to your post" i], div[data-testid="react-composer-post-button"]');
        if (bottomBar && bottomBar.parentElement) {
          bottomBar.parentElement.insertBefore(btn, bottomBar);
          return true;
        }

        curr = curr.parentElement;
      }

      // Safe fallback
      if (inputEl.parentElement) {
        inputEl.parentElement.insertAdjacentElement('afterend', btn);
        return true;
      }

      return false;
    },

    /**
     * Finds parent post article on Facebook
     */
    findPostContainer(el) {
      if (!el) return null;
      return el.closest('div[role="article"], div[data-pagelet*="FeedUnit"], div[role="feed"] > div') || null;
    },

    /**
     * Extracts author information from Facebook post
     */
    extractAuthor(postContainer) {
      if (!postContainer) return '';

      const authorEl = postContainer.querySelector(
        'strong span, ' +
        'h2 a, h3 a, h4 a, ' +
        'a[role="link"][tabindex="0"] strong, ' +
        'a[role="link"] > span[dir="auto"]'
      );
      if (authorEl) {
        return authorEl.textContent.trim();
      }
      return '';
    },

    /**
     * Extracts text body from Facebook post
     */
    extractPostText(postContainer) {
      if (!postContainer) return '';

      const textEls = postContainer.querySelectorAll('div[data-ad-preview="message"], div[dir="auto"]');
      for (const el of textEls) {
        // Exclude system labels or very short timestamps
        const text = el.textContent.trim();
        if (text.length > 5 && !el.closest('form') && !el.closest('div[role="toolbar"]')) {
          return text;
        }
      }
      return '';
    },

    /**
     * Extracts visuals from Facebook post
     */
    extractVisuals(postContainer) {
      if (!postContainer) return { description: '', thumbnailUrl: '', mediaType: 'none' };

      const imgEl = postContainer.querySelector('img[src*="fbcdn"], img[src*="scontent"]');
      if (imgEl && !imgEl.src.includes('profile')) {
        return {
          description: imgEl.getAttribute('alt') || 'Facebook Post Image',
          thumbnailUrl: imgEl.getAttribute('src') || '',
          mediaType: 'image'
        };
      }

      return { description: '', thumbnailUrl: '', mediaType: 'none' };
    },

    /**
     * Extracts complete context from Facebook post
     */
    extractContext(inputEl, postContainer = null) {
      const targetPost = postContainer || this.findPostContainer(inputEl);
      const postAuthor = targetPost ? this.extractAuthor(targetPost) : '';
      const postCaption = targetPost ? this.extractPostText(targetPost) : '';
      const postVisuals = targetPost ? this.extractVisuals(targetPost) : { description: '', thumbnailUrl: '', mediaType: 'none' };

      const isMind = !!inputEl?.getAttribute?.('aria-label')?.toLowerCase()?.includes('mind');
      const isDraft = isMind || !targetPost;
      const existingText = (inputEl?.textContent || inputEl?.value || '').trim();

      return {
        platform: 'facebook',
        contextType: isDraft ? 'post_draft' : 'comment',
        postId: targetPost ? (targetPost.id || postAuthor) : 'facebook_composer',
        author: postAuthor,
        postAuthor: postAuthor,
        postCaption: postCaption,
        incomingText: postCaption || existingText,
        incomingAuthor: postAuthor,
        draftNotes: existingText,
        postVisuals: postVisuals,
        toneBias: 'friendly'
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = FacebookAdapter;
  }
  if (typeof window !== 'undefined') {
    window.FacebookAdapter = FacebookAdapter;
  }
})();
