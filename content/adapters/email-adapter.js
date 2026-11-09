/**
 * InstaReply AI - Email Web Adapter (Gmail & Outlook Web)
 * Handles email thread subject/message extraction, compose body discovery,
 * formatting toolbar attachment, and reply injection on Gmail and Outlook Web.
 */

(function () {
  'use strict';

  const EmailAdapter = {
    platform: 'email',

    /**
     * Checks if this adapter can handle the given URL or hostname
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return (
        target.includes('mail.google.com') ||
        target.includes('outlook.live.com') ||
        target.includes('outlook.office.com') ||
        target.includes('outlook.office365.com')
      );
    },

    /**
     * Finds active email compose and reply bodies in Gmail and Outlook Web
     */
    findComposerElements(root = document) {
      const selectors = [
        'div[role="textbox"][aria-label*="Message Body" i]',
        'div[role="textbox"][aria-label*=" cuerpo del mensaje" i]',
        'div[role="textbox"][g_editable="true"]',
        'div.Am.Al.editable[contenteditable="true"]',
        'div[aria-label*="Message body" i][contenteditable="true"]',
        'div[aria-label*="Reply" i][contenteditable="true"]',
        'div[data-testid="rooster-editor"][contenteditable="true"]',
        'div#editorParent_1 div[contenteditable="true"]'
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
        return el.getAttribute('contenteditable') === 'true' || el.getAttribute('role') === 'textbox';
      });

      return results.filter((el, idx) => {
        return !results.some((other, oIdx) => oIdx !== idx && el.contains(other));
      });
    },

    /**
     * Finds the Send / formatting toolbar row in Gmail or Outlook compose window
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Gmail bottom send bar (.btC) or Outlook command bar
        const bar = curr.querySelector('tr.btC, td.gU.Up, [data-testid="ComposeSendButton"], [role="toolbar"]');
        if (bar && bar !== inputEl.parentElement) {
          return bar;
        }
        curr = curr.parentElement;
      }

      return null;
    },

    /**
     * Attaches the AI shortcut button cleanly into the email compose toolbar
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
        btn.style.marginLeft = '6px';
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
     * Extracts email subject, sender name, and latest thread message body
     */
    extractContext(inputEl) {
      const doc = (inputEl && inputEl.ownerDocument) ? inputEl.ownerDocument : document;

      // Subject line (Gmail h2.hP or input[name="subjectbox"], Outlook subject header)
      const subjectEl = doc.querySelector(
        'h2.hP, input[name="subjectbox"], [data-testid="subject-line"], [aria-label*="Subject" i]'
      );
      const subject = subjectEl ? (subjectEl.value || subjectEl.textContent || '').trim() : '';

      // Latest email body in thread (Gmail .a3s.aiL, Outlook [aria-label="Message body"])
      const messageEls = Array.from(
        doc.querySelectorAll('div.a3s.aiL, div.a3s, [data-test-id="mailMessageBodyContainer"], [role="region"][aria-label*="Message" i]')
      ).filter(el => el !== inputEl && !inputEl?.contains(el));

      let latestEmailBody = '';
      let senderName = '';
      if (messageEls.length > 0) {
        const lastMsg = messageEls[messageEls.length - 1];
        latestEmailBody = (lastMsg.textContent || '').trim().slice(0, 1200);

        const msgContainer = lastMsg.closest('.gs, .kv, [role="listitem"]') || doc;
        const senderEl = msgContainer.querySelector('span.gD, [data-testid="message-from"], [email]');
        if (senderEl) {
          senderName = (senderEl.getAttribute('name') || senderEl.textContent || '').trim();
        }
      }

      const existingDraft = (inputEl && (inputEl.value || inputEl.textContent) || '').trim();
      const postCaption = [
        subject ? `Subject: ${subject}` : '',
        latestEmailBody
      ].filter(Boolean).join('\n').trim();

      return {
        platform: 'email',
        contextType: latestEmailBody ? 'dm' : 'post_draft',
        postId: subject || 'email_thread',
        author: senderName,
        postAuthor: senderName,
        postCaption: postCaption || subject,
        incomingText: latestEmailBody || existingDraft || subject,
        incomingAuthor: senderName,
        isSpecificCommentReply: Boolean(latestEmailBody),
        draftNotes: existingDraft,
        postVisuals: { description: '', thumbnailUrl: '', mediaType: 'none' },
        toneBias: 'professional'
      };
    },

    /**
     * Inserts text into Gmail / Outlook contenteditable message body
     */
    insertText(inputEl, text) {
      if (!inputEl || !text) return false;
      inputEl.focus();

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
    module.exports = EmailAdapter;
  }
  if (typeof window !== 'undefined') {
    window.EmailAdapter = EmailAdapter;
    if (window.SocialPlatformDetector && typeof window.SocialPlatformDetector.registerAdapter === 'function') {
      window.SocialPlatformDetector.registerAdapter(EmailAdapter);
    }
  }
})();

