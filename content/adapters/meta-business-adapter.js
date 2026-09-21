/**
 * InstaReply AI - Meta Business Suite Adapter
 * Handles Meta Business Suite Unified Inbox (Instagram DMs, Messenger, Instagram Comments, and Facebook Comments).
 * Supports URL: https://business.facebook.com/latest/inbox/* and https://business.meta.com/latest/inbox/*
 */

(function () {
  'use strict';

  const MetaBusinessAdapter = {
    platform: 'meta_business',

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('business.facebook.com') || target.includes('business.meta.com');
    },

    /**
     * Finds active composer input elements in Meta Business Suite
     */
    findComposerElements(root = document) {
      const selectors = [
        'div[contenteditable="true"][role="textbox"]',
        'div[data-lexical-editor="true"][contenteditable="true"]',
        'div[aria-label*="message" i][contenteditable="true"]',
        'div[aria-label*="reply" i][contenteditable="true"]',
        'div[aria-label*="comment" i][contenteditable="true"]',
        'div[aria-label*="Write a message" i]',
        'div[aria-label*="Write a reply" i]',
        'div[aria-label*="回覆" i][contenteditable="true"]',
        'div[aria-label*="訊息" i][contenteditable="true"]',
        'textarea[placeholder*="message" i]',
        'textarea[placeholder*="reply" i]',
        'textarea[aria-label*="message" i]',
        'textarea[aria-label*="reply" i]'
      ];

      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        // Exclude extension UI
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) return false;

        // Exclude search inputs and navigation
        if (el.closest('header, nav, [role="navigation"], input[type="search"]')) return false;

        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (ariaLabel.includes('search') || placeholder.includes('search')) return false;

        return el.getAttribute('contenteditable') === 'true' || el.tagName === 'TEXTAREA' || el.getAttribute('role') === 'textbox';
      });

      // Deduplicate nested elements: keep only innermost editable textbox
      return results.filter((el, idx) => {
        return !results.some((other, oIdx) => oIdx !== idx && el.contains(other));
      });
    },

    /**
     * Finds toolbar / action container adjacent to the Send button or composer tools
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Look for send button container
        const sendBtn = curr.querySelector(
          'button[aria-label*="send" i], button[type="submit"], div[role="button"][aria-label*="send" i], button[aria-label*="傳送" i], button[aria-label*="發送" i]'
        );
        if (sendBtn && sendBtn.parentElement && sendBtn.parentElement !== inputEl.parentElement) {
          return sendBtn.parentElement;
        }

        // Look for bottom tools tray (emoji, attachment, saved reply icons)
        const toolIcon = curr.querySelector(
          'button[aria-label*="emoji" i], div[aria-label*="emoji" i], button[aria-label*="attach" i], div[aria-label*="attach" i], button[aria-label*="sticker" i], button[aria-label*="saved" i], div[role="toolbar"]'
        );
        if (toolIcon && toolIcon.parentElement && toolIcon.parentElement !== inputEl.parentElement) {
          return toolIcon.parentElement;
        }

        // Look for footer
        const footer = curr.querySelector('footer, div[class*="footer"], div[role="toolbar"]');
        if (footer && footer !== inputEl.parentElement) {
          return footer;
        }

        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the actionsWrapper directly into Meta Business Suite's native composer toolbar
     */
    attachToToolbar(btn, inputEl) {
      if (!btn || !inputEl) return false;

      // Reset any DM/absolute positioning
      btn.classList.remove('instareply-dm-shortcut-btn', 'instareply-dm-actions');
      btn.style.position = 'relative';
      btn.style.top = 'auto';
      btn.style.right = 'auto';
      btn.style.transform = 'none';

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Prevent duplicate buttons in the same container
        if (curr.querySelector('.instareply-composer-actions, .instareply-shortcut-btn')) {
          const existing = curr.querySelector('.instareply-composer-actions, .instareply-shortcut-btn');
          if (existing && existing !== btn && !existing.contains(btn) && !btn.contains(existing)) {
            return true;
          }
        }

        // Priority 1: Controls row alongside Send button
        const sendBtn = curr.querySelector(
          'button[aria-label*="send" i], button[type="submit"], div[role="button"][aria-label*="send" i], button[aria-label*="傳送" i], button[aria-label*="發送" i]'
        );
        if (sendBtn && sendBtn.parentElement) {
          const parent = sendBtn.parentElement;
          parent.style.display = 'flex';
          parent.style.flexDirection = 'row';
          parent.style.alignItems = 'center';
          parent.style.gap = '8px';
          btn.style.marginRight = '8px';
          btn.style.alignSelf = 'center';
          parent.insertBefore(btn, sendBtn);
          return true;
        }

        // Priority 2: Tools tray (emoji, attachments, saved replies)
        const toolIcon = curr.querySelector(
          'button[aria-label*="emoji" i], div[aria-label*="emoji" i], button[aria-label*="attach" i], div[aria-label*="attach" i], button[aria-label*="saved" i]'
        );
        if (toolIcon && toolIcon.parentElement) {
          toolIcon.parentElement.appendChild(btn);
          return true;
        }

        // Priority 3: Footer or toolbar
        const footer = curr.querySelector('footer, div[role="toolbar"]');
        if (footer) {
          footer.appendChild(btn);
          return true;
        }

        curr = curr.parentElement;
      }

      // Safe fallback: insert beside input element
      if (inputEl.parentElement) {
        inputEl.parentElement.insertAdjacentElement('afterend', btn);
        return true;
      }

      return false;
    },

    /**
     * Extracts conversation / thread context from Meta Business Suite
     */
    extractContext(inputEl) {
      const url = (typeof window !== 'undefined' ? window.location.href : '').toLowerCase();
      const isCommentSection = url.includes('comment') ||
        Boolean(inputEl && inputEl.closest('[data-testid*="comment" i], div[aria-label*="comment" i]'));

      const contextType = isCommentSection ? 'comment' : 'dm';

      let author = '';
      let lastReceivedText = '';

      try {
        // 1. Extract contact/customer name or handle from thread header
        const headerCandidate = document.querySelector(
          '[data-testid*="thread-header" i], [data-testid*="inbox-header" i], div[role="main"] header, div[role="main"] h2, div[role="main"] h3, header h2, header span[dir="auto"]'
        );
        if (headerCandidate) {
          const rawName = headerCandidate.textContent.trim().split('\n')[0];
          if (rawName && rawName.length < 50) {
            author = rawName.replace(/^@/, '');
          }
        }

        // Fallback: Selected conversation item in the inbox thread list
        if (!author) {
          const selectedThread = document.querySelector(
            'div[aria-selected="true"] [dir="auto"], div[data-testid*="thread-row"][aria-selected="true"]'
          );
          if (selectedThread) {
            const raw = selectedThread.textContent.trim().split('\n')[0];
            if (raw && raw.length < 50) {
              author = raw.replace(/^@/, '');
            }
          }
        }

        // 2. Extract last received message or comment text
        if (isCommentSection) {
          // Find the customer's comment
          const commentContainers = document.querySelectorAll(
            'div[data-testid*="comment" i], div[aria-label*="comment" i], div[role="article"]'
          );
          if (commentContainers.length > 0) {
            const targetComment = commentContainers[commentContainers.length - 1];
            const textEl = targetComment.querySelector('div[dir="auto"], span[dir="auto"], p');
            if (textEl) {
              lastReceivedText = textEl.innerText.trim();
            }
          }
        } else {
          // Direct message thread: find message bubbles
          const messageElements = document.querySelectorAll(
            'div[role="row"] div[dir="auto"], div[data-testid*="message" i] div[dir="auto"], div[class*="message"] div[dir="auto"]'
          );

          // Traverse backwards from newest to oldest to find the last message
          for (let i = messageElements.length - 1; i >= 0; i--) {
            const el = messageElements[i];
            const text = (el.innerText || el.textContent || '').trim();
            // Filter out timestamps, system notices, and ultra-short texts
            if (
              text &&
              !text.match(/^(\d{1,2}:\d{2}|\d{1,2}\/\d{1,2}|yesterday|today|seen|delivered)/i) &&
              !el.closest('.instareply-card')
            ) {
              lastReceivedText = text;
              break;
            }
          }
        }
      } catch (err) {
        console.warn('[InstaReply] Meta Business Suite context extraction error:', err);
      }

      return {
        platform: 'meta_business',
        contextType,
        author: author || 'Customer',
        recipientName: author || 'Customer',
        lastReceivedText,
        postText: lastReceivedText || '',
        isDM: !isCommentSection
      };
    },

    /**
     * Inserts generated response text into Meta Business Suite composer
     */
    insertText(inputEl, text, mode = 'replace') {
      if (!inputEl || !text) return false;

      inputEl.focus();

      // Case A: Textarea input
      if (inputEl.tagName === 'TEXTAREA') {
        const currentVal = inputEl.value;
        const newVal = mode === 'append' ? (currentVal ? currentVal + ' ' + text : text) : text;
        inputEl.value = newVal;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
        inputEl.dispatchEvent(new Event('change', { bubbles: true }));
        return true;
      }

      // Case B: ContentEditable / Lexical Editor
      if (inputEl.getAttribute('contenteditable') === 'true' || inputEl.getAttribute('role') === 'textbox') {
        if (mode === 'replace') {
          // Select all existing content
          const range = document.createRange();
          range.selectNodeContents(inputEl);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        } else {
          // Place caret at end
          const range = document.createRange();
          range.selectNodeContents(inputEl);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }

        // Attempt execCommand insertText first (best for Lexical & Draft.js)
        let inserted = false;
        try {
          inserted = document.execCommand('insertText', false, text);
        } catch (e) {
          inserted = false;
        }

        if (!inserted) {
          try {
            inputEl.textContent = mode === 'append' ? (inputEl.textContent + ' ' + text) : text;
            inputEl.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
            inserted = true;
          } catch (e) {
            inserted = false;
          }
        }

        return inserted;
      }

      return false;
    }
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = MetaBusinessAdapter;
  }
  if (typeof window !== 'undefined') {
    window.MetaBusinessAdapter = MetaBusinessAdapter;
  }
})();
