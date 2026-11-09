/**
 * InstaReply AI - GitHub Issues / Pull Requests / Discussions Adapter
 * Handles issue/PR thread context extraction, markdown composer discovery,
 * toolbar attachment, and reply injection on github.com.
 */

(function () {
  'use strict';

  const GitHubAdapter = {
    platform: 'github',

    /**
     * Checks if this adapter can handle the given URL or document
     */
    canHandle(urlOrHostname) {
      const target = (urlOrHostname || (typeof window !== 'undefined' ? window.location.hostname : '')).toLowerCase();
      return target.includes('github.com');
    },

    /**
     * Finds active comment, issue, PR review, and discussion markdown composers on GitHub
     */
    findComposerElements(root = document) {
      const selectors = [
        'textarea#new_comment_field',
        'textarea[name="comment[body]"]',
        'textarea[name="issue[body]"]',
        'textarea[name="pull_request[body]"]',
        'textarea[name="pull_request_review[body]"]',
        'textarea[name="discussion[body]"]',
        'textarea.js-comment-field',
        'textarea.CommentBox-input',
        'div[data-testid="markdown-editor"] textarea',
        'textarea[aria-label*="comment" i]',
        'textarea[aria-label*="Add your comment" i]',
        'textarea[aria-label*="Markdown value" i]',
        'textarea[placeholder*="Leave a comment" i]',
        'textarea[placeholder*="Add your comment" i]',
        'textarea[placeholder*="Write a comment" i]',
        'textarea[placeholder*="Add a description" i]',
        'div[contenteditable="true"][aria-label*="comment" i]',
        'div[role="textbox"][aria-label*="comment" i]'
      ];

      const results = Array.from(root.querySelectorAll(selectors.join(', '))).filter(el => {
        if (
          el.closest('.instareply-card-overlay') ||
          el.closest('.instareply-card') ||
          el.classList.contains('instareply-textarea') ||
          el.id === 'instareply-output-text'
        ) return false;

        // Exclude search bars or header inputs
        const ariaLabel = (el.getAttribute('aria-label') || '').toLowerCase();
        const placeholder = (el.getAttribute('placeholder') || '').toLowerCase();
        if (
          ariaLabel.includes('search') ||
          placeholder.includes('search') ||
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
     * Finds the toolbar or form actions bar associated with the GitHub markdown composer
     */
    findToolbarContainer(inputEl) {
      if (!inputEl) return null;

      let curr = inputEl;
      while (curr && curr !== document.body && curr !== document.documentElement) {
        // Priority 1: Form actions footer (Comment / Close issue / Submit buttons)
        const formActions = curr.querySelector(
          '.form-actions, [data-testid="markdown-editor-footer"], [class*="CommentBox-actions"], [class*="ActionBar"]'
        );
        if (formActions && formActions !== inputEl.parentElement) {
          return formActions;
        }

        // Priority 2: Markdown formatting toolbar
        const mdToolbar = curr.querySelector(
          'markdown-toolbar, [role="toolbar"], [data-testid="markdown-toolbar"]'
        );
        if (mdToolbar && mdToolbar !== inputEl.parentElement) {
          return mdToolbar;
        }

        // Priority 3: Submit / Comment button container
        const buttons = Array.from(curr.querySelectorAll('button, input[type="submit"]'));
        const submitBtn = buttons.find(b => {
          const txt = (b.textContent || b.value || '').trim().toLowerCase();
          return (
            (txt === 'comment' || txt === 'submit new issue' || txt === 'create pull request' || txt === 'reply' || txt.includes('comment')) &&
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
     * Attaches the AI shortcut button cleanly into GitHub's native markdown toolbar or form-actions bar
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

        // Priority 1: Classic or React form actions bar alongside "Comment" / "Close with comment" button
        const formActions = curr.querySelector(
          '.form-actions, [data-testid="markdown-editor-footer"], [class*="CommentBox-actions"]'
        );
        if (formActions) {
          formActions.style.display = 'flex';
          formActions.style.flexDirection = 'row';
          formActions.style.alignItems = 'center';
          formActions.style.gap = '8px';
          btn.style.marginRight = '8px';
          formActions.insertBefore(btn, formActions.firstChild);
          return true;
        }

        // Priority 2: Markdown toolbar header
        const mdToolbar = curr.querySelector(
          'markdown-toolbar, [role="toolbar"], [data-testid="markdown-toolbar"]'
        );
        if (mdToolbar) {
          mdToolbar.style.display = ' inline-flex';
          mdToolbar.style.alignItems = 'center';
          btn.style.marginLeft = '6px';
          mdToolbar.appendChild(btn);
          return true;
        }

        // Priority 3: Directly before Comment / Reply submit button
        const buttons = Array.from(curr.querySelectorAll('button[type="submit"], button.btn-primary, button[data-variant="primary"]'));
        const submitBtn = buttons.find(b => !b.closest('.instareply-shortcut-btn') && b !== inputEl);
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
     * Finds the enclosing comment timeline item or issue/PR discussion thread container
     */
    findPostContainer(el) {
      if (!el) return null;
      return (
        el.closest('.js-timeline-item, .timeline-comment-group, .review-thread-component, [data-testid="comment-viewer-outer-box"]') ||
        el.closest('#discussion_bucket, .js-issues-results, [data-testid="issue-viewer-container"], main') ||
        null
      );
    },

    /**
     * Extracts the issue/PR creator or specific comment author
     */
    extractAuthor(container = document) {
      const root = container || document;

      // Check for author inside specific container first
      const authorEl = root.querySelector(
        '.author, a[data-testid="issue-body-header-author"], a[data-testid="avatar-link"], a[data-hovercard-type="user"]'
      );
      if (authorEl) {
        const text = (authorEl.textContent || '').trim().replace(/^@/, '');
        if (text) return text;
      }

      return '';
    },

    /**
     * Extracts the Issue / PR title from the page
     */
    extractIssueTitle(doc = document) {
      const root = doc || document;
      const titleEl = root.querySelector(
        '.js-issue-title, [data-testid="issue-title"], bdi.markdown-title, h1 .markdown-title, h1[data-testid="issue-header-title"]'
      );
      return titleEl ? titleEl.textContent.trim() : '';
    },

    /**
     * Extracts the original Issue / PR description body and recent thread comments
     */
    extractIssueThreadContext(inputEl, container = null) {
      const doc = (inputEl && inputEl.ownerDocument) ? inputEl.ownerDocument : document;
      const issueTitle = this.extractIssueTitle(doc);

      // 1. Original issue / PR body
      const firstBodyEl = doc.querySelector(
        '[data-testid="issue-body"] .markdown-body, .js-command-palette-issue-body .comment-body, #discussion_bucket .js-comment-body, .comment-body.markdown-body'
      );
      const firstBodyText = firstBodyEl ? firstBodyEl.textContent.trim().slice(0, 1200) : '';

      // 2. Original issue author
      const issueAuthorEl = doc.querySelector(
        '[data-testid="issue-body-header-author"], #discussion_bucket .author, .gh-header-meta .author, .author'
      );
      const issueAuthor = issueAuthorEl ? issueAuthorEl.textContent.trim().replace(/^@/, '') : '';

      // 3. Check if replying inside an inline review thread or specific comment
      const inlineThread = inputEl ? inputEl.closest('.review-thread-component, .js-inline-comments-container, .discussion-nested-comment-group') : null;
      let latestCommentText = '';
      let latestCommentAuthor = '';

      const commentScope = inlineThread || (container && container !== doc.body ? container : doc);
      const allComments = Array.from(
        commentScope.querySelectorAll('.js-comment-body, .comment-body, [data-testid="comment-body"], .markdown-body')
      ).filter(el => {
        // Ignore preview tabs inside composer
        return !el.closest('.js-preview-panel, [data-testid="markdown-preview"]');
      });

      if (allComments.length > 0) {
        const lastCommentEl = allComments[allComments.length - 1];
        latestCommentText = lastCommentEl.textContent.trim().slice(0, 1000);

        const commentWrapper = lastCommentEl.closest('.timeline-comment, .js-timeline-item, [data-testid="comment-viewer-outer-box"], .review-comment');
        if (commentWrapper) {
          const cAuthor = commentWrapper.querySelector('.author, a[data-hovercard-type="user"], a[data-testid="avatar-link"]');
          if (cAuthor) {
            latestCommentAuthor = cAuthor.textContent.trim().replace(/^@/, '');
          }
        }
      }

      // 4. Labels / metadata (bug, enhancement, question, etc.)
      const labelEls = Array.from(doc.querySelectorAll('.js-issue-labels .IssueLabel, [data-testid="issue-labels"] span'));
      const labels = labelEls.map(l => l.textContent.trim()).filter(Boolean).slice(0, 5);
      const labelPrefix = labels.length > 0 ? `[Labels: ${labels.join(', ')}] ` : '';

      const combinedCaption = [
        issueTitle ? `Issue: ${issueTitle}` : '',
        labelPrefix,
        firstBodyText
      ].filter(Boolean).join('\n').trim();

      return {
        issueTitle,
        issueAuthor: issueAuthor || latestCommentAuthor,
        postCaption: combinedCaption,
        incomingText: latestCommentText || combinedCaption,
        incomingAuthor: latestCommentAuthor || issueAuthor
      };
    },

    /**
     * Extracts complete context for GitHub Issue / PR / Discussion reply or creation
     */
    extractContext(inputEl, postContainer = null) {
      const target = postContainer || this.findPostContainer(inputEl);
      const threadCtx = this.extractIssueThreadContext(inputEl, target);
      const existingText = (inputEl?.value || inputEl?.textContent || '').trim();

      const inputName = (inputEl?.getAttribute?.('name') || '').toLowerCase();
      const isNewIssueOrPr = inputName === 'issue[body]' || inputName === 'pull_request[body]' ||
        (typeof window !== 'undefined' && /\/(issues|pull|discussions)\/new/i.test(window.location.pathname || ''));

      return {
        platform: 'github',
        contextType: isNewIssueOrPr ? 'post_draft' : 'comment',
        postId: threadCtx.issueTitle || 'github_issue',
        author: threadCtx.incomingAuthor || threadCtx.issueAuthor,
        postAuthor: threadCtx.issueAuthor,
        postCaption: threadCtx.postCaption,
        incomingText: threadCtx.incomingText || existingText || threadCtx.issueTitle,
        incomingAuthor: threadCtx.incomingAuthor || threadCtx.issueAuthor,
        draftNotes: existingText,
        postVisuals: { description: '', thumbnailUrl: '', mediaType: 'none' },
        toneBias: 'professional'
      };
    },

    /**
     * Inserts text into a GitHub markdown textarea or contenteditable composer
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
    module.exports = GitHubAdapter;
  }
  if (typeof window !== 'undefined') {
    window.GitHubAdapter = GitHubAdapter;
    if (window.SocialPlatformDetector && typeof window.SocialPlatformDetector.registerAdapter === 'function') {
      window.SocialPlatformDetector.registerAdapter(GitHubAdapter);
    }
  }
})();

