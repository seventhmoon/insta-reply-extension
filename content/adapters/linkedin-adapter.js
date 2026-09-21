/**
 * InstaReply AI - LinkedIn Adapter
 * Handles LinkedIn feed post context extraction, comment box discovery,
 * InMail messaging reply injection, and post drafting support.
 */

(function () {
  'use strict';

  const LinkedInAdapter = {
    platform: 'linkedin',

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('linkedin.com');
    },

    /**
     * Finds active comment, message, and post composer input elements on LinkedIn
     */
    findComposerElements(root = document) {
      const selectors = [
        'div.comments-comment-box div[contenteditable="true"]',
        'div.comments-comment-box div[role="textbox"]',
        'div.comments-comment-box__input div[contenteditable="true"]',
        'div.comments-comment-texteditor div[contenteditable="true"]',
        'div.ql-editor[contenteditable="true"]',
        'div.editor-content div[contenteditable="true"]',
        'div.msg-form__contenteditable[contenteditable="true"]',
        'div.share-creation-state div[contenteditable="true"]',
        'div.share-creation-state div[role="textbox"]',
        'div.share-box-v2 div[contenteditable="true"]',
        'div[data-placeholder*="What do you want to talk about" i]',
        'div[data-placeholder*="comment" i]',
        'div[data-placeholder*="留言" i]',
        'div[data-placeholder*="評論" i]',
        'div[data-placeholder*="コメント" i]',
        'div[aria-placeholder*="comment" i]',
        'div[role="textbox"][aria-label*="message" i]',
        'div[role="textbox"][aria-label*="comment" i]',
        'div[role="textbox"][aria-label*="留言" i]',
        'div[role="textbox"][aria-label*="評論" i]',
        'div[role="textbox"][aria-label*="コメント" i]',
        'form.comments-comment-box__form div[contenteditable="true"]'
      ];
      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        // Exclude our own extension inputs
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) return false;

        // Exclude search inputs and navigation
        if (
          el.closest('header, nav, [role="navigation"], .search-global-typeahead, input[role="combobox"]')
        ) return false;

        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (ariaLabel.includes('search') || placeholder.includes('search')) {
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
     * Finds toolbar / action container adjacent to LinkedIn action buttons
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      // 1. Messaging form footer: target .msg-form__left-actions (where image, gif, emoji live)
      const msgForm = inputEl.closest('.msg-form, .msg-overlay-conversation-bubble, [data-view-name*="message" i], .msg-thread');
      if (msgForm) {
        const leftActions = msgForm.querySelector('.msg-form__left-actions, div[class*="left-actions"], footer .display-flex, footer [role="toolbar"]');
        if (leftActions) return leftActions;

        const footer = msgForm.querySelector('.msg-form__footer, footer');
        if (footer) {
          const sendBtn = footer.querySelector('button.msg-form__send-button, button[type="submit"]');
          if (sendBtn && sendBtn.parentElement) {
            return sendBtn.parentElement;
          }
          return footer;
        }
      }

      // 2. Feed comment box: target submit button controls or action toolbar
      const commentBox = inputEl.closest('.comments-comment-box, .comments-comment-box__form-container, .feed-shared-update-v2, form');
      if (commentBox) {
        // Priority A: Controls row alongside Submit / Comment button
        const submitBtn = commentBox.querySelector('button.comments-comment-box__submit-button, button[type="submit"]');
        if (submitBtn && submitBtn.parentElement) {
          return submitBtn.parentElement;
        }

        const controlsRow = commentBox.querySelector(
          '.comments-comment-box__controls, .comments-comment-box__button-group, .comments-comment-box__tools, .comments-comment-box__buttons, .comments-comment-box__actions'
        );
        if (controlsRow) return controlsRow;

        // Priority B: Action button icons (emoji, GIF, photo)
        const toolIcon = commentBox.querySelector(
          'button[aria-label*="emoji" i], button[aria-label*="GIF" i], button[aria-label*="image" i], button[aria-label*="photo" i], svg[data-test-icon*="emoji" i], button[aria-label*="表情" i], button[aria-label*="圖片" i], button[aria-label*="絵文字" i]'
        );
        if (toolIcon) {
          const container = toolIcon.tagName === 'BUTTON' ? toolIcon.parentElement : toolIcon.closest('button')?.parentElement;
          if (container) return container;
        }

        const formContainer = commentBox.querySelector('.comments-comment-box__form-container, .comments-comment-texteditor');
        if (formContainer) return formContainer;
      }

      // 3. "Start a post" share creation modal
      const shareModal = inputEl.closest('.share-creation-state, .share-box-v2, .share-box, div[role="dialog"]');
      if (shareModal) {
        const postBtn = shareModal.querySelector('button.share-actions__primary-action, button.share-box_actions__primary-action, button[type="submit"]');
        if (postBtn && postBtn.parentElement) {
          return postBtn.parentElement;
        }

        const bottomBar = shareModal.querySelector(
          '.share-creation-state__bottom-bar, .share-box_actions, .share-box__footer, div[class*="bottom-bar"]'
        );
        if (bottomBar) return bottomBar;
      }

      return null;
    },

    /**
     * Attaches the actionsWrapper directly into LinkedIn's native toolbars
     */
    attachToToolbar(btn, inputEl) {
      if (!btn || !inputEl) return false;

      // Reset any DM/absolute positioning
      btn.classList.remove('instareply-dm-shortcut-btn', 'instareply-dm-actions');
      btn.style.position = 'relative';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.transform = 'none';

      // 1. Messaging form footer
      const msgForm = inputEl.closest('.msg-form, .msg-overlay-conversation-bubble, [data-view-name*="message" i], .msg-thread');
      if (msgForm) {
        if (msgForm.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
          const existing = msgForm.querySelector('.instareply-composer-actions, .instareply-shortcut-btn');
          if (existing && existing !== btn && !existing.contains(btn) && !btn.contains(existing)) {
            return true;
          }
        }

        const leftActions = msgForm.querySelector('.msg-form__left-actions, div[class*="left-actions"], footer .display-flex, footer [role="toolbar"]');
        if (leftActions) {
          leftActions.appendChild(btn);
          return true;
        }
        const footer = msgForm.querySelector('.msg-form__footer, footer');
        if (footer) {
          const sendBtn = footer.querySelector('button.msg-form__send-button, button[type="submit"]');
          if (sendBtn && sendBtn.parentElement) {
            const parent = sendBtn.parentElement;
            parent.style.display = 'flex';
            parent.style.flexDirection = 'row';
            parent.style.alignItems = 'center';
            btn.style.marginRight = '6px';
            parent.insertBefore(btn, sendBtn);
            return true;
          }
          footer.appendChild(btn);
          return true;
        }
      }

      // 2. Feed comment box
      const commentBox = inputEl.closest('.comments-comment-box, .comments-comment-box__form-container, .feed-shared-update-v2, form');
      if (commentBox) {
        if (commentBox.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
          const existing = commentBox.querySelector('.instareply-composer-actions, .instareply-shortcut-btn');
          if (existing && existing !== btn && !existing.contains(btn) && !btn.contains(existing)) {
            return true;
          }
        }

        // Priority A: Controls row alongside Submit / Comment button
        const submitBtn = commentBox.querySelector('button.comments-comment-box__submit-button, button[type="submit"]');
        if (submitBtn && submitBtn.parentElement) {
          const parent = submitBtn.parentElement;
          parent.style.display = 'flex';
          parent.style.flexDirection = 'row';
          parent.style.alignItems = 'center';
          parent.style.gap = '8px';
          btn.style.marginRight = '8px';
          btn.style.alignSelf = 'center';
          parent.insertBefore(btn, submitBtn);
          return true;
        }

        const buttonGroup = commentBox.querySelector(
          '.comments-comment-box__controls, .comments-comment-box__button-group, .comments-comment-box__tools, .comments-comment-box__buttons, .comments-comment-box__actions, [role="toolbar"]'
        );
        if (buttonGroup) {
          buttonGroup.style.display = 'flex';
          buttonGroup.style.alignItems = 'center';
          buttonGroup.appendChild(btn);
          return true;
        }

        // Priority B: Action tool icon container (media/emoji)
        const toolIcon = commentBox.querySelector(
          'button[aria-label*="emoji" i], button[aria-label*="GIF" i], button[aria-label*="image" i], button[aria-label*="photo" i], svg[data-test-icon*="emoji" i], button[aria-label*="表情" i], button[aria-label*="圖片" i], button[aria-label*="絵文字" i]'
        );
        if (toolIcon) {
          const btnParent = toolIcon.tagName === 'BUTTON' ? toolIcon.parentElement : toolIcon.closest('button')?.parentElement;
          if (btnParent) {
            btnParent.appendChild(btn);
            return true;
          }
        }

        const formContainer = commentBox.querySelector('.comments-comment-box__controls, .comments-comment-texteditor, form');
        if (formContainer) {
          formContainer.style.position = 'relative';
          formContainer.appendChild(btn);
          return true;
        }
      }

      // 3. Share creation modal ("Start a post")
      const shareModal = inputEl.closest('.share-creation-state, .share-box-v2, .share-box, div[role="dialog"]');
      if (shareModal) {
        if (shareModal.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
          const existing = shareModal.querySelector('.instareply-composer-actions, .instareply-shortcut-btn');
          if (existing && existing !== btn && !existing.contains(btn) && !btn.contains(existing)) {
            return true;
          }
        }

        const postBtn = shareModal.querySelector('button.share-actions__primary-action, button.share-box_actions__primary-action, button[type="submit"]');
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

        const bottomBar = shareModal.querySelector(
          '.share-creation-state__bottom-bar, .share-box_actions, .share-box__footer, div[class*="bottom-bar"]'
        );
        if (bottomBar) {
          bottomBar.appendChild(btn);
          return true;
        }
      }

      // 4. Safe fallback outside input
      if (inputEl.parentElement) {
        inputEl.parentElement.style.position = 'relative';
        inputEl.parentElement.appendChild(btn);
        return true;
      }

      return false;
    },

    /**
     * Finds parent feed post container on LinkedIn
     */
    findPostContainer(el) {
      if (!el) return null;
      return el.closest('div.feed-shared-update-v2, div[data-urn*="activity"], div.occludable-update, article') || null;
    },

    /**
     * Extracts author information from LinkedIn post
     */
    extractAuthor(postContainer) {
      if (!postContainer) return '';

      const nameEl = postContainer.querySelector(
        '.update-components-actor__name span[aria-hidden="true"], ' +
        '.feed-shared-actor__name span[aria-hidden="true"], ' +
        '.update-components-actor__name, ' +
        '.feed-shared-actor__name, ' +
        '.comments-post-meta__name-text'
      );
      if (nameEl) {
        return nameEl.textContent.trim();
      }
      return '';
    },

    /**
     * Extracts text description / post body from LinkedIn post
     */
    extractPostText(postContainer) {
      if (!postContainer) return '';

      const textEl = postContainer.querySelector(
        '.feed-shared-update-v2__description, ' +
        '.update-components-text, ' +
        '.feed-shared-inline-show-more-text, ' +
        '.comments-comment-item__main-content'
      );
      if (textEl) {
        return textEl.textContent.trim();
      }
      return '';
    },

    /**
     * Extracts media or visual content from LinkedIn post
     */
    extractVisuals(postContainer) {
      if (!postContainer) return { description: '', thumbnailUrl: '', mediaType: 'none' };

      const imgEl = postContainer.querySelector(
        '.feed-shared-image__image, ' +
        '.update-components-image__image, ' +
        '.feed-shared-article__image img'
      );
      if (imgEl) {
        return {
          description: imgEl.getAttribute('alt') || 'LinkedIn Post Image',
          thumbnailUrl: imgEl.getAttribute('src') || '',
          mediaType: 'image'
        };
      }

      return { description: '', thumbnailUrl: '', mediaType: 'none' };
    },

    /**
     * Extracts complete context from LinkedIn post, comment, message, or draft
     */
    extractContext(inputEl, postContainer = null) {
      const isMessaging = !!(inputEl?.closest?.('.msg-form') || inputEl?.closest?.('.msg-overlay-conversation-bubble'));
      const isShareModal = !!(inputEl?.closest?.('.share-creation-state') || inputEl?.closest?.('.share-box'));
      const targetPost = postContainer || this.findPostContainer(inputEl);
      const postAuthor = targetPost ? this.extractAuthor(targetPost) : '';
      const postCaption = targetPost ? this.extractPostText(targetPost) : '';
      const postVisuals = targetPost ? this.extractVisuals(targetPost) : { description: '', thumbnailUrl: '', mediaType: 'none' };

      // Determine context type
      let contextType = 'comment';
      if (isMessaging) {
        contextType = 'dm';
      } else if (isShareModal || (!targetPost && !inputEl?.closest?.('.comments-comment-box'))) {
        contextType = 'post_draft';
      }

      const existingText = (inputEl?.textContent || inputEl?.value || '').trim();

      return {
        platform: 'linkedin',
        contextType: contextType,
        postId: targetPost ? (targetPost.getAttribute('data-urn') || targetPost.id || postAuthor) : 'linkedin_composer',
        author: postAuthor,
        postAuthor: postAuthor,
        postCaption: postCaption,
        incomingText: postCaption || existingText,
        incomingAuthor: postAuthor,
        draftNotes: existingText,
        postVisuals: postVisuals,
        toneBias: 'professional',
        isDirectMessage: isMessaging
      };
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = LinkedInAdapter;
  }
  if (typeof window !== 'undefined') {
    window.LinkedInAdapter = LinkedInAdapter;
  }
})();
