/**
 * InstaReply AI - X / Twitter Adapter
 * Handles tweet context extraction, composer discovery, post drafting, and reply injection.
 */

(function () {
  'use strict';

  const XAdapter = {
    platform: 'x',

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('twitter.com') || target.includes('x.com');
    },

    /**
     * Finds active Tweet / Reply composer input elements
     */
    findComposerElements(root = document) {
      const selectors = [
        'div[role="textbox"][data-testid^="tweetTextarea"]',
        'div[data-testid="tweetTextarea_0_label"] div[role="textbox"]',
        'div[role="textbox"][data-testid="dmComposerTextInput"]'
      ];
      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) return false;
        return el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
      });

      // Deduplicate nested elements: keep only innermost editable textbox
      return results.filter((el, idx) => {
        return !results.some((other, oIdx) => oIdx !== idx && el.contains(other));
      });
    },

    /**
     * Finds the toolbar / action container adjacent to the Tweet/Reply button.
     * Deeply traverses ancestors to locate div[data-testid="toolBar"] or the action bar.
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      // 1. Direct DM Composer handling
      if (inputEl.closest('div[data-testid="dmComposerTextInput"]') || inputEl.closest('div[data-testid="DMDrawer"]')) {
        const dmContainer = inputEl.closest('div[data-testid="DMDrawer"], div[aria-label*="Direct message" i], form') || inputEl.parentElement;
        if (dmContainer) {
          const dmSendBtn = dmContainer.querySelector('button[data-testid="dmComposerSendButton"]');
          if (dmSendBtn && dmSendBtn.parentElement) {
            return dmSendBtn.parentElement;
          }
          const dmToolbar = dmContainer.querySelector('nav, div[role="toolbar"], div[data-testid="dmComposerToolbar"]');
          if (dmToolbar) return dmToolbar;
        }
        return null;
      }

      // 2. Deep traversal to find tweet toolbar
      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const toolbar = curr.querySelector('div[data-testid="toolBar"]');
        if (toolbar) {
          // Priority A: Left-hand media/emoji icon group (best visual alignment)
          const mediaBtn = toolbar.querySelector(
            'button[data-testid="image"], button[data-testid="gifSearchButton"], button[data-testid="emojiButton"], button[data-testid="geoButton"], button[aria-label*="photo" i], button[aria-label*="media" i], button[aria-label*="emoji" i]'
          );
          if (mediaBtn) {
            const iconsGroup = mediaBtn.closest('nav, div[role="group"]') || mediaBtn.parentElement;
            if (iconsGroup) return iconsGroup;
          }
          const actionGroup = toolbar.querySelector('div[role="group"]');
          if (actionGroup) return actionGroup;

          // Priority B: Container containing Tweet / Reply button
          const tweetBtn = toolbar.querySelector('button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"]');
          if (tweetBtn && tweetBtn.parentElement) {
            return tweetBtn.parentElement;
          }
          return toolbar;
        }

        // Alternative: tweet button container outside toolbar (e.g. collapsed inline reply)
        const tweetBtn = curr.querySelector('button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"]');
        if (tweetBtn && tweetBtn.parentElement && tweetBtn.parentElement !== inputEl.parentElement) {
          return tweetBtn.parentElement;
        }

        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the actionsWrapper directly into X's native toolbar
     */
    attachToToolbar(btn, inputEl) {
      if (!btn || !inputEl) return false;

      // Reset any old position/styles
      btn.classList.remove('instareply-dm-shortcut-btn', 'instareply-dm-actions');
      btn.style.position = 'relative';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.transform = 'none';

      // 1. Direct DM Composer handling
      if (inputEl.closest('div[data-testid="dmComposerTextInput"]') || inputEl.closest('div[data-testid="DMDrawer"]')) {
        const dmContainer = inputEl.closest('div[data-testid="DMDrawer"], div[aria-label*="Direct message" i], form') || inputEl.parentElement;
        if (dmContainer) {
          if (dmContainer.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
            return true;
          }
          const dmSendBtn = dmContainer.querySelector('button[data-testid="dmComposerSendButton"]');
          if (dmSendBtn && dmSendBtn.parentElement) {
            const parent = dmSendBtn.parentElement;
            parent.style.display = 'flex';
            parent.style.flexDirection = 'row';
            parent.style.alignItems = 'center';
            btn.style.marginRight = '6px';
            parent.insertBefore(btn, dmSendBtn);
            return true;
          }
          const dmToolbar = dmContainer.querySelector('nav, div[role="toolbar"], div[data-testid="dmComposerToolbar"]');
          if (dmToolbar) {
            dmToolbar.appendChild(btn);
            return true;
          }
        }
        return false;
      }

      // 2. Tweet / Reply Composer Toolbar
      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const toolbar = curr.querySelector('div[data-testid="toolBar"]');
        if (toolbar) {
          // Prevent duplicate buttons in this toolbar
          if (toolbar.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
            return true;
          }

          // Priority 1: Place inside media/emoji action icon group on the bottom-left
          // Aligns horizontally alongside the native Photo, GIF, Poll, and Emoji buttons
          const mediaBtn = toolbar.querySelector(
            'button[data-testid="image"], button[data-testid="gifSearchButton"], button[data-testid="emojiButton"], button[data-testid="geoButton"], button[aria-label*="photo" i], button[aria-label*="media" i], button[aria-label*="emoji" i]'
          );
          if (mediaBtn) {
            const iconsGroup = mediaBtn.closest('nav, div[role="group"]') || mediaBtn.parentElement;
            if (iconsGroup) {
              iconsGroup.appendChild(btn);
              return true;
            }
          }

          const actionGroup = toolbar.querySelector('div[role="group"]');
          if (actionGroup) {
            actionGroup.appendChild(btn);
            return true;
          }

          // Priority 2: Place horizontally to the left of Reply / Post button (NEVER vertically above)
          const tweetBtn = toolbar.querySelector('button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"]');
          if (tweetBtn && tweetBtn.parentElement) {
            const parent = tweetBtn.parentElement;
            parent.style.display = 'flex';
            parent.style.flexDirection = 'row';
            parent.style.alignItems = 'center';
            parent.style.gap = '8px';
            btn.style.marginRight = '8px';
            btn.style.alignSelf = 'center';
            parent.insertBefore(btn, tweetBtn);
            return true;
          }

          toolbar.appendChild(btn);
          return true;
        }

        // Inline reply composer without div[data-testid="toolBar"] (e.g. collapsed inline reply)
        const tweetBtn = curr.querySelector('button[data-testid="tweetButtonInline"], button[data-testid="tweetButton"]');
        if (tweetBtn && tweetBtn.parentElement && tweetBtn.parentElement !== inputEl.parentElement) {
          if (tweetBtn.parentElement.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
            return true;
          }
          const parent = tweetBtn.parentElement;
          parent.style.display = 'flex';
          parent.style.flexDirection = 'row';
          parent.style.alignItems = 'center';
          parent.style.gap = '8px';
          btn.style.marginRight = '8px';
          btn.style.alignSelf = 'center';
          parent.insertBefore(btn, tweetBtn);
          return true;
        }

        curr = curr.parentElement;
      }

      return false;
    },

    /**
     * Locates the parent tweet article for context
     */
    findTweetContainer(el) {
      if (!el) return null;
      return el.closest('article[data-testid="tweet"]') ||
             el.closest('div[data-testid="cellInnerDiv"]')?.querySelector('article[data-testid="tweet"]') ||
             null;
    },

    /**
     * Extracts author information from a Tweet
     */
    extractAuthor(tweetContainer) {
      if (!tweetContainer) return '';

      const userNameEl = tweetContainer.querySelector('div[data-testid="User-Name"]');
      if (userNameEl) {
        // Try to extract @handle
        const links = userNameEl.querySelectorAll('a[role="link"]');
        for (const link of links) {
          const href = link.getAttribute('href') || '';
          if (href.startsWith('/') && !href.includes('/status/')) {
            const handle = href.replace('/', '').trim();
            if (handle) return `@${handle}`;
          }
        }
        // Fallback to text content
        const text = userNameEl.textContent || '';
        const match = text.match(/@([A-Za-z0-9_]{1,15})/);
        if (match) return match[0];
      }
      return '';
    },

    /**
     * Extracts text content of the target tweet
     */
    extractTweetText(tweetContainer) {
      if (!tweetContainer) return '';

      const tweetTextEl = tweetContainer.querySelector('div[data-testid="tweetText"]');
      if (tweetTextEl) {
        return tweetTextEl.textContent.trim();
      }
      return '';
    },

    /**
     * Extracts visual media (images, video poster) from tweet
     */
    extractVisuals(tweetContainer) {
      if (!tweetContainer) return { description: '', thumbnailUrl: '', mediaType: 'none' };

      const imgEl = tweetContainer.querySelector('div[data-testid="tweetPhoto"] img');
      if (imgEl) {
        return {
          description: imgEl.getAttribute('alt') || '',
          thumbnailUrl: imgEl.getAttribute('src') || '',
          mediaType: 'image'
        };
      }

      const videoEl = tweetContainer.querySelector('video');
      if (videoEl) {
        return {
          description: 'X / Twitter Video',
          thumbnailUrl: videoEl.getAttribute('poster') || '',
          mediaType: 'video'
        };
      }

      return { description: '', thumbnailUrl: '', mediaType: 'none' };
    },

    /**
     * Extracts complete tweet reply or post drafting context
     */
    extractContext(inputEl, tweetContainer = null) {
      const isDM = !!(inputEl?.closest?.('div[data-testid="DMDrawer"]') || inputEl?.closest?.('div[data-testid="dmComposerTextInput"]'));
      const targetTweet = tweetContainer || this.findTweetContainer(inputEl);
      const postAuthor = targetTweet ? this.extractAuthor(targetTweet) : '';
      const postCaption = targetTweet ? this.extractTweetText(targetTweet) : '';
      const postVisuals = targetTweet ? this.extractVisuals(targetTweet) : { description: '', thumbnailUrl: '', mediaType: 'none' };

      // Determine context type: DM vs Post Reply vs New Post Draft
      let contextType = 'post_reply';
      if (isDM) {
        contextType = 'dm';
      } else if (!targetTweet) {
        contextType = 'post_draft';
      }

      // Check if user already typed rough ideas/draft in the input
      const existingText = (inputEl?.textContent || inputEl?.value || '').trim();

      return {
        platform: 'x',
        contextType: contextType,
        postId: targetTweet ? (targetTweet.getAttribute('data-tweet-id') || targetTweet.id || postAuthor) : 'x_composer',
        author: postAuthor,
        postAuthor: postAuthor,
        postCaption: postCaption,
        incomingText: postCaption || existingText,
        incomingAuthor: postAuthor,
        draftNotes: existingText,
        postVisuals: postVisuals,
        charLimit: 280, // X/Twitter tweet character limit
        isDirectMessage: isDM
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = XAdapter;
  }
  if (typeof window !== 'undefined') {
    window.XAdapter = XAdapter;
  }
})();
