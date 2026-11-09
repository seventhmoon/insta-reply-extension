/**
 * InstaReply AI - Google Play Reviews Adapter
 * Handles Google Play Console & Google Play Store review context extraction,
 * reply composer discovery, toolbar attachment, and 350-character limit enforcement.
 */

(function () {
  'use strict';

  const GOOGLE_PLAY_CHAR_LIMIT = 350;

  const GooglePlayAdapter = {
    platform: 'google_play',
    charLimit: GOOGLE_PLAY_CHAR_LIMIT,

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('play.google.com');
    },

    /**
     * Finds active developer reply textareas and contenteditable inputs on Google Play Console / Store
     */
    findComposerElements(root = document) {
      const selectors = [
        'textarea[aria-label*="reply" i]',
        'textarea[aria-label*="response" i]',
        'textarea[placeholder*="reply" i]',
        'textarea[placeholder*="Write a reply" i]',
        'textarea[placeholder*="Your reply" i]',
        'textarea[placeholder*="Respond" i]',
        'console-review-reply textarea',
        'review-reply textarea',
        'mat-form-field textarea',
        'material-input textarea',
        'div[class*="reply"] textarea',
        'div[role="dialog"] textarea',
        'div[contenteditable="true"][aria-label*="reply" i]',
        'div[role="textbox"][aria-label*="reply" i]',
        'textarea'
      ];

      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) return false;

        // Exclude search, filter, or app description inputs
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        const nameAttr = (el.getAttribute('name') || '').toLowerCase();
        if (
          ariaLabel.includes('search') ||
          ariaLabel.includes('filter') ||
          placeholder.includes('search') ||
          placeholder.includes('filter') ||
          nameAttr.includes('search') ||
          el.closest('header, nav, [role="search"]')
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
     * Finds the toolbar / footer action bar adjacent to the Publish / Save reply button
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Priority 1: Action footer or button bar inside the review reply editor
        const actionFooter = curr.querySelector(
          '[class*="reply-actions"], [class*="action-bar"], [class*="footer-actions"], [class*="button-bar"], [role="toolbar"]'
        );
        if (actionFooter && actionFooter !== inputEl.parentElement) {
          return actionFooter;
        }

        // Priority 2: Container holding the Publish / Save / Submit reply button
        const buttons = Array.from(curr.querySelectorAll('button, material-button, div[role="button"]'));
        const publishBtn = buttons.find(b => {
          const txt = (b.textContent || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return (
            (txt === 'publish' || txt === 'publish reply' || txt === 'save' || txt === 'reply' || txt === 'post' || txt === 'submit' ||
             aria.includes('publish') || aria.includes('submit reply')) &&
            b !== inputEl &&
            !b.closest('.instareply-shortcut-btn')
          );
        });
        if (publishBtn && publishBtn.parentElement && publishBtn.parentElement !== inputEl.parentElement) {
          return publishBtn.parentElement;
        }

        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the AI shortcut button into Google Play Console's review reply action bar
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

        // Priority 1: Action footer container
        const actionFooter = curr.querySelector(
          '[class*="reply-actions"], [class*="action-bar"], [class*="footer-actions"], [class*="button-bar"], [role="toolbar"]'
        );
        if (actionFooter) {
          actionFooter.style.display = 'flex';
          actionFooter.style.flexDirection = 'row';
          actionFooter.style.alignItems = 'center';
          actionFooter.style.gap = '8px';
          btn.style.marginRight = '8px';
          actionFooter.insertBefore(btn, actionFooter.firstChild);
          return true;
        }

        // Priority 2: Directly before the Publish / Reply / Save button
        const buttons = Array.from(curr.querySelectorAll('button, material-button, div[role="button"]'));
        const publishBtn = buttons.find(b => {
          const txt = (b.textContent || '').trim().toLowerCase();
          const aria = (b.getAttribute('aria-label') || '').toLowerCase();
          return (
            (txt === 'publish' || txt === 'publish reply' || txt === 'save' || txt === 'reply' || txt === 'post' || txt === 'submit' ||
             aria.includes('publish') || aria.includes('submit reply')) &&
            b !== inputEl &&
            !b.closest('.instareply-shortcut-btn')
          );
        });
        if (publishBtn && publishBtn.parentElement && publishBtn.parentElement !== inputEl.parentElement) {
          const parent = publishBtn.parentElement;
          parent.style.display = 'flex';
          parent.style.flexDirection = 'row';
          parent.style.alignItems = 'center';
          parent.style.gap = '8px';
          btn.style.marginRight = '8px';
          parent.insertBefore(btn, publishBtn);
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
     * Finds the enclosing review card / row container
     */
    findPostContainer(el) {
      if (!el) return null;
      return (
        el.closest(
          'console-review-row, review-card, [class*="review-card"], [class*="review-row"], [class*="review-item"], [data-review-id], article, [role="article"], [role="listitem"]'
        ) ||
        el.closest('mat-card, material-card, section') ||
        null
      );
    },

    /**
     * Extracts reviewer name from the review container
     */
    extractAuthor(reviewContainer) {
      if (!reviewContainer) return '';

      const authorEl = reviewContainer.querySelector(
        '[class*="reviewer-name"], [class*="author-name"], [class*="user-name"], [itemprop="author"], .X5PpBb, strong, [class*="author"]'
      );
      if (authorEl) {
        const text = (authorEl.textContent || '').trim();
        if (text && text.length < 60) return text;
      }

      return '';
    },

    /**
     * Extracts star rating (1 to 5 stars) from the review container
     */
    extractStarRating(reviewContainer) {
      if (!reviewContainer) return null;

      // 1. Check aria-label on rating elements (e.g., "Rated 2 stars out of five stars" or "5 stars")
      const ratingEl = reviewContainer.querySelector(
        '[aria-label*="star" i], [aria-label*="rated" i], [role="img"][aria-label*="5" i], [class*="star-rating"], [class*="rating"]'
      );
      if (ratingEl) {
        const label = ratingEl.getAttribute('aria-label') || ratingEl.textContent || '';
        const match = label.match(/([1-5])(?:\s*(?:out of|\/)\s*5|\s*stars?)/i) || label.match(/\b([1-5])\b/);
        if (match) {
          return parseInt(match[1], 10);
        }
      }

      // 2. Count filled star icons if present
      const filledStars = reviewContainer.querySelectorAll(
        '[class*="star-filled"], [class*="filled-star"], mat-icon.filled, .Z1Dz7b'
      );
      if (filledStars.length >= 1 && filledStars.length <= 5) {
        return filledStars.length;
      }

      return null;
    },

    /**
     * Extracts the user's review text and optional metadata (app version, device, Android OS)
     */
    extractReviewText(reviewContainer, inputEl = null) {
      if (!reviewContainer) return '';

      const reviewBodyEl = reviewContainer.querySelector(
        '[class*="review-text"], [class*="review-body"], [class*="review-content"], [data-testid*="review-body"], [itemprop="reviewBody"], .h3YV2d'
      );
      if (reviewBodyEl) {
        return reviewBodyEl.textContent.trim();
      }

      // Fallback: find longest meaningful text block in the review card excluding buttons and reply editor
      const candidates = Array.from(reviewContainer.querySelectorAll('p, div[dir="auto"], span[dir="auto"], div'));
      let bestText = '';
      for (const el of candidates) {
        if (inputEl && (el === inputEl || el.contains(inputEl))) continue;
        if (el.closest('button, material-button, [role="button"], [class*="reply-editor"], [class*="developer-reply"]')) continue;
        if (el.children.length > 3) continue;
        const txt = (el.textContent || '').trim();
        if (txt.length > bestText.length && txt.length < 2500) {
          bestText = txt;
        }
      }

      return bestText;
    },

    /**
     * Extracts complete Google Play Review context for developer response generation
     */
    extractContext(inputEl, reviewContainer = null) {
      const target = reviewContainer || this.findPostContainer(inputEl);
      const reviewerName = target ? this.extractAuthor(target) : '';
      const starRating = target ? this.extractStarRating(target) : null;
      const reviewText = target ? this.extractReviewText(target, inputEl) : '';
      const existingText = (inputEl?.value || inputEl?.textContent || '').trim();

      // Extract optional app version / device metadata if displayed in Play Console
      let metadataStr = '';
      if (target) {
        const metaEl = target.querySelector('[class*="review-metadata"], [class*="device-info"], [class*="version-code"]');
        if (metaEl) {
          metadataStr = metaEl.textContent.trim().replace(/\s+/g, ' ');
        }
      }

      const ratingPrefix = starRating ? `[Rating: ${starRating}/5 stars]` : '';
      const metaPrefix = metadataStr ? `[Metadata: ${metadataStr}]` : '';
      const formattedReview = [ratingPrefix, metaPrefix, reviewText].filter(Boolean).join(' ').trim();

      return {
        platform: 'google_play',
        contextType: 'comment',
        postId: target ? (target.getAttribute('data-review-id') || reviewerName || 'play_review') : 'google_play_review',
        author: reviewerName,
        postAuthor: reviewerName,
        postCaption: formattedReview || reviewText,
        incomingText: formattedReview || reviewText || existingText,
        incomingAuthor: reviewerName,
         starRating: starRating,
        draftNotes: existingText,
        postVisuals: { description: '', thumbnailUrl: '', mediaType: 'none' },
        charLimit: GOOGLE_PLAY_CHAR_LIMIT, // Strict 350-character limit for Google Play developer replies
        toneBias: 'professional'
      };
    },

    /**
     * Inserts text into Google Play Console reply composer with strict 350-character limit enforcement
     */
    insertText(inputEl, text) {
      if (!inputEl || !text) return false;
      const safeText = text.length > GOOGLE_PLAY_CHAR_LIMIT ? text.slice(0, GOOGLE_PLAY_CHAR_LIMIT) : text;
      inputEl.focus();

      if (inputEl.tagName === 'TEXTAREA' || inputEl.tagName === 'INPUT') {
        const proto = inputEl.tagName === 'TEXTAREA'
          ? window.HTMLTextAreaElement?.prototype
          : window.HTMLInputElement?.prototype;
        const nativeSetter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : null;
        if (nativeSetter) {
          nativeSetter.call(inputEl, safeText);
        } else {
          inputEl.value = safeText;
        }
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      try {
        return document.execCommand('insertText', false, safeText);
      } catch (_) {
        return false;
      }
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GooglePlayAdapter;
  }
  if (typeof window !== 'undefined') {
    window.GooglePlayAdapter = GooglePlayAdapter;
    if (window.SocialPlatformDetector && typeof window.SocialPlatformDetector.registerAdapter === 'function') {
      window.SocialPlatformDetector.registerAdapter(GooglePlayAdapter);
    }
  }
})();

