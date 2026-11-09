/**
 * InstaReply AI - YouTube & YouTube Studio Adapter
 * Handles YouTube video/Shorts comment replies, Community post comments,
 * and YouTube Studio unified comment management on youtube.com & studio.youtube.com.
 */

(function () {
  'use strict';

  const YouTubeAdapter = {
    platform: 'youtube',
    charLimit: null,

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('youtube.com') || target.includes('youtu.be');
    },

    /**
     * Finds active comment and reply composer elements on YouTube & YouTube Studio
     */
    findComposerElements(root = document) {
      const selectors = [
        'div#contenteditable-root[contenteditable="true"]',
        'ytd-commentbox div#contenteditable-root',
        'ytd-comment-simplebox-renderer div#contenteditable-root',
        'ytd-backstage-post-dialog-renderer div#contenteditable-root',
        'ytcp-comment-Creator-reply div[contenteditable="true"]',
        'ytcp-comment textarea',
        'ytcp-mention-textbox div[contenteditable="true"]',
        'iron-autogrow-textarea textarea',
        'tp-yt-iron-autogrow-textarea textarea',
        'div[contenteditable="true"][aria-label*="comment" i]',
        'div[contenteditable="true"][aria-label*="reply" i]',
        'textarea[aria-label*="comment" i]',
        'textarea[aria-label*="reply" i]',
        'textarea[placeholder*="Add a comment" i]',
        'textarea[placeholder*="Add a reply" i]',
        'textarea[placeholder*="Write a reply" i]'
      ];

      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) return false;

        // Exclude YouTube top search bar
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (
          ariaLabel.includes('search') ||
          placeholder.includes('search') ||
          el.closest('ytd-searchbox, #search-form, header, nav, [role="search"]')
        ) {
          return false;
        }

        const tag = (el.tagName || '').toUpperCase();
        const isEditable = tag === 'TEXTAREA' || el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
        return isEditable;
      });

      // Deduplicate nested elements
      return results.filter((el, idx) => {
        return !results.some((other, oIdx) => oIdx !== idx && el.contains(other));
      });
    },

    /**
     * Finds the toolbar / footer action bar adjacent to YouTube's Comment / Reply / Cancel buttons
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Priority 1: YouTube polymer commentbox footer (#footer, #buttons, .ytcp-comment-creator-reply)
        const footer = curr.querySelector(
          '#footer #buttons, #footer, #action-buttons, .action-buttons, [id="submit-button"]'
        );
        if (footer && footer !== inputEl.parentElement) {
          if (footer.id === 'submit-button' && footer.parentElement && footer.parentElement !== inputEl.parentElement) {
            return footer.parentElement;
          }
          return footer;
        }

        // Priority 2: Container holding Reply / Comment submit button
        const buttons = Array.from(curr.querySelectorAll('button, yt-button-shape, ytcp-button'));
        const submitBtn = buttons.find(b => {
          const txt = (b.textContent || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return (
            (txt === 'comment' || txt === 'reply' || txt === 'post' || aria.includes('comment') || aria.includes('reply')) &&
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
     * Attaches the AI shortcut button into YouTube's comment box footer or YouTube Studio reply bar
     */
    attachToToolbar(btn, inputEl) {
      if (!btn || !inputEl) return false;

      btn.classList.remove('instareply-dm-shortcut-btn', 'instareply-dm-actions');
      btn.style.position = 'relative';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.transform = 'none';

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        const existing = curr.querySelector('.instareply-composer-actions, .instareply-shortcut-btn');
        if (existing && existing !== btn && !existing.contains(btn) && !btn.contains(existing)) {
          return true;
        }

        // Priority 1: YouTube commentbox #buttons container (next to Cancel / Reply buttons)
        const buttonsRow = curr.querySelector('#footer #buttons, #buttons, #action-buttons, .action-buttons');
        if (buttonsRow && buttonsRow !== inputEl.parentElement) {
          buttonsRow.style.display = 'inline-flex';
          buttonsRow.style.flexDirection = 'row';
          buttonsRow.style.alignItems = 'center';
          buttonsRow.style.gap = '8px';
          btn.style.marginRight = '8px';
          buttonsRow.insertBefore(btn, buttonsRow.firstChild);
          return true;
        }

        // Priority 2: Before #submit-button
        const submitBtn = curr.querySelector('#submit-button, ytcp-button#submit-button, button[aria-label*="Reply" i], button[aria-label*="Comment" i]');
        if (submitBtn && submitBtn.parentElement && submitBtn.parentElement !== inputEl.parentElement) {
          const parent = submitBtn.parentElement;
          parent.style.display = 'flex';
          parent.style.flexDirection = 'row';
          parent.style.alignItems = 'center';
          parent.style.gap = '8px';
          btn.style.marginRight = '8px';
          parent.insertBefore(btn, submitBtn);
          return true;
        }

        curr = curr.parentElement;
      }

      if (inputEl.parentElement) {
        inputEl.parentElement.style.position = 'relative';
        inputEl.parentElement.appendChild(btn);
        return true;
      }

      return false;
    },

    /**
     * Finds the enclosing comment thread or video container
     */
    findPostContainer(el) {
      if (!el) return null;
      return (
        el.closest('ytd-comment-thread-renderer, ytd-comment-view-model, ytd-comment-renderer, ytcp-comment-thread, ytcp-comment, ytd-backstage-post-thread-renderer') ||
        el.closest('ytd-watch-flexy, ytd-reel-video-renderer, main, #content') ||
        null
      );
    },

    /**
     * Extracts the video title and channel name from the page or Studio row
     */
    extractVideoMetadata(doc = document, container = null) {
      const root = doc || document;

      // 1. Video Title (Watch page or YouTube Studio comment row)
      const titleEl = (container && container.querySelector('#video-title, .video-title, a.ytcp-comment-video-thumbnail')) ||
        root.querySelector('ytd-watch-metadata h1 yt-formatted-string, h1.ytd-watch-metadata, #title h1, .ytp-title-link');
      const videoTitle = titleEl ? titleEl.textContent.trim() : '';

      // 2. Channel Author
      const channelEl = root.querySelector('ytd-channel-name #text a, #owner #channel-name a, ytd-video-owner-renderer a.yt-simple-endpoint');
      const channelAuthor = channelEl ? channelEl.textContent.trim().replace(/^@/, '') : '';

      // 3. Video Description snippet
      const descEl = root.querySelector('ytd-text-inline-expander #attributed-snippet-text, #description-inline-expander, #description .content');
      const videoDesc = descEl ? descEl.textContent.trim().slice(0, 600) : '';

      return {
        videoTitle,
        channelAuthor,
        videoDesc
      };
    },

    /**
     * Extracts complete context for YouTube or YouTube Studio comment/reply
     */
    extractContext(inputEl, postContainer = null) {
      const doc = (inputEl && inputEl.ownerDocument) ? inputEl.ownerDocument : document;
      const target = postContainer || this.findPostContainer(inputEl);
      const videoMeta = this.extractVideoMetadata(doc, target);

      let commentAuthor = '';
      let commentText = '';

      if (target) {
        const authorEl = target.querySelector('#author-text, a#author-text, .author-text, ytcp-comment #author-name, [class*="author-name"]');
        if (authorEl) {
          commentAuthor = authorEl.textContent.trim().replace(/^@/, '');
        }

        const contentEl = target.querySelector('#content-text, yt-formatted-string#content-text, .comment-text, ytcp-comment #content-text');
        if (contentEl) {
          commentText = contentEl.textContent.trim();
        }
      }

      const existingText = (inputEl?.value || inputEl?.textContent || '').trim();
      const postCaption = [
        videoMeta.videoTitle ? `Video: ${videoMeta.videoTitle}` : '',
        videoMeta.videoDesc
      ].filter(Boolean).join('\n').trim();

      const isPostDraft = Boolean(inputEl && inputEl.closest && inputEl.closest('ytd-backstage-post-dialog-renderer'));

      return {
        platform: 'youtube',
        contextType: isPostDraft ? 'post_draft' : 'comment',
        postId: videoMeta.videoTitle || 'youtube_video',
        author: commentAuthor || videoMeta.channelAuthor,
        postAuthor: videoMeta.channelAuthor || commentAuthor,
        postCaption: postCaption || commentText,
        incomingText: commentText || postCaption || existingText,
        incomingAuthor: commentAuthor || videoMeta.channelAuthor,
        draftNotes: existingText,
        postVisuals: { description: '', thumbnailUrl: '', mediaType: 'video' },
        toneBias: 'friendly'
      };
    },

    /**
     * Inserts text into YouTube's contenteditable or Studio textarea composer
     */
    insertText(inputEl, text) {
      if (!inputEl || !text) return false;
      inputEl.focus();

      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        const proto = inputEl.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement?.prototype
          : window.HTMLInputElement?.prototype;
        const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
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
        return document.execCommand('insertText', false, text);
      } catch (_) {
        return false;
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = YouTubeAdapter;
  }
  if (typeof window !== 'undefined') {
    window.YouTubeAdapter = YouTubeAdapter;
    if (window.SocialPlatformDetector && typeof window.SocialPlatformDetector.registerAdapter === 'function') {
      window.SocialPlatformDetector.registerAdapter(YouTubeAdapter);
    }
  }
})();

