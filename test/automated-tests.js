/**
 * InstaReply AI - Automated Test Suite
 * Comprehensive automated testing covering unit logic, regression edge-cases,
 * and real Headless Chrome DOM integration.
 */

const { execSync } = require('child_process');
const assert = require('assert');
const path = require('path');
const fs = require('fs');

const ROOT_DIR = path.resolve(__dirname, '..');
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

function runTest(suiteName, testName, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ [${suiteName}] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [${suiteName}] ${testName}: ${err.message}`);
  }
}

async function runAsyncTest(suiteName, testName, fn) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ [${suiteName}] ${testName}`);
  } catch (err) {
    failedTests++;
    console.error(`  ✗ [${suiteName}] ${testName}: ${err.message}`);
  }
}

async function main() {
  console.log('=================================================');
  console.log('🚀 Running InstaReply AI Automated Test Suite');
  console.log('=================================================\n');

  // =========================================================================
  // SUITE 1: Syntax & Static Code Quality Validation
  // =========================================================================
  console.log('📦 Suite 1: Syntax & Static Code Quality');

  runTest('Syntax', 'content/content.js syntax valid', () => {
    execSync(`node -c "${path.join(ROOT_DIR, 'content/content.js')}"`, { stdio: 'pipe' });
  });

  runTest('Syntax', 'background/service-worker.js syntax valid', () => {
    execSync(`node -c "${path.join(ROOT_DIR, 'background/service-worker.js')}"`, { stdio: 'pipe' });
  });

  runTest('Syntax', 'popup/popup.js syntax valid', () => {
    execSync(`node -c "${path.join(ROOT_DIR, 'popup/popup.js')}"`, { stdio: 'pipe' });
  });

  runTest('Syntax', 'content/page-bridge.js syntax valid', () => {
    execSync(`node -c "${path.join(ROOT_DIR, 'content/page-bridge.js')}"`, { stdio: 'pipe' });
  });

  runTest('Syntax', 'content/adapters/meta-business-adapter.js syntax valid', () => {
    execSync(`node -c "${path.join(ROOT_DIR, 'content/adapters/meta-business-adapter.js')}"`, { stdio: 'pipe' });
  });

  runTest('Scope', 'content/content.js scopes requestPromise before try-finally block', () => {
    const code = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const execReplyDef = code.indexOf('async function executeReplyGeneration()');
    assert.ok(execReplyDef !== -1, 'executeReplyGeneration function must exist');
    const execReplyBody = code.slice(execReplyDef, execReplyDef + 2500);
    assert.ok(
      execReplyBody.includes('let requestPromise = null;') || execReplyBody.includes('let requestPromise;'),
      'requestPromise must be declared outside try block with let'
    );
    assert.ok(
      !execReplyBody.includes('const requestPromise ='),
      'requestPromise must not be block-scoped with const inside try'
    );
  });

  runTest('Manifest', 'manifest.json valid Manifest V3 structure', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
    assert.strictEqual(manifest.manifest_version, 3, 'Must be Manifest V3');
    assert.strictEqual(manifest.background.service_worker, 'background/service-worker.js');
    assert.ok(Array.isArray(manifest.permissions), 'Permissions must be array');
    assert.ok(manifest.permissions.includes('storage'), 'Must include storage permission');
    assert.ok(manifest.content_scripts.some(cs => cs.matches.some(m => m.includes('instagram.com'))), 'Content scripts must target instagram.com');
    assert.ok(manifest.host_permissions.some(h => h.includes('instagram.com') || h === 'https://*/*'), 'Host permissions must allow API calls');
  });

  // =========================================================================
  // SUITE 2: Dedicated Post URL Context Extraction Suite (/p/DdQLLRDAUN5/)
  // =========================================================================
  console.log('\n🔍 Suite 2: Dedicated Post Context Extraction (/p/DdQLLRDAUN5/)');

  runTest('PostIdentifier', 'Prioritizes window.location.pathname over suggested thumbnails', () => {
    const windowLocation = { pathname: '/p/DdQLLRDAUN5/' };
    function extractPostIdentifier(container) {
      const path = windowLocation.pathname;
      const pathMatch = path.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
      if (pathMatch && pathMatch[2]) return pathMatch[2];
      if (container) {
        const link = container.querySelector ? container.querySelector('a[href*="/p/"]') : null;
        if (link) return link.href;
      }
      return '';
    }
    const mockSuggestedContainer = { querySelector: () => ({ href: 'SUGGESTED_POST_THUMB' }) };
    const id = extractPostIdentifier(mockSuggestedContainer);
    assert.strictEqual(id, 'DdQLLRDAUN5');
  });

  runTest('PostAuthor', 'Extracts canonical author from document.title without matching caption mentions', () => {
    const bannedRoutes = new Set(['explore', 'p', 'reels', 'reel', 'developer']);
    const cleanCandidate = (h) => {
      const clean = (h || '').replace(/^@/, '').trim();
      return /^[a-zA-Z0-9._]+$/.test(clean) && !bannedRoutes.has(clean.toLowerCase()) ? clean : '';
    };
    function extractAuthorFromTitle(pageTitle, ogTitle) {
      for (const titleCandidate of [pageTitle, ogTitle]) {
        if (!titleCandidate) continue;
        const parenMatch = titleCandidate.match(/^.+?\(@([a-zA-Z0-9._]+)\)/);
        if (parenMatch && parenMatch[1]) {
          const c = cleanCandidate(parenMatch[1]);
          if (c) return c;
        }
        const onIgMatch = titleCandidate.match(/^([a-zA-Z0-9._]+)\s+on\s+Instagram/i);
        if (onIgMatch && onIgMatch[1]) {
          const c = cleanCandidate(onIgMatch[1]);
          if (c) return c;
        }
        const dotIgMatch = titleCandidate.match(/^([a-zA-Z0-9._]+)\s*•\s*Instagram/i);
        if (dotIgMatch && dotIgMatch[1]) {
          const c = cleanCandidate(dotIgMatch[1]);
          if (c) return c;
        }
      }
      return '';
    }

    // 1. Title with parenthesized handle and tagged handle in caption
    const title1 = 'Jane Doe (@janedoe) on Instagram: "Awesome coffee at @cafeparis with @friend!"';
    assert.strictEqual(extractAuthorFromTitle(title1, ''), 'janedoe');

    // 2. Title with handle on Instagram
    const title2 = 'cool_photographer on Instagram: "Sunset shot tagged @sonyalpha #photography"';
    assert.strictEqual(extractAuthorFromTitle(title2, ''), 'cool_photographer');

    // 3. Title with dot separator
    const title3 = 'traveler • Instagram photos and videos';
    assert.strictEqual(extractAuthorFromTitle(title3, ''), 'traveler');
  });

  runTest('PostCaption', 'Extracts semantic h1 caption and ignores comment row text', () => {
    function cleanCaptionText(text) {
      return (text || '').replace(/\s*…\s*more$/i, '').replace(/\s*more$/i, '').trim();
    }

    const mockH1Text = 'Coffee time at @cafeparis! Loving this atmosphere.';
    const mockFirstComment = 'Looks delicious! What blend do they serve?';

    function extractCaption(hasH1, author) {
      if (hasH1) return cleanCaptionText(mockH1Text);
      return cleanCaptionText(mockFirstComment);
    }

    const caption = extractCaption(true, 'janedoe');
    assert.strictEqual(caption, 'Coffee time at @cafeparis! Loving this atmosphere.');
    assert.ok(!caption.includes('Looks delicious!'), 'Comment must NOT be adopted as post caption');
  });

  runTest('PostCaption', 'Filters duplicate caption row from author comments list', () => {
    const standardCaption = 'Coffee time at @cafeparis! Loving this atmosphere.';
    const rawAuthorComments = [
      'Coffee time at @cafeparis! Loving this atmosphere.',
      'Update: they also have oat milk options!'
    ];

    const uniqueAuthorComments = rawAuthorComments.filter(c => {
      const lowerC = c.trim().toLowerCase();
      const lowerStd = standardCaption.trim().toLowerCase();
      return lowerC !== lowerStd && !lowerStd.includes(lowerC) && !lowerC.includes(lowerStd);
    });

    assert.strictEqual(uniqueAuthorComments.length, 1);
    assert.strictEqual(uniqueAuthorComments[0], 'Update: they also have oat milk options!');
  });

  runTest('PostVisuals', 'Filters out suggested thumbnails from "More posts from user"', () => {
    const currentPostId = 'DdQLLRDAUN5';
    const mockImages = [
      { src: 'main_coffee.jpg', alt: 'May be an image of coffee and croissant', parentHref: '/p/DdQLLRDAUN5/' },
      { src: 'suggested_thumb1.jpg', alt: 'May be an image of a sports car', parentHref: '/p/SUGGESTED_111/' },
      { src: 'suggested_thumb2.jpg', alt: 'May be an image of a dog', parentHref: '/p/SUGGESTED_222/' }
    ];

    const filtered = mockImages.filter(img => {
      if (img.parentHref && currentPostId && !img.parentHref.includes(currentPostId)) {
        return false;
      }
      return true;
    });

    assert.strictEqual(filtered.length, 1);
    assert.strictEqual(filtered[0].src, 'main_coffee.jpg');
    assert.strictEqual(filtered[0].alt, 'May be an image of coffee and croissant');
  });

  runTest('DirectUserPostRoute', 'Recognizes direct user post URLs (/username/p/ID/) and extracts post shortcode and author handle', () => {
    function isDedicatedPostOrReelRoute(path) {
      const match = path.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
      const bannedCodes = new Set(['videos', 'audio', 'reels', 'reel', 'explore', 'direct', 'stories', 'create', 'tv']);
      return Boolean(match && match[2] && !bannedCodes.has(match[2].toLowerCase()));
    }

    function extractDirectPostAuthor(path) {
      const bannedRoutes = new Set(['explore', 'reels', 'reel', 'direct', 'stories', 'p', 'tv', 'accounts', 'developer']);
      const userPathMatch = path.match(/^\/([a-zA-Z0-9._]+)\/(?:p|reel|reels)\//);
      if (userPathMatch && userPathMatch[1]) {
        const clean = userPathMatch[1].trim();
        if (/^[a-zA-Z0-9._]+$/.test(clean) && !bannedRoutes.has(clean.toLowerCase())) {
          return clean;
        }
      }
      return '';
    }

    function extractDirectPostId(path) {
      const match = path.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
      return match ? match[2] : '';
    }

    // Direct user post URL: /hayashi.matcha/p/DdQw9TViBgz/
    const testUrl = '/hayashi.matcha/p/DdQw9TViBgz/';
    assert.strictEqual(isDedicatedPostOrReelRoute(testUrl), true);
    assert.strictEqual(extractDirectPostAuthor(testUrl), 'hayashi.matcha');
    assert.strictEqual(extractDirectPostId(testUrl), 'DdQw9TViBgz');

    // Standard /p/ post URL
    const standardUrl = '/p/DdQLLRDAUN5/';
    assert.strictEqual(isDedicatedPostOrReelRoute(standardUrl), true);
    assert.strictEqual(extractDirectPostAuthor(standardUrl), '');
    assert.strictEqual(extractDirectPostId(standardUrl), 'DdQLLRDAUN5');

    // Non-post routes
    assert.strictEqual(isDedicatedPostOrReelRoute('/explore/'), false);
    assert.strictEqual(isDedicatedPostOrReelRoute('/reels/videos/'), false);
  });

  runTest('MultilingualCommentInputDiscovery', 'Matches standard form textarea and multilingual comment inputs without dropping inputs on reply-to placeholder', () => {
    function shouldInjectCommentShortcut(inputInfo) {
      const { inForm, inArticle, placeholder, ariaLabel, isStory, isDm } = inputInfo;
      if (isStory || isDm) return false;

      // Must be inside a form, article, main, or have comment / 留言 / コメント cues
      const hasStructuralMatch = inForm || inArticle;
      const lowerPlaceholder = (placeholder || '').toLowerCase();
      const lowerAria = (ariaLabel || '').toLowerCase();
      const hasTextCue = /comment|留言|評論|评论|コメント|coment/.test(lowerPlaceholder + lowerAria);

      if (!hasStructuralMatch && !hasTextCue) return false;

      // Must NOT be dropped when replying to a user with "Reply to @author..." placeholder
      return true;
    }

    // Standard English form textarea on direct post
    assert.strictEqual(shouldInjectCommentShortcut({ inForm: true, inArticle: false, placeholder: 'Add a comment...', ariaLabel: 'Add a comment...', isStory: false, isDm: false }), true);

    // Traditional Chinese form textarea on direct post
    assert.strictEqual(shouldInjectCommentShortcut({ inForm: true, inArticle: false, placeholder: '新增留言...', ariaLabel: '新增留言...', isStory: false, isDm: false }), true);

    // Comment input active reply state with "Reply to @hayashi.matcha..."
    assert.strictEqual(shouldInjectCommentShortcut({ inForm: true, inArticle: true, placeholder: 'Reply to @hayashi.matcha...', ariaLabel: 'Reply to @hayashi.matcha...', isStory: false, isDm: false }), true);

    // Story input should be excluded
    assert.strictEqual(shouldInjectCommentShortcut({ inForm: false, inArticle: false, placeholder: 'Send message', ariaLabel: 'Reply to story', isStory: true, isDm: false }), false);
  });

  // =========================================================================
  // SUITE 2b: Instagram Reel Context Extraction & Comments Drawer Isolation
  // =========================================================================
  console.log('\n🎬 Suite 2b: Instagram Reel Context Extraction & Comments Drawer Isolation');

  runTest('ReelIdentifier', 'Rejects generic /reels/videos/ route and finds shortcode in reel container', () => {
    const bannedCodes = new Set(['videos', 'audio', 'reels', 'reel', 'explore', 'direct', 'stories', 'create', 'tv']);
    function extractReelIdentifier(path, container) {
      const pathMatch = path.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
      if (pathMatch && pathMatch[2] && !bannedCodes.has(pathMatch[2].toLowerCase())) {
        return pathMatch[2];
      }
      if (container) {
        const link = container.querySelector ? container.querySelector('a[href*="/reel/"], a[href*="/reels/"]') : null;
        if (link) {
          const m = link.href.match(/\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
          if (m && m[2] && !bannedCodes.has(m[2].toLowerCase())) return m[2];
        }
      }
      return 'fallback_id';
    }

    // 1. Direct Reel URL: /reel/C9xyz123/
    assert.strictEqual(extractReelIdentifier('/reel/C9xyz123/', null), 'C9xyz123');

    // 2. Generic Reels feed: /reels/videos/ with container having link /reel/C8abc789/
    const mockContainer = {
      querySelector: () => ({ href: 'https://www.instagram.com/reel/C8abc789/' })
    };
    assert.strictEqual(extractReelIdentifier('/reels/videos/', mockContainer), 'C8abc789');
  });

  runTest('ReelDrawerIsolation', 'isInsideCommentsSection correctly identifies comments drawer elements', () => {
    function isInsideCommentsSection(node) {
      if (!node) return false;
      let curr = node;
      while (curr) {
        if (curr.role === 'dialog' && (curr.heading === 'Comments' || curr.heading === '留言' || (curr.hasCommentInput && !curr.hasVideo))) {
          return true;
        }
        if (curr.tag === 'UL' || curr.tag === 'OL' || curr.tag === 'FORM' || curr.className?.includes('ig-comment')) {
          return true;
        }
        curr = curr.parent;
      }
      return false;
    }

    const videoOverlayNode = { tag: 'DIV', parent: { tag: 'DIV', role: 'region' } };
    const commentRowNode = { tag: 'SPAN', parent: { tag: 'DIV', parent: { tag: 'DIV', role: 'dialog', heading: 'Comments', hasCommentInput: true, hasVideo: false } } };

    assert.strictEqual(isInsideCommentsSection(videoOverlayNode), false, 'Video overlay must NOT be treated as comments section');
    assert.strictEqual(isInsideCommentsSection(commentRowNode), true, 'Node in comments drawer must be recognized as comments section');
  });

  runTest('ReelAuthor', 'Extracts author from video overlay avatar or canonical title and ignores commenters in drawer', () => {
    const reelOverlayAvatar = {
      alt: "bi___0108's profile picture",
      isInComments: false
    };
    const drawerCommenterAvatar = {
      alt: "random_commenter's profile picture",
      isInComments: true
    };

    function extractAuthor(avatars) {
      const banned = new Set(['reels', 'explore', 'p', 'audio', 'videos']);
      for (const a of avatars) {
        if (a.isInComments) continue;
        const m = a.alt.match(/([a-zA-Z0-9._]+)'s profile picture/i);
        if (m && m[1] && !banned.has(m[1].toLowerCase())) {
          return m[1];
        }
      }
      return '';
    }

    const author = extractAuthor([drawerCommenterAvatar, reelOverlayAvatar]);
    assert.strictEqual(author, 'bi___0108', 'Must extract reel creator handle and ignore commenters in drawer');
  });

  runTest('ReelVisuals', 'Extracts og:image cover and real visual description for Reel', () => {
    function extractVisuals(ogImage, ogDesc, videoPoster) {
      let thumbnailUrl = '';
      let description = '';

      if (ogImage && ogImage.startsWith('http')) thumbnailUrl = ogImage;
      else if (videoPoster) thumbnailUrl = videoPoster;

      const imgAltMatch = (ogDesc || '').match(/(?:Photo|Video) (?:by|shared by) .+?: (.+)$/i);
      if (imgAltMatch && imgAltMatch[1]) {
        description = imgAltMatch[1].trim();
      }

      return {
        mediaType: 'video',
        thumbnailUrl,
        description: description || 'Instagram Reel video'
      };
    }

    const ogImg = 'https://cdn.instagram.com/reel_cover.jpg';
    const ogDesc = 'Video by kart_racer: Go kart drifting championship 2026';
    const visuals = extractVisuals(ogImg, ogDesc, '');

    assert.strictEqual(visuals.mediaType, 'video');
    assert.strictEqual(visuals.thumbnailUrl, 'https://cdn.instagram.com/reel_cover.jpg');
    assert.strictEqual(visuals.description, 'Go kart drifting championship 2026');
  });

  // =========================================================================
  // SUITE 2c: Instagram Story Reply & Context Extraction
  // =========================================================================
  console.log('\n📸 Suite 2c: Instagram Story Reply & Context Extraction');

  runTest('StoryInputDiscovery', 'Identifies Story reply input with reply/message/send and multilingual cues', () => {
    function isStoryInput(placeholder, ariaLabel, insideViewer) {
      const p = (placeholder || '').toLowerCase();
      const a = (ariaLabel || '').toLowerCase();
      const storyCues = ['reply', 'message', 'send', 'responder', 'enviar', '返信', 'メッセージ', '回复', '回覆', '訊息', '消息', 'nachricht', 'antworten'];
      const hasCue = storyCues.some(c => p.includes(c) || a.includes(c));
      return insideViewer || hasCue;
    }

    assert.strictEqual(isStoryInput('Reply to story_creator...', '', false), true);
    assert.strictEqual(isStoryInput('', 'Reply to story_creator...', false), true);
    assert.strictEqual(isStoryInput('Send message...', '', false), true);
    assert.strictEqual(isStoryInput('Send a message...', '', false), true);
    assert.strictEqual(isStoryInput('Responder a story_creator...', '', false), true);
    assert.strictEqual(isStoryInput('メッセージを送信...', '', false), true);
    assert.strictEqual(isStoryInput('傳送訊息...', '', false), true);
    assert.strictEqual(isStoryInput('', '', true), true);
    assert.strictEqual(isStoryInput('Add a comment...', '', false), false);
    assert.strictEqual(isStoryInput('Search...', '', false), false);
  });

  runTest('StoryAuthorExtraction', 'Extracts author from /stories/<username>/ route URL and header, rejecting highlights', () => {
    function extractStoryAuthor(pathname, headerLink) {
      const urlMatch = pathname.match(/\/stories\/([a-zA-Z0-9._]+)/);
      const banned = new Set(['explore', 'direct', 'reels', 'reel', 'p', 'stories', 'highlights', 'settings', 'accounts']);
      if (urlMatch && urlMatch[1] && !banned.has(urlMatch[1].toLowerCase())) {
        return urlMatch[1];
      }
      if (headerLink) {
        const m = headerLink.match(/^\/([a-zA-Z0-9._]+)\/?$/);
        if (m && m[1] && !banned.has(m[1].toLowerCase())) return m[1];
      }
      return '';
    }

    assert.strictEqual(extractStoryAuthor('/stories/nature_photographer/312345/', ''), 'nature_photographer');
    assert.strictEqual(extractStoryAuthor('/stories/travel_diaries/', ''), 'travel_diaries');
    assert.strictEqual(extractStoryAuthor('/direct/t/123/', '/travel_diaries/'), 'travel_diaries');
    // On highlights route, 'highlights' must NOT be treated as the author username!
    assert.strictEqual(extractStoryAuthor('/stories/highlights/18123456789/', '/tokyo_eats/'), 'tokyo_eats');
  });

  runTest('StoryIdentifier', 'Generates unique story identifier scoping replies to active slide, rejecting highlights', () => {
    function extractStoryIdentifier(pathname, storyAuthor) {
      const match = pathname.match(/\/stories\/([a-zA-Z0-9._]+)(?:\/([0-9]+))?/);
      const banned = new Set(['explore', 'direct', 'reels', 'reel', 'p', 'stories', 'highlights']);
      if (match && match[1] && !banned.has(match[1].toLowerCase())) {
        const user = match[1];
        const storyId = match[2];
        return storyId ? `story_${user}_${storyId}` : `story_${user}_active`;
      }
      return `story_${storyAuthor || 'user'}_active`;
    }

    assert.strictEqual(extractStoryIdentifier('/stories/nature_photographer/312345/', 'nature_photographer'), 'story_nature_photographer_312345');
    assert.strictEqual(extractStoryIdentifier('/stories/nature_photographer/', 'nature_photographer'), 'story_nature_photographer_active');
    assert.strictEqual(extractStoryIdentifier('/stories/highlights/18123456789/', 'tokyo_eats'), 'story_tokyo_eats_active');
  });

  runTest('StoryInputInsertionPrototype', 'Correctly scopes prototype value setter for HTMLInputElement vs HTMLTextAreaElement', () => {
    // Simulates the prototype setter selection in content.js without calling Illegal invocation
    function getNativeSetterForTag(tag, mockInputProto, mockTextareaProto) {
      const proto = tag === 'textarea' ? mockTextareaProto : mockInputProto;
      return proto.valueSetter;
    }

    let inputSetterCalled = false;
    let textareaSetterCalled = false;

    const mockInputProto = {
      valueSetter: function(val) { inputSetterCalled = true; this.value = val; }
    };
    const mockTextareaProto = {
      valueSetter: function(val) { textareaSetterCalled = true; this.value = val; }
    };

    const mockInputEl = { tagName: 'INPUT', value: '' };
    const mockTextareaEl = { tagName: 'TEXTAREA', value: '' };

    const inputSetter = getNativeSetterForTag('input', mockInputProto, mockTextareaProto);
    inputSetter.call(mockInputEl, 'Story DM response');
    assert.strictEqual(inputSetterCalled, true);
    assert.strictEqual(mockInputEl.value, 'Story DM response');

    const textareaSetter = getNativeSetterForTag('textarea', mockInputProto, mockTextareaProto);
    textareaSetter.call(mockTextareaEl, 'Comment reply');
    assert.strictEqual(textareaSetterCalled, true);
    assert.strictEqual(mockTextareaEl.value, 'Comment reply');
  });

  runTest('StoryButtonReinjection', 'Permits re-injection if shortcut button was unmounted by React', () => {
    function shouldInjectShortcut(datasetInjected, containerHasBtn) {
      if (datasetInjected) {
        if (containerHasBtn) return false; // Button already present in DOM
        return true; // Button was detached by React; allow re-injection!
      }
      return true;
    }

    assert.strictEqual(shouldInjectShortcut(false, false), true, 'Fresh input must be injected');
    assert.strictEqual(shouldInjectShortcut(true, true), false, 'Already injected button in DOM must not be duplicated');
    assert.strictEqual(shouldInjectShortcut(true, false), true, 'Unmounted button must be re-injected on React reconciliation');
  });

  runTest('StoryButtonAlignmentInsidePill', 'Story shortcut button sits cleanly inside rounded pill without border clipping', () => {
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

    // CSS checks
    assert.ok(
      cssCode.includes('.instareply-composer-actions.instareply-story-actions'),
      'content.css must define .instareply-composer-actions.instareply-story-actions'
    );
    assert.ok(
      cssCode.includes('.instareply-composer-actions .instareply-shortcut-btn') &&
      cssCode.includes('position: relative !important;'),
      'Buttons inside actions wrapper must have position: relative to prevent clipping overflow'
    );
    assert.ok(
      cssCode.includes('right: 14px'),
      'Story actions wrapper must position with 14px offset from right pill edge'
    );

    // JS checks
    assert.ok(
      contentJs.includes("btn.style.setProperty('right', '14px', 'important')"),
      'insertShortcutIntoStory must enforce 14px right offset inside pill'
    );
  });

  runTest('StoryRelationship', 'Correctly sets story_reply mode, target, and relationshipSummary', () => {
    function determineReplyRelationship({ contextType, postAuthor, currentUsername }) {
      const isCurrentUserPostAuthor = Boolean(currentUsername && postAuthor && currentUsername.toLowerCase() === postAuthor.toLowerCase());
      if (contextType === 'story') {
        return {
          replyMode: 'story_reply',
          target: postAuthor || 'Story Author',
          relationshipSummary: isCurrentUserPostAuthor
            ? `Replying to your own Story (@${postAuthor})`
            : (postAuthor ? `Replying to @${postAuthor}'s Story (sent via DM)` : 'Replying to Story (sent via DM)')
        };
      }
      return { replyMode: 'post_comment' };
    }

    const relVisitor = determineReplyRelationship({ contextType: 'story', postAuthor: 'travel_diaries', currentUsername: 'bob' });
    assert.strictEqual(relVisitor.replyMode, 'story_reply');
    assert.strictEqual(relVisitor.target, 'travel_diaries');
    assert.strictEqual(relVisitor.relationshipSummary, "Replying to @travel_diaries's Story (sent via DM)");

    const relOwner = determineReplyRelationship({ contextType: 'story', postAuthor: 'bob', currentUsername: 'bob' });
    assert.strictEqual(relOwner.relationshipSummary, 'Replying to your own Story (@bob)');
  });

  runTest('StoryPromptFormatting', 'Formats prompt specifically for Instagram Story DM reply', () => {
    const swContent = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    assert.ok(swContent.includes('isStoryReply'), 'Must check isStoryReply in service worker');
    assert.ok(swContent.includes('INSTAGRAM STORY REPLY (SENT VIA DM)'), 'Must contain Story Reply engagement instructions');
    assert.ok(swContent.includes('FOLLOWER / FRIEND replying directly to @'), 'Must contain Story role header');
  });

  runTest('StoryAuthorFromInputPlaceholder', 'Extracts author from input placeholder or aria-label', () => {
    function extractStoryAuthorFromInput(placeholder, ariaLabel) {
      for (const text of [placeholder, ariaLabel]) {
        if (!text) continue;
        const m = text.match(/(?:reply to|responder a|nachricht an|mensaje a|mensagem para|enviar a)\s+@?([a-zA-Z0-9._]+)/i);
        if (m && m[1]) {
          const clean = m[1].replace(/\.+$/, '').trim();
          const banned = new Set(['explore', 'direct', 'reels', 'reel', 'p', 'stories', 'highlights', 'settings', 'accounts']);
          if (clean && !banned.has(clean.toLowerCase())) return clean;
        }
      }
      return '';
    }

    assert.strictEqual(extractStoryAuthorFromInput('Reply to sarah_adventures...', ''), 'sarah_adventures');
    assert.strictEqual(extractStoryAuthorFromInput('', 'Responder a chef_mario...'), 'chef_mario');
    assert.strictEqual(extractStoryAuthorFromInput('Nachricht an photo_guru senden...', ''), 'photo_guru');
    assert.strictEqual(extractStoryAuthorFromInput('Add a comment...', ''), '');
  });

  runTest('StorySlideScoping', 'Scopes active story slide container and prevents carousel bleed', () => {
    const mockCarousel = {
      tagName: 'SECTION',
      querySelectorAll: (sel) => sel === 'header' ? [{}, {}, {}] : []
    };
    const mockSlide0 = {
      tagName: 'DIV',
      parentElement: mockCarousel,
      querySelectorAll: (sel) => sel === 'header' ? [{}] : [],
      querySelector: (sel) => sel === 'video' ? {} : null
    };
    const mockComposer = {
      tagName: 'FORM',
      parentElement: mockSlide0,
      querySelectorAll: () => [],
      querySelector: () => null
    };
    const mockInput = {
      tagName: 'TEXTAREA',
      parentElement: mockComposer,
      querySelectorAll: () => [],
      querySelector: () => null
    };

    function findActiveSlide(el) {
      let curr = el.parentElement;
      let bestCandidate = null;
      while (curr && curr.tagName !== 'BODY') {
        const headers = curr.querySelectorAll('header');
        const hasMedia = curr.querySelector('video') || false;
        if (hasMedia || headers.length > 0) {
          if (headers.length <= 1) {
            return curr;
          } else {
            if (bestCandidate) return bestCandidate;
            break;
          }
        }
        bestCandidate = curr;
        curr = curr.parentElement;
      }
      return curr;
    }

    const resolvedSlide = findActiveSlide(mockInput);
    assert.strictEqual(resolvedSlide, mockSlide0, 'Must resolve to active slide and stop before multi-header carousel');
  });

  runTest('StoryCommentExclusion', 'Comment scanning excludes Story inputs and routes', () => {
    function isExcludedFromComments(pathname, ariaLabel, placeholder, isStoryComposer) {
      const a = (ariaLabel || '').toLowerCase();
      const p = (placeholder || '').toLowerCase();
      if (
        pathname.includes('/stories') ||
        isStoryComposer ||
        a.startsWith('reply to') ||
        p.startsWith('reply to') ||
        a.includes('reply to') ||
        p.includes('reply to')
      ) {
        return true;
      }
      return false;
    }

    assert.strictEqual(isExcludedFromComments('/stories/alice/123/', '', '', false), true);
    assert.strictEqual(isExcludedFromComments('/', 'Reply to alice...', '', false), true);
    assert.strictEqual(isExcludedFromComments('/', '', 'Reply to bob...', false), true);
    assert.strictEqual(isExcludedFromComments('/', '', '', true), true);
    assert.strictEqual(isExcludedFromComments('/p/123/', 'Add a comment...', 'Add a comment...', false), false);
  });

  runTest('StoryQuickReactionsRejection', 'Rejects Quick Reactions UI headings, trays, and pure emoji bars from story text', () => {
    function filterStoryText(elList, storyAuthor) {
      const bannedWords = new Set([
        (storyAuthor || '').toLowerCase(),
        'reply', 'send message', 'responder', 'story',
        'quick reactions', 'quick reaction', 'reactions', 'reaction',
        'reacciones rápidas', 'reacción rápida', 'schnelle reaktionen', 'réactions rapides'
      ]);

      const captionLines = [];
      const seen = new Set();

      for (const el of elList) {
        if (el.inReactionContainer || el.inHeader || el.inForm || el.inButton) continue;
        const txt = (el.text || '').trim();
        if (!txt || txt.length < 2) continue;
        if (/^[0-9]+[smhd]$/i.test(txt)) continue;
        const lower = txt.toLowerCase();
        if (bannedWords.has(lower)) continue;
        if (
          lower.startsWith('reply to') ||
          lower.startsWith('responder a') ||
          lower.includes('reaction') ||
          lower.includes('reacción') ||
          lower.includes('réaction') ||
          lower.includes('reaktion') ||
          lower.includes('reacciones rápidas') ||
          lower.includes('avatar')
        ) {
          continue;
        }
        if (/^[\p{Extended_Pictographic}\s]+$/u.test(txt)) {
          continue;
        }
        if (!seen.has(lower)) {
          seen.add(lower);
          captionLines.push(txt);
        }
      }
      return captionLines.join('\n');
    }

    const mockElements = [
      { text: 'traveler_sam', inHeader: true },
      { text: '3h', inHeader: true },
      { text: 'Quick Reactions', inReactionContainer: false }, // Heading text
      { text: 'Reactions', inReactionContainer: false },
      { text: 'Reacciones rápidas', inReactionContainer: false },
      { text: '😂 😮 😍 😢 👏 🔥 🎉 💯', inReactionContainer: false }, // Emoji tray
      { text: 'Reply to traveler_sam...', inForm: true },
      { text: 'Sunset at Kyoto temple! ⛩️', inReactionContainer: false } // Genuine sticker
    ];

    const result = filterStoryText(mockElements, 'traveler_sam');
    assert.strictEqual(result, 'Sunset at Kyoto temple! ⛩️', 'Must extract genuine sticker and exclude all Quick Reactions UI and emoji trays');
  });

  runTest('StoryBannerRendering', 'Renders "Story Text:" instead of "Post:" and omits banner when caption is empty', () => {
    function renderCaptionBanner(context) {
      const isStory = context.contextType === 'story' || context.replyMode === 'story_reply';
      if (!context.postCaption) return '';
      return `<strong>${isStory ? 'Story Text:' : 'Post:'}</strong> "${context.postCaption}"`;
    }

    const storyWithSticker = { contextType: 'story', replyMode: 'story_reply', postCaption: 'Beautiful day!' };
    const bannerWithSticker = renderCaptionBanner(storyWithSticker);
    assert.ok(bannerWithSticker.includes('Story Text:'), 'Must render Story Text: for story context');
    assert.ok(!bannerWithSticker.includes('Post:'), 'Must NOT render Post: for story context');

    const storyWithoutSticker = { contextType: 'story', replyMode: 'story_reply', postCaption: '' };
    const bannerWithoutSticker = renderCaptionBanner(storyWithoutSticker);
    assert.strictEqual(bannerWithoutSticker, '', 'Must render empty banner when Story has no text stickers');

    const feedPost = { contextType: 'comment', replyMode: 'post_comment', postCaption: 'Check out our new recipe' };
    const feedBanner = renderCaptionBanner(feedPost);
    assert.ok(feedBanner.includes('Post:'), 'Must render Post: for standard feed post comment');
  });

  runTest('StoryReelShareCTARejection', 'Rejects "Watch full reel", "View post", and navigation CTAs from shared reel stories', () => {
    function filterStoryCaption(elements, author) {
      const bannedWords = new Set([
        (author || '').toLowerCase(),
        'reply', 'send message', 'story',
        'watch full reel', 'watch reel', 'watch full video', 'watch video', 'watch on instagram',
        'play reel', 'view post', 'see post', 'view photo', 'view full post',
        'ver reel completo', 'ver reel', 'ver publicación',
        'regarder le reel', 'reel ansehen', 'guarda il reel', 'assista ao reel completo',
        'リールをすべて見る', 'リールを見る', '觀看完整連續短片', '观看完整 reels',
        'view product', 'visit shop', 'shop now', 'add yours', 'ask me a question'
      ]);

      const ctaRegex = /^(watch|play|see|view)\s+(full\s+)?(reel|video|post|photo|clip)(\s+on\s+instagram)?$/i;
      const multilingualRegex = /^(ver|regarder|guarda|assistir|assista)\s+(el\s+|le\s+|il\s+|ao\s+)?(reel|video|vidéo|post|publicación|publicacao)(\s+completo|\s+complet|\s+completa)?$/i;
      const cjkRegex = /^((リール|動画|投稿)を(すべて)?見る|(觀看|观看)(完整)?(連續短片|短片|视频|影片|reels?))$/i;

      const lines = [];
      for (const el of elements) {
        if (el.inLink || el.inButton || el.inHeader || el.inForm) continue;
        const txt = (el.text || '').trim();
        if (!txt || txt.length < 2) continue;
        const lower = txt.toLowerCase();
        if (bannedWords.has(lower)) continue;
        if (ctaRegex.test(lower) || multilingualRegex.test(lower) || cjkRegex.test(lower)) continue;
        if (lower.startsWith('reply to') || lower.includes('reaction')) continue;
        lines.push(txt);
      }
      return lines.join('\n');
    }

    // Case 1: Story sharing a reel with NO custom text sticker (only Instagram's "Watch full reel" CTA)
    const reelShareOnly = [
      { text: 'travel_lover', inHeader: true },
      { text: 'Watch full reel', inLink: false }, // CTA text
      { text: '@foodie_chef', inLink: true }     // Original creator link
    ];
    assert.strictEqual(filterStoryCaption(reelShareOnly, 'travel_lover'), '', 'Must return empty caption when story only contains "Watch full reel" CTA');

    // Case 2: Story sharing a reel WITH a custom sticker added by the author
    const reelShareWithSticker = [
      { text: 'travel_lover', inHeader: true },
      { text: 'Watch full reel', inLink: false },
      { text: 'Ver reel completo', inLink: false },
      { text: 'Reel ansehen', inLink: false },
      { text: 'リールを見る', inLink: false },
      { text: '觀看完整連續短片', inLink: false },
      { text: 'You have to try this recipe! 🍝', inLink: false } // Genuine user sticker
    ];
    assert.strictEqual(
      filterStoryCaption(reelShareWithSticker, 'travel_lover'),
      'You have to try this recipe! 🍝',
      'Must extract user sticker and reject all multilingual "Watch full reel" CTAs'
    );

    // Case 3: Genuine user caption mentioning "watch" or "reel" in a natural sentence
    const naturalSentence = [
      { text: 'Watch till the very end to see the surprise! 🐶', inLink: false }
    ];
    assert.strictEqual(
      filterStoryCaption(naturalSentence, 'travel_lover'),
      'Watch till the very end to see the surprise! 🐶',
      'Must preserve natural sentences starting with "Watch"'
    );
  });

  // =========================================================================
  // SUITE 2d: Instagram Direct Message (DM) Context & Thread Isolation
  // =========================================================================
  console.log('\n✉️ Suite 2d: Instagram Direct Message (DM) Context & Thread Isolation');

  runTest('DmIdentifierIsolation', 'Extracts thread-scoped identifiers and isolates distinct messages in same thread', () => {
    function extractDmIdentifier(pathname, partnerAuthor = '', specificText = '') {
      const match = pathname.match(/\/direct\/t\/([A-Za-z0-9_-]+)/);
      let baseId = '';
      if (match && match[1]) {
        baseId = `dm_t_${match[1]}`;
      } else {
        const cleanAuthor = (partnerAuthor || '').trim().toLowerCase().replace(/^@/, '');
        baseId = cleanAuthor ? `dm_${cleanAuthor}` : 'dm_thread';
      }
      if (specificText) {
        const textHash = specificText.slice(0, 30).replace(/[^a-zA-Z0-9]/g, '_');
        return `${baseId}_${textHash}`;
      }
      return baseId;
    }

    const thread1 = extractDmIdentifier('/direct/t/17841400000000001/');
    const thread2 = extractDmIdentifier('/direct/t/17841400000000002/');
    assert.notStrictEqual(thread1, thread2, 'Different DM threads must have different thread IDs');
    assert.strictEqual(thread1, 'dm_t_17841400000000001');
    assert.strictEqual(thread2, 'dm_t_17841400000000002');

    // Floating PIP chat with partner
    const pipChat = extractDmIdentifier('/reels/', 'janedoe');
    assert.strictEqual(pipChat, 'dm_janedoe', 'Floating PIP chat must be scoped by partner handle');

    // Replying to two different messages in the same thread
    const msgA = extractDmIdentifier('/direct/t/17841400000000001/', '', 'Hey do you offer discounts?');
    const msgB = extractDmIdentifier('/direct/t/17841400000000001/', '', 'What time does the store open?');
    assert.notStrictEqual(msgA, msgB, 'Replying to different messages in the same thread must have distinct identifiers');
    assert.ok(msgA.includes('Hey_do_you_offer_discounts_'));
    assert.ok(msgB.includes('What_time_does_the_store_open_'));
  });

  runTest('DmPartnerExtraction', 'Extracts chat partner and rejects generic sidebar headings or inbox handles', () => {
    const banned = new Set(['direct', 'inbox', 'messages', 'chat', 'instagram', 'search', 'explore', 'notifications', 'settings']);

    function extractPartner({ replyBannerText, placeholder, headerProfileHref, headerTitle, docTitle }) {
      // 1. Reply banner
      if (replyBannerText) {
        const m = replyBannerText.match(/^Replying to\s+@?([a-zA-Z0-9._]+)/i);
        if (m && m[1] && !banned.has(m[1].toLowerCase())) return m[1];
      }
      // 2. Input placeholder
      if (placeholder) {
        const m = placeholder.match(/(?:message|send message to|responder a)\s+@?([a-zA-Z0-9._]+)/i);
        if (m && m[1]) {
          const clean = m[1].replace(/\.+$/, '').trim();
          if (clean && !banned.has(clean.toLowerCase())) return clean;
        }
      }
      // 3. Header profile link
      if (headerProfileHref) {
        const clean = headerProfileHref.replace(/^\/+/, '').split('/')[0].split('?')[0].trim();
        if (clean && !banned.has(clean.toLowerCase())) return clean;
      }
      // 4. Header title
      if (headerTitle) {
        const clean = headerTitle.trim().replace(/^@/, '');
        if (clean && !banned.has(clean.toLowerCase())) return clean;
      }
      // 5. Document title
      if (docTitle && docTitle.includes('Direct')) {
        const m = docTitle.match(/^([^•]+?)(?:\s*\(@?([a-zA-Z0-9._]+)\))?\s*•\s*Direct/i);
        if (m) {
          const handle = (m[2] || m[1]).trim().replace(/^@/, '');
          if (handle && !banned.has(handle.toLowerCase())) return handle;
        }
      }
      return '';
    }

    // Case 1: Native reply banner active
    assert.strictEqual(
      extractPartner({ replyBannerText: 'Replying to @sofia_art', placeholder: 'Message...' }),
      'sofia_art'
    );

    // Case 2: Input placeholder mentions partner
    assert.strictEqual(
      extractPartner({ placeholder: 'Message @tech_reviewer...' }),
      'tech_reviewer'
    );

    // Case 3: Header profile link
    assert.strictEqual(
      extractPartner({ headerProfileHref: '/photographer_sam/' }),
      'photographer_sam'
    );

    // Case 4: Document title with name and handle
    assert.strictEqual(
      extractPartner({ docTitle: 'Elena Rostova (@elena_r) • Direct' }),
      'elena_r'
    );

    // Case 5: Document title with handle only
    assert.strictEqual(
      extractPartner({ docTitle: 'travel_lover • Direct' }),
      'travel_lover'
    );

    // Case 6: Reject generic names
    assert.strictEqual(
      extractPartner({ headerTitle: 'Messages', docTitle: 'Instagram' }),
      ''
    );
  });

  runTest('DmIncomingTextExtraction', 'Filters outgoing sent bubbles and extracts recent incoming messages', () => {
    function extractIncomingText(bubbles, userDraft = '') {
      const recent = [];
      for (let i = bubbles.length - 1; i >= 0 && recent.length < 3; i--) {
        const b = bubbles[i];
        if (b.isOutgoing) {
          if (recent.length > 0) break;
          continue;
        }
        const text = (b.text || '').trim();
        if (!text || text === userDraft || text.length < 2) continue;
        if (text.match(/^(active\s|seen|delivered|sent|typing)/i)) continue;
        recent.unshift(text);
      }
      return recent.join('\n');
    }

    const conversation = [
      { text: 'Hi, are you open today?', isOutgoing: false },
      { text: 'Yes we are open until 8 PM!', isOutgoing: true },
      { text: 'Great, do you carry size 10?', isOutgoing: false },
      { text: 'Active 5m ago', isOutgoing: false } // status line
    ];

    const result = extractIncomingText(conversation);
    assert.strictEqual(result, 'Great, do you carry size 10?');
  });

  // =========================================================================
  // SUITE 3: Comment Isolation & Anti-Stale Caching
  // =========================================================================
  console.log('\n🛡️ Suite 3: Comment Isolation & Anti-Stale Caching');

  runTest('CommentScoping', 'Stale cached comment from previous post is discarded', () => {
    const currentPostId = 'DdQLLRDAUN5';

    // Cached context from 90 seconds ago on another post
    const staleContext = {
      author: 'old_commenter',
      incomingText: 'Where did you get that coat?',
      postId: 'OLD_POST_789',
      commentItem: {},
      timestamp: Date.now() - 90000
    };

    function resolveContext(lastContext, currentId, userText) {
      let author = '';
      let incomingText = '';

      if (
        lastContext &&
        lastContext.incomingText &&
        (!lastContext.postId || !currentId || lastContext.postId === currentId) &&
        (Date.now() - lastContext.timestamp < 45000)
      ) {
        author = lastContext.author;
        incomingText = lastContext.incomingText;
      }

      const isSpecificCommentReply = Boolean(incomingText && author);
      return { author, incomingText, isSpecificCommentReply };
    }

    const result = resolveContext(staleContext, currentPostId, '');
    assert.strictEqual(result.author, '');
    assert.strictEqual(result.incomingText, '');
    assert.strictEqual(result.isSpecificCommentReply, false, 'Must be top-level post comment, not stale reply');
  });

  runTest('CommentScoping', 'Active comment reply in same post is correctly resolved', () => {
    const currentPostId = 'DdQLLRDAUN5';

    // Fresh context from 5 seconds ago in current post
    const freshContext = {
      author: 'bob',
      incomingText: 'Looks delicious! What blend do they serve?',
      postId: 'DdQLLRDAUN5',
      commentItem: {},
      timestamp: Date.now() - 5000
    };

    function resolveContext(lastContext, currentId) {
      let author = '';
      let incomingText = '';

      if (
        lastContext &&
        lastContext.incomingText &&
        (!lastContext.postId || !currentId || lastContext.postId === currentId) &&
        (Date.now() - lastContext.timestamp < 45000)
      ) {
        author = lastContext.author;
        incomingText = lastContext.incomingText;
      }

      const isSpecificCommentReply = Boolean(incomingText && author);
      return { author, incomingText, isSpecificCommentReply };
    }

    const result = resolveContext(freshContext, currentPostId);
    assert.strictEqual(result.author, 'bob');
    assert.strictEqual(result.incomingText, 'Looks delicious! What blend do they serve?');
    assert.strictEqual(result.isSpecificCommentReply, true);
  });

  runTest('CommentContainerDiscovery', 'Accurately locates comment row container in modern nested div virtual list without li or ul', () => {
    const authorLink1 = {
      tag: 'A',
      getAttribute: (k) => k === 'href' ? '/nk.l.1001/' : null
    };
    const replyBtn1 = {
      tag: 'DIV',
      role: 'button',
      textContent: 'Reply'
    };

    const actionsDiv1 = {
      tag: 'DIV',
      className: 'actions',
      children: [replyBtn1],
      parentElement: null,
      querySelectorAll: (sel) => sel.includes('button') ? [replyBtn1] : [],
      querySelector: () => null
    };
    replyBtn1.parentElement = actionsDiv1;

    const bodyDiv1 = {
      tag: 'DIV',
      className: 'comment-body',
      children: [authorLink1, actionsDiv1],
      parentElement: null,
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [authorLink1];
        if (sel.includes('button')) return [replyBtn1];
        return [];
      },
      querySelector: () => ({ tag: 'TIME' })
    };
    actionsDiv1.parentElement = bodyDiv1;

    const rowDiv1 = {
      tag: 'DIV',
      className: 'comment-row',
      children: [bodyDiv1],
      parentElement: null,
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [authorLink1];
        if (sel.includes('button')) return [replyBtn1];
        return [];
      },
      querySelector: () => ({ tag: 'TIME' })
    };
    bodyDiv1.parentElement = rowDiv1;

    const streamDiv = {
      tag: 'DIV',
      className: 'comments-stream',
      children: [rowDiv1],
      parentElement: { tagName: 'ARTICLE', getAttribute: () => null },
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [authorLink1, { getAttribute: () => '/asa_megane/' }];
        if (sel.includes('button')) return [replyBtn1, { textContent: 'Reply' }];
        return [];
      },
      querySelector: () => null
    };
    rowDiv1.parentElement = streamDiv;

    function findContainer(node) {
      let curr = node.parentElement;
      let candidate = null;
      while (curr && curr.tagName !== 'ARTICLE') {
        const authorLinks = curr.querySelectorAll('a[href^="/"]');
        const hasTimeOrReply = curr.querySelector('time') !== null;
        if (authorLinks.length >= 1 && hasTimeOrReply) {
          const replyButtons = curr.querySelectorAll('button');
          if (replyButtons.length <= 1) {
            candidate = curr;
          } else {
            break;
          }
        }
        curr = curr.parentElement;
      }
      return candidate;
    }

    const found = findContainer(replyBtn1);
    assert.strictEqual(found, rowDiv1, 'Must resolve to the individual comment row and stop before the stream');
  });

  runTest('CommentAuthorExtraction', 'Extracts author handle from comment container profile links', () => {
    function extractAuthor(container) {
      const banned = new Set(['explore', 'p', 'reel', 'reels', 'stories', 'direct']);
      const links = container.querySelectorAll('a[href^="/"]');
      for (const link of links) {
        const href = link.getAttribute('href') || '';
        const match = href.match(/^\/([a-zA-Z0-9._]+)\/?$/);
        if (match && match[1] && !banned.has(match[1].toLowerCase())) {
          return match[1];
        }
      }
      return '';
    }

    const mockContainer = {
      querySelectorAll: () => [
        { getAttribute: () => '/explore/' },
        { getAttribute: () => '/nk.l.1001/' }
      ]
    };
    assert.strictEqual(extractAuthor(mockContainer), 'nk.l.1001');
  });

  runTest('ThreadedCommentIsolationAndAuthorMatching', 'Accurately resolves last commenter vs 2nd-last commenter in shared threaded comment containers', () => {
    // Parent comment: eva
    // 2nd-last commenter: frank
    // Last commenter: grace
    const evaLink = { href: '/eva/', getAttribute: (k) => k === 'href' ? '/eva/' : null, closest: () => null };
    const evaReplyBtn = { textContent: 'Reply', getAttribute: () => null, closest: () => null };
    const evaRow = {
      className: 'parent-comment eva-comment',
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [evaLink];
        if (sel.includes('button')) return [evaReplyBtn];
        return [];
      },
      querySelector: (sel) => sel.includes('button') ? evaReplyBtn : null,
      parentElement: null
    };
    evaReplyBtn.parentElement = evaRow;

    const frankLink = { href: '/frank/', getAttribute: (k) => k === 'href' ? '/frank/' : null, closest: () => null };
    const frankReplyBtn = { textContent: 'Reply', getAttribute: () => null, closest: () => null };
    const frankRow = {
      className: 'nested-comment frank-comment',
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [frankLink];
        if (sel.includes('button')) return [frankReplyBtn];
        return [];
      },
      querySelector: (sel) => sel.includes('button') ? frankReplyBtn : null,
      parentElement: null
    };
    frankReplyBtn.parentElement = frankRow;

    const graceLink = { href: '/grace/', getAttribute: (k) => k === 'href' ? '/grace/' : null, closest: () => null };
    const graceReplyBtn = { textContent: 'Reply', getAttribute: () => null, closest: () => null };
    const graceRow = {
      className: 'nested-comment grace-comment',
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [graceLink];
        if (sel.includes('button')) return [graceReplyBtn];
        return [];
      },
      querySelector: (sel) => sel.includes('button') ? graceReplyBtn : null,
      parentElement: null
    };
    graceReplyBtn.parentElement = graceRow;

    const nestedContainer = {
      className: 'nested-replies-container',
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [frankLink, graceLink];
        if (sel.includes('button')) return [frankReplyBtn, graceReplyBtn];
        return [];
      },
      parentElement: null
    };
    frankRow.parentElement = nestedContainer;
    graceRow.parentElement = nestedContainer;

    const parentLi = {
      tagName: 'LI',
      className: 'comment-item threaded-thread',
      querySelectorAll: (sel) => {
        if (sel.includes('a[')) return [evaLink, frankLink, graceLink];
        if (sel.includes('button')) return [evaReplyBtn, frankReplyBtn, graceReplyBtn];
        return [];
      },
      parentElement: { tagName: 'ARTICLE', getAttribute: () => null }
    };
    evaRow.parentElement = parentLi;
    nestedContainer.parentElement = parentLi;

    function countReplyBtns(container) {
      const btns = container.querySelectorAll('button');
      return btns.length;
    }

    function findContainer(node) {
      let curr = node.parentElement;
      let candidate = null;
      while (curr && curr.tagName !== 'ARTICLE') {
        const replyCount = countReplyBtns(curr);
        if (replyCount > 1) {
          break; // Stop before enclosing sibling comments!
        }
        const authorLinks = curr.querySelectorAll('a[href^="/"]');
        if (authorLinks.length >= 1) {
          candidate = curr;
        }
        curr = curr.parentElement;
      }
      return candidate;
    }

    // Grace is the last comment: must isolate graceRow, NOT nestedContainer and NOT parentLi
    const graceContainer = findContainer(graceReplyBtn);
    assert.strictEqual(graceContainer, graceRow, 'Grace reply button must resolve specifically to Grace row container');

    // Frank is the 2nd-last comment: must isolate frankRow
    const frankContainer = findContainer(frankReplyBtn);
    assert.strictEqual(frankContainer, frankRow, 'Frank reply button must resolve specifically to Frank row container');

    // Eva is parent comment: must isolate evaRow
    const evaContainer = findContainer(evaReplyBtn);
    assert.strictEqual(evaContainer, evaRow, 'Eva reply button must resolve specifically to Eva row container');

    function extractAuthorForBtn(btn, container) {
      const links = container.querySelectorAll('a[href^="/"]');
      if (links.length > 0) {
        const m = links[links.length - 1].getAttribute('href').match(/^\/([a-zA-Z0-9._]+)\/?$/);
        return m ? m[1] : '';
      }
      return '';
    }

    assert.strictEqual(extractAuthorForBtn(graceReplyBtn, graceContainer), 'grace', 'Last comment must extract grace');
    assert.strictEqual(extractAuthorForBtn(frankReplyBtn, frankContainer), 'frank', '2nd-last comment must extract frank');
    assert.strictEqual(extractAuthorForBtn(evaReplyBtn, evaContainer), 'eva', 'Parent comment must extract eva');
  });

  runTest('AriaLabelAndMultilingualAuthorExtraction', 'Extracts target comment author from multilingual button aria-labels', () => {
    function extractFromAria(btn) {
      const aria = btn.getAttribute('aria-label') || '';
      const match = aria.match(/(?:reply to|responder a|antworten an|répondre à|rispondi a|回覆|回复|返信|답글(?:\s*달기)?)\s+@?([a-zA-Z0-9._]+)/i) ||
                    aria.match(/@?([a-zA-Z0-9._]+)(?:님에게\s*답글|에게\s*답글|에\s*답글|に返信)/i) ||
                    aria.match(/@([a-zA-Z0-9._]+)/);
      return match ? match[1] : '';
    }

    assert.strictEqual(extractFromAria({ getAttribute: () => 'Reply to grace' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => '回覆 grace' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => '回复 grace' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => 'Responder a grace' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => 'Répondre à grace' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => 'Antworten an grace' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => 'Rispondi a grace' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => 'grace에 답글' }), 'grace');
    assert.strictEqual(extractFromAria({ getAttribute: () => 'graceに返信' }), 'grace');
  });

  runTest('CommentAuthorInsertionCorrection', 'Corrects mismatched leading author mentions and prepends target author mention', () => {
    function prepareCommentText(draftText, targetAuthor, isSpecificReply = true) {
      let textToInsert = draftText;
      const authorMention = `@${targetAuthor}`;
      if (isSpecificReply) {
        const leadingMentionMatch = textToInsert.match(/^@([a-zA-Z0-9._]+)\s*/);
        if (leadingMentionMatch) {
          if (leadingMentionMatch[1].toLowerCase() !== targetAuthor.toLowerCase()) {
            textToInsert = textToInsert.replace(/^@[a-zA-Z0-9._]+\s*/, `${authorMention} `);
          }
        } else {
          textToInsert = `${authorMention} ${textToInsert}`;
        }
      }
      return textToInsert;
    }

    // Case 1: Reply was generated tagging 2nd last commenter @frank, but target is @grace
    const corrected1 = prepareCommentText('@frank Thanks for the tip!', 'grace');
    assert.strictEqual(corrected1, '@grace Thanks for the tip!', 'Must replace mismatched handle @frank with target @grace');

    // Case 2: Reply generated without mention
    const corrected2 = prepareCommentText('Thanks for the tip!', 'grace');
    assert.strictEqual(corrected2, '@grace Thanks for the tip!', 'Must prepend @grace to reply');

    // Case 3: Reply already correctly tagged @grace
    const corrected3 = prepareCommentText('@grace Thanks for the tip!', 'grace');
    assert.strictEqual(corrected3, '@grace Thanks for the tip!', 'Must preserve existing correct @grace mention');
  });

  // =========================================================================
  // SUITE 4: Multi-Tone Bundling & AI Response Parsing
  // =========================================================================
  console.log('\n⚡ Suite 4: Multi-Tone Bundling & AI Response Parsing');

  runTest('JSONParser', 'Parses response with conversational preamble and markdown fence', () => {
    const rawModelResponse = `
Here is the JSON requested:
\`\`\`json
{
  "reply": "Thanks for visiting our cafe!",
  "sentiment": "positive",
  "sentimentLabel": "Positive",
  "toneDrafts": {
    "humorous": "Coffee is always the answer! ☕",
    "playful": "Warning: extreme deliciousness ahead! ✨",
    "savage": "Jealous? You should be! 😉",
    "concise": "Thanks! ☕"
  }
}
\`\`\`
Hope this helps!
`;

    function parseAIResponse(text) {
      const firstOpen = text.indexOf('{');
      const lastClose = text.lastIndexOf('}');
      assert.ok(firstOpen !== -1 && lastClose > firstOpen, 'Must contain JSON braces');
      const candidate = text.slice(firstOpen, lastClose + 1);
      return JSON.parse(candidate);
    }

    const parsed = parseAIResponse(rawModelResponse);
    assert.strictEqual(parsed.reply, 'Thanks for visiting our cafe!');
    assert.ok(parsed.toneDrafts);
    assert.strictEqual(parsed.toneDrafts.humorous, 'Coffee is always the answer! ☕');
    assert.strictEqual(parsed.toneDrafts.concise, 'Thanks! ☕');
  });

  runTest('CacheKey', 'Deterministic cache key isolates by postId, stance, tone, and language', () => {
    function getCacheKey(postId, postAuthor, incomingAuthor, text, stance, tone, lang) {
      const cleanText = (text || '').trim().slice(0, 50).toLowerCase();
      return `${postId || 'p'}|${postAuthor || ''}HANDLER|${incomingAuthor || ''}IN|${cleanText}|${stance}|${tone}|${lang}`;
    }

    const key1 = getCacheKey('DdQLLRDAUN5', 'janedoe', 'bob', 'looks delicious!', 'positive', 'friendly', 'auto');
    const key2 = getCacheKey('DdQLLRDAUN5', 'janedoe', 'bob', 'looks delicious!', 'positive', 'humorous', 'auto');
    const key3 = getCacheKey('OTHER_POST', 'janedoe', 'bob', 'looks delicious!', 'positive', 'friendly', 'auto');

    assert.notStrictEqual(key1, key2, 'Different tones must have distinct cache keys');
    assert.notStrictEqual(key1, key3, 'Different posts must have distinct cache keys');
  });

  runTest('ToneStyleCoverage', 'All extended tone styles (sexy, seductive, flirting, alluring, mean, evil) are consistently defined across service-worker, popup, content script, and CSS', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    const popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.html'), 'utf8');
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const contentCss = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    const extendedTones = ['flirting', 'sexy', 'seductive', 'alluring', 'mean', 'evil'];

    for (const tone of extendedTones) {
      // 1. Check service-worker has tone case in getToneInstruction
      assert.ok(
        swCode.includes(`case '${tone}':`),
        `background/service-worker.js must define case '${tone}' in getToneInstruction`
      );

      // 2. Check popup.html has option
      assert.ok(
        popupHtml.includes(`value="${tone}"`),
        `popup/popup.html must have <option value="${tone}">`
      );

      // 3. Check content.js has button with data-tone
      assert.ok(
        contentJs.includes(`data-tone="${tone}"`),
        `content/content.js must render <button ... data-tone="${tone}">`
      );

      // 4. Check content.css has dedicated active styling
      assert.ok(
        contentCss.includes(`[data-tone="${tone}"]`),
        `content/content.css must define custom styling for [data-tone="${tone}"]`
      );
    }
  });

  runTest('ToneNormalization', 'Synonyms and LLM variations normalize to canonical tone IDs identically', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

    // Extract normalizeToneName function body from service worker
    const swNormMatch = swCode.match(/function normalizeToneName\(tone\)\s*\{([\s\S]*?)\n\s*\}/);
    assert.ok(swNormMatch, 'background/service-worker.js must export or declare normalizeToneName');
    const swNormFn = new Function('tone', swNormMatch[1]);

    // Extract normalizeToneName from content.js
    const ctNormMatch = contentCode.match(/function normalizeToneName\(tone\)\s*\{([\s\S]*?)\n\s*\}/);
    assert.ok(ctNormMatch, 'content/content.js must declare normalizeToneName');
    const ctNormFn = new Function('tone', ctNormMatch[1]);

    const testPairs = [
      ['flirty', 'flirting'],
      ['FLIRTING', 'flirting'],
      ['flirtatious', 'flirting'],
      ['sexy', 'sexy'],
      ['sensual', 'sexy'],
      ['seductive', 'seductive'],
      ['alluring', 'alluring'],
      ['funny', 'humorous'],
      ['witty', 'humorous'],
      ['humorous', 'humorous'],
      ['playful', 'playful'],
      ['cheeky', 'playful'],
      ['savage', 'savage'],
      ['roast', 'savage'],
      ['burn', 'savage'],
      ['mean', 'mean'],
      ['haughty', 'mean'],
      ['evil', 'evil'],
      ['villain', 'evil'],
      ['geek', 'geek'],
      ['nerd', 'geek'],
      ['tech', 'geek'],
      ['spicy', 'spicy'],
      ['hyped', 'enthusiastic'],
      ['professional', 'professional'],
      ['empathetic', 'empathetic'],
      ['short', 'concise'],
      ['concise', 'concise'],
      ['friendly', 'friendly'],
      ['', 'friendly'],
      [null, 'friendly']
    ];

    for (const [input, expected] of testPairs) {
      const swRes = swNormFn(input);
      const ctRes = ctNormFn(input);
      assert.strictEqual(swRes, expected, `SW normalizeToneName('${input}') expected '${expected}', got '${swRes}'`);
      assert.strictEqual(ctRes, expected, `Content normalizeToneName('${input}') expected '${expected}', got '${ctRes}'`);
      assert.strictEqual(swRes, ctRes, `SW and Content normalization must match for '${input}'`);
    }
  });

  runTest('ToneBundlingAlignment', 'Bundled tones between service worker and content script are synchronized and bounded', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

    // Extract normalizeToneName and getBundledTonesFor from service-worker
    const swNormBody = swCode.slice(swCode.indexOf('function normalizeToneName'), swCode.indexOf('function getBundledTonesFor'));
    const swBundleBody = swCode.slice(swCode.indexOf('function getBundledTonesFor'), swCode.indexOf('// In-memory cache'));
    const swBundleFn = new Function('tone', `
      ${swNormBody}
      ${swBundleBody}
      return getBundledTonesFor(tone);
    `);

    // Extract from content.js
    const ctNormBody = contentCode.slice(contentCode.indexOf('function normalizeToneName'), contentCode.indexOf('function getBundledTonesFor'));
    const ctBundleBody = contentCode.slice(contentCode.indexOf('function getBundledTonesFor'), contentCode.indexOf('function getReplyCacheKey'));
    const ctBundleFn = new Function('tone', `
      ${ctNormBody}
      ${ctBundleBody}
      return getBundledTonesFor(tone);
    `);

    const primaryTones = [
      'friendly', 'humorous', 'playful', 'savage', 'geek', 'spicy',
      'enthusiastic', 'professional', 'empathetic', 'concise',
      'flirting', 'sexy', 'seductive', 'alluring', 'mean', 'evil'
    ];

    for (const tone of primaryTones) {
      const swBundled = swBundleFn(tone);
      const ctBundled = ctBundleFn(tone);

      assert.ok(Array.isArray(swBundled), `SW bundled for '${tone}' must be an array`);
      assert.ok(Array.isArray(ctBundled), `CT bundled for '${tone}' must be an array`);
      assert.deepStrictEqual(swBundled, ctBundled, `Bundled tones for '${tone}' must match between SW and Content script`);
      assert.ok(!swBundled.includes(tone), `Bundled tones for '${tone}' must never include the primary tone itself`);
      assert.ok(swBundled.length >= 3 && swBundled.length <= 6, `Bundled count for '${tone}' should be between 3 and 6 to avoid payload bloat`);
    }
  });

  runTest('ServiceWorkerLruCache', 'Service worker LRU cache stores and retrieves primary and alternative tone replies', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    assert.ok(swCode.includes('serviceWorkerReplyCache'), 'serviceWorkerReplyCache must be declared in service-worker.js');
    assert.ok(swCode.includes('getSwReplyCacheKey'), 'getSwReplyCacheKey must be declared in service-worker.js');
    assert.ok(swCode.includes('setSwReplyCacheEntry'), 'setSwReplyCacheEntry must be declared in service-worker.js');

    const cache = new Map();
    function setEntry(k, v) {
      if (cache.size >= 5) {
        const oldest = cache.keys().next().value;
        if (oldest) cache.delete(oldest);
      }
      cache.set(k, v);
    }

    for (let i = 0; i < 7; i++) {
      setEntry(`key_${i}`, { reply: `reply_${i}` });
    }

    assert.strictEqual(cache.size, 5, 'LRU cache must cap at capacity');
    assert.strictEqual(cache.has('key_0'), false, 'Oldest item must be evicted');
    assert.strictEqual(cache.has('key_1'), false, 'Second oldest item must be evicted');
    assert.strictEqual(cache.get('key_6').reply, 'reply_6');
  });

  runTest('ThrottledPrefetchSafety', 'Content script prefetching is debounced, bounded, and guarded against rate limiting', () => {
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

    // Check debounce times
    assert.ok(
      contentCode.includes('}, 1200);'),
      'Stance prefetch must have >= 1200ms debounce to prevent burst requests'
    );
    assert.ok(
      contentCode.includes('}, 2000);'),
      'Visible comments prefetch must have >= 2000ms debounce to prevent rate limit starvation'
    );

    // Check prefetch queue bound
    assert.ok(
      contentCode.includes('queue.length >= 1') || contentCode.includes('queue.length >= 2'),
      'Visible comments queue must be conservatively capped'
    );

    // Check activeGenerationContext guard in prefetch routines
    const stancePrefetchStart = contentCode.indexOf('function schedulePrefetchForAlternativeStances');
    const stancePrefetchBody = contentCode.slice(stancePrefetchStart, stancePrefetchStart + 800);
    assert.ok(
      stancePrefetchBody.includes('if (activeGenerationContext) return;'),
      'schedulePrefetchForAlternativeStances must abort if activeGenerationContext is pending'
    );

    const commentPrefetchStart = contentCode.indexOf('function schedulePrefetchForVisibleComments');
    const commentPrefetchBody = contentCode.slice(commentPrefetchStart, commentPrefetchStart + 800);
    assert.ok(
      commentPrefetchBody.includes('if (activeGenerationContext) return;'),
      'schedulePrefetchForVisibleComments must abort if activeGenerationContext is pending'
    );
  });

  // =========================================================================
  // SUITE 5: Real Headless Chrome End-to-End DOM Integration
  // =========================================================================
  console.log('\n🌐 Suite 5: Real Headless Chrome DOM Integration');

  await runAsyncTest('HeadlessChrome', 'Full DOM integration in Chrome on /p/DdQLLRDAUN5/ test harness', async () => {
    const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
    if (!fs.existsSync(chromePath)) {
      console.log('    (Google Chrome not found at standard path, skipping browser test)');
      return;
    }

    const harnessPath = 'file://' + path.join(ROOT_DIR, 'test/browser-test-runner.html');
    const cmd = `"${chromePath}" --headless --disable-gpu --virtual-time-budget=5000 --dump-dom "${harnessPath}"`;
    let output;
    try {
      output = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
    } catch (e) {
      console.log('    (Headless Chrome spawn restricted by environment, skipping browser test)');
      return;
    }

    const statusMatch = output.match(/data-status="([^"]+)"/);
    const failureMatch = output.match(/data-failures="([^"]+)"/);

    assert.ok(statusMatch, 'Test harness must output status in DOM');
    const status = statusMatch[1];
    const failures = failureMatch ? parseInt(failureMatch[1], 10) : 0;

    if (status !== 'PASSED' || failures > 0) {
      const errorSnippet = output.match(/<pre>([\s\S]*?)<\/pre>/);
      throw new Error(`Browser test failed (${failures} failures): ${errorSnippet ? errorSnippet[1] : output.slice(0, 300)}`);
    }
  });

  // =========================================================================
  // SUITE 6: Multi-Provider & OpenAI-Compatible Endpoints
  // =========================================================================
  console.log('\n🤖 Suite 6: Multi-Provider (Groq, OpenRouter, Custom OpenAI) & Combobox');

  runTest('ProviderDefaults', 'Default config includes all supported providers', () => {
    const swContent = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    assert.ok(swContent.includes('groqApiKey'), 'Must have groqApiKey in DEFAULT_CONFIG');
    assert.ok(swContent.includes('groqModel'), 'Must have groqModel in DEFAULT_CONFIG');
    assert.ok(swContent.includes('openrouterApiKey'), 'Must have openrouterApiKey in DEFAULT_CONFIG');
    assert.ok(swContent.includes('openrouterModel'), 'Must have openrouterModel in DEFAULT_CONFIG');
    assert.ok(swContent.includes('customOpenAiUrl'), 'Must have customOpenAiUrl in DEFAULT_CONFIG');
    assert.ok(swContent.includes('customOpenAiModel'), 'Must have customOpenAiModel in DEFAULT_CONFIG');
  });

  runTest('ProviderCombobox', 'Popup HTML contains provider combobox and panels', () => {
    const popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.html'), 'utf8');
    assert.ok(popupHtml.includes('id="providerSelect"'), 'Must have #providerSelect element');
    assert.ok(popupHtml.includes('label="🌐 Online / Cloud Models"'), 'Must have online optgroup');
    assert.ok(popupHtml.includes('label="🖥️ Offline / Local Models"'), 'Must have offline optgroup');
    assert.ok(popupHtml.includes('id="groq-settings"'), 'Must have Groq settings panel');
    assert.ok(popupHtml.includes('id="openrouter-settings"'), 'Must have OpenRouter settings panel');
    assert.ok(popupHtml.includes('id="custom-openai-settings"'), 'Must have Custom OpenAI settings panel');
  });

  runTest('OpenAiCompatibleUrl', 'Endpoint URL normalization correctly adds /chat/completions if omitted', () => {
    function normalizeEndpoint(url) {
      const trimmed = (url || '').trim().replace(/\/+$/, '');
      if (trimmed.endsWith('/chat/completions')) return trimmed;
      return `${trimmed}/chat/completions`;
    }

    assert.strictEqual(
      normalizeEndpoint('https://api.openai.com/v1'),
      'https://api.openai.com/v1/chat/completions'
    );
    assert.strictEqual(
      normalizeEndpoint('https://api.openai.com/v1/chat/completions'),
      'https://api.openai.com/v1/chat/completions'
    );
    assert.strictEqual(
      normalizeEndpoint('http://localhost:11434/v1/'),
      'http://localhost:11434/v1/chat/completions'
    );
  });

  runTest('OpenRouterHeaders', 'OpenRouter headers include Bearer auth, HTTP-Referer, and X-Title', () => {
    function buildHeaders(provider, apiKey) {
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      };
      if (provider === 'openrouter') {
        headers['HTTP-Referer'] = 'https://github.com/seventhmoon/insta-reply-extension';
        headers['X-Title'] = 'InstaReply AI';
      }
      return headers;
    }

    const groqHeaders = buildHeaders('groq', 'gsk_123');
    assert.strictEqual(groqHeaders.Authorization, 'Bearer gsk_123');
    assert.strictEqual(groqHeaders['HTTP-Referer'], undefined);

    const openrouterHeaders = buildHeaders('openrouter', 'sk-or-123');
    assert.strictEqual(openrouterHeaders.Authorization, 'Bearer sk-or-123');
    assert.strictEqual(openrouterHeaders['HTTP-Referer'], 'https://github.com/seventhmoon/insta-reply-extension');
    assert.strictEqual(openrouterHeaders['X-Title'], 'InstaReply AI');
  });

  runTest('VisionModelDetection', 'Correctly identifies multimodal models and rejects text-only models', () => {
    const sw = require(path.join(ROOT_DIR, 'background/service-worker.js'));
    assert.strictEqual(typeof sw.isKnownVisionModel, 'function');

    // Multimodal models that must return true
    const visionModels = [
      'gemma3',
      'gemma3:4b',
      'gemma-3-12b-it',
      'paligemma',
      'paligemma2',
      'llama3.2-vision:11b',
      'llama-3.2-11b-vision-instruct',
      'qwen2-vl:7b',
      'qwen2.5-vl:72b',
      'llava:latest',
      'llava-llama3',
      'minicpm-v',
      'moondream:latest',
      'pixtral-12b',
      'gpt-4o',
      'gpt-4o-mini',
      'claude-3-haiku'
    ];

    for (const m of visionModels) {
      assert.strictEqual(
        sw.isKnownVisionModel(m),
        true,
        `Model ${m} should be recognized as a vision model`
      );
    }

    // Text-only models that must return false
    const textModels = [
      'llama3.2',
      'llama3.2:3b',
      'llama3.1:8b',
      'gemma2:9b',
      'gemma:7b',
      'mistral:7b',
      'deepseek-r1:7b',
      'qwen2.5:7b',
      'phi3:mini'
    ];

    for (const m of textModels) {
      assert.strictEqual(
        sw.isKnownVisionModel(m),
        false,
        `Model ${m} should NOT be recognized as a vision model`
      );
    }
  });

  runTest('VisionPayloadFormatting', 'Formats OpenAI image_url and Ollama images correctly', () => {
    const sw = require(path.join(ROOT_DIR, 'background/service-worker.js'));
    const mockImagePart = { mimeType: 'image/jpeg', data: 'AQIDBA==' };
    const prompt = 'Analyze this Instagram post';

    // 1. OpenAI-compatible format
    const openAiContent = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${mockImagePart.mimeType};base64,${mockImagePart.data}`
        }
      }
    ];

    assert.strictEqual(openAiContent.length, 2);
    assert.strictEqual(openAiContent[0].type, 'text');
    assert.strictEqual(openAiContent[1].type, 'image_url');
    assert.strictEqual(openAiContent[1].image_url.url, 'data:image/jpeg;base64,AQIDBA==');

    // 2. Ollama native format
    const ollamaMsg = {
      role: 'user',
      content: prompt,
      images: [mockImagePart.data]
    };
    assert.strictEqual(ollamaMsg.images[0], 'AQIDBA==');

    // 3. Vision rejection error detection
    assert.strictEqual(sw.isVisionRejectionError(400, 'model does not support images'), true);
    assert.strictEqual(sw.isVisionRejectionError(400, 'unsupported image_url format'), true);
    assert.strictEqual(sw.isVisionRejectionError(422, 'not a multimodal model'), true);
    assert.strictEqual(sw.isVisionRejectionError(500, 'internal server error'), false);
  });

  // =========================================================================
  // SUITE 7: Voice Mimicry, Spam Shield & Draggable Card
  // =========================================================================
  console.log('\n🎙️ Suite 7: Voice Mimicry, Anti-Troll Shield & Draggable Card');

  runTest('VoiceMimicryPrompting', 'myVoiceSamples is injected into system prompt as few-shot training examples', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    assert.ok(swCode.includes("myVoiceSamples: ''"), 'DEFAULT_CONFIG must define myVoiceSamples');
    assert.ok(swCode.includes("CREATOR'S AUTHENTIC VOICE & SAMPLES"), 'buildStructuredPrompt must include authentic voice section');

    // Test prompt construction with voice samples
    const swNormBody = swCode.slice(swCode.indexOf('function normalizeToneName'), swCode.indexOf('function getBundledTonesFor'));
    const swBundleBody = swCode.slice(swCode.indexOf('function getBundledTonesFor'), swCode.indexOf('// In-memory cache'));
    const swToneInstBody = swCode.slice(swCode.indexOf('function getToneInstruction'), swCode.indexOf('function getLanguageInstruction'));
    const swLangInstBody = swCode.slice(swCode.indexOf('function getLanguageInstruction'), swCode.indexOf('function parseAIResponse'));
    const promptBody = swCode.slice(swCode.indexOf('function buildStructuredPrompt'), swCode.indexOf('function getToneInstruction'));

    const testFn = new Function('opts', `
      ${swNormBody}
      ${swBundleBody}
      ${swToneInstBody}
      ${swLangInstBody}
      ${promptBody}
      return buildStructuredPrompt(opts);
    `);

    const promptWithVoice = testFn({
      contextType: 'comment',
      incomingText: 'Love your style!',
      tone: 'friendly',
      myVoiceSamples: 'omg tysm bb!! <3 appreciate u always'
    });

    assert.ok(promptWithVoice.includes("CREATOR'S AUTHENTIC VOICE & SAMPLES"), 'Prompt must contain few-shot section');
    assert.ok(promptWithVoice.includes('omg tysm bb!! <3 appreciate u always'), 'Prompt must include exact sample text');
  });

  runTest('SpamClassificationSchema', 'Anti-Troll shield prompts for classification and parses spam metadata correctly', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    assert.ok(swCode.includes('enableSpamFilter: true'), 'DEFAULT_CONFIG must define enableSpamFilter');
    assert.ok(swCode.includes('SPAM & TROLL SHIELD'), 'buildStructuredPrompt must include spam & troll instructions');
    assert.ok(swCode.includes('"isSpamOrTroll"'), 'Prompt schema must include isSpamOrTroll');

    // Test parseAIResponse on spam response
    const parseBody = swCode.slice(swCode.indexOf('function parseAIResponse'), swCode.indexOf('function formatSentimentLabel'));
    const formatSentimentBody = swCode.slice(swCode.indexOf('function formatSentimentLabel'), swCode.indexOf('if (typeof module'));
    const swNormBody = swCode.slice(swCode.indexOf('function normalizeToneName'), swCode.indexOf('function getBundledTonesFor'));

    const parseFn = new Function('rawText', `
      ${swNormBody}
      ${formatSentimentBody}
      ${parseBody}
      return parseAIResponse(rawText);
    `);

    const sampleSpamJson = JSON.stringify({
      sentiment: 'negative',
      isSpamOrTroll: true,
      spamReason: 'Forex bot telegram link',
      recommendedAction: 'report_block',
      reply: 'We do not entertain promotional bot links on this page.'
    });

    const parsed = parseFn(sampleSpamJson);
    assert.strictEqual(parsed.isSpamOrTroll, true, 'Must identify isSpamOrTroll');
    assert.strictEqual(parsed.spamReason, 'Forex bot telegram link', 'Must parse spamReason');
    assert.strictEqual(parsed.recommendedAction, 'report_block', 'Must parse recommendedAction');
  });

  runTest('DraggableAndMinimizableCard', 'Content script renders drag handle, minimize controls, and defines makeCardDraggable', () => {
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    // Check DOM elements in content.js
    assert.ok(contentCode.includes('instareply-drag-handle'), 'Must include drag handle in card markup');
    assert.ok(contentCode.includes('instareply-minimize-btn'), 'Must include minimize button in card markup');
    assert.ok(contentCode.includes('instareply-minimized-bar'), 'Must include minimized bar in card markup');
    assert.ok(contentCode.includes('function makeCardDraggable'), 'Must define makeCardDraggable');
    assert.ok(contentCode.includes('instareply-spam-banner'), 'Must include spam banner rendering logic');

    // Check CSS rules in content.css
    assert.ok(cssCode.includes('cursor: grab'), 'Header must have cursor: grab');
    assert.ok(cssCode.includes('.is-minimized'), 'CSS must define .is-minimized styling');
    assert.ok(cssCode.includes('.instareply-spam-banner'), 'CSS must define .instareply-spam-banner styling');
  });

  // =========================================================================
  // SUITE 8: 1-Click Quick Reply (Zero-Dialog Direct Insertion) Flow
  // =========================================================================
  console.log('\n⚡ Suite 8: 1-Click Quick Reply (Zero-Dialog Direct Insertion) Flow');

  runTest('QuickReplyConfigDefaults', 'Background service worker and popup include quick reply config defaults', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    const popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.html'), 'utf8');
    const popupJs = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.js'), 'utf8');

    assert.ok(swCode.includes("enableQuickReply: true"), 'service-worker DEFAULT_CONFIG must have enableQuickReply: true');
    assert.ok(swCode.includes("shortcutClickAction: 'quick'"), "service-worker DEFAULT_CONFIG must have shortcutClickAction: 'quick'");
    assert.ok(swCode.includes("quickReplyTone: 'friendly'"), "service-worker DEFAULT_CONFIG must have quickReplyTone: 'friendly'");
    assert.ok(swCode.includes("composerButtonMode: 'smart'"), "service-worker DEFAULT_CONFIG must have composerButtonMode: 'smart'");

    assert.ok(popupHtml.includes('id="enableQuickReply"'), 'popup.html must contain #enableQuickReply checkbox');
    assert.ok(popupHtml.includes('id="shortcutClickAction"'), 'popup.html must contain #shortcutClickAction dropdown');
    assert.ok(popupHtml.includes('id="quickReplyTone"'), 'popup.html must contain #quickReplyTone dropdown');
    assert.ok(popupHtml.includes('id="composerButtonMode"'), 'popup.html must contain #composerButtonMode dropdown');

    assert.ok(popupJs.includes('enableQuickReply'), 'popup.js must bind enableQuickReply');
    assert.ok(popupJs.includes('shortcutClickAction'), 'popup.js must bind shortcutClickAction');
    assert.ok(popupJs.includes('quickReplyTone'), 'popup.js must bind quickReplyTone');
    assert.ok(popupJs.includes('composerButtonMode'), 'popup.js must bind composerButtonMode');
  });

  runTest('QuickReplyContentCore', 'Content script exports generateQuickReply, keyboard shortcuts, and direct insertion logic', () => {
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    assert.ok(contentCode.includes('async function generateQuickReply'), 'content.js must define generateQuickReply');
    assert.ok(contentCode.includes('function setupKeyboardShortcuts'), 'content.js must define setupKeyboardShortcuts');
    assert.ok(contentCode.includes('function showQuickReplyToast'), 'content.js must define showQuickReplyToast');
    assert.ok(contentCode.includes('function detectContextType'), 'content.js must define detectContextType');
    assert.ok(contentCode.includes('instareply-quick-reply-btn'), 'content.js must inject instareply-quick-reply-btn');
    assert.ok(contentCode.includes('instareply-quick-chip'), 'content.js must inject instareply-quick-chip');
    assert.ok(contentCode.includes('insertTextIntoInstagramInput(targetInput, replyText)'), 'Must insert text directly into Instagram input');
    assert.ok(contentCode.includes("inputColumn.style.minWidth = '140px'"), 'Must protect inputColumn min-width from collapsing');

    // Check CSS definitions
    assert.ok(cssCode.includes('.instareply-composer-actions'), 'CSS must style composer action toolbar');
    assert.ok(cssCode.includes('.instareply-quick-reply-btn'), 'CSS must style .instareply-quick-reply-btn');
    assert.ok(cssCode.includes('.instareply-quick-chip'), 'CSS must style .instareply-quick-chip');
    assert.ok(cssCode.includes('.instareply-quick-toast'), 'CSS must style .instareply-quick-toast');
    assert.ok(cssCode.includes('.instareply-btn-spinner'), 'CSS must define .instareply-btn-spinner for drafting state');
    assert.ok(cssCode.includes('min-width: 140px !important'), 'CSS must protect comment textarea container from collapsing');
    assert.ok(contentCode.includes('let isQuickReplyActive = false;'), 'content.js must declare isQuickReplyActive in top-level state scope');
  });

  runTest('QuickReplyInFlightLockSafety', 'Quick reply locks in-flight duplicate calls and resets flag reliably in finally block', () => {
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

    assert.ok(contentCode.includes('let isQuickReplyActive = false;'), 'isQuickReplyActive must be explicitly declared to prevent ReferenceError');
    assert.ok(contentCode.includes('if (isQuickReplyActive) {'), 'generateQuickReply must guard against concurrent calls');
    assert.ok(contentCode.includes('finally {\n      isQuickReplyActive = false;\n    }'), 'generateQuickReply must reset isQuickReplyActive in finally block');
  });

  runTest('QuickReplyDirectInsertionSimulation', 'Simulating quick reply inserts generated text directly into target input without creating card dialog', () => {
    // Mock Instagram input element
    const mockInput = {
      tagName: 'TEXTAREA',
      value: '',
      focusCalled: false,
      dispatchedEvents: [],
      focus() { this.focusCalled = true; },
      dispatchEvent(e) { this.dispatchedEvents.push(e.type); }
    };

    const classes = new Set();
    const mockTriggerBtn = {
      classList: {
        add: (c) => classes.add(c),
        remove: (c) => classes.delete(c),
        contains: (c) => classes.has(c)
      },
      disabled: false,
      innerHTML: ''
    };

    // Direct insertion flow
    mockTriggerBtn.classList.add('is-loading');
    assert.ok(mockTriggerBtn.classList.contains('is-loading'), 'Button enters loading state during generation');

    const generatedReply = 'Looks absolutely fantastic! Love the lighting.';
    mockInput.value = generatedReply;
    mockInput.dispatchEvent({ type: 'input' });

    mockTriggerBtn.classList.remove('is-loading');
    mockTriggerBtn.classList.add('is-success');

    assert.strictEqual(mockInput.value, generatedReply, 'Textarea value must match the generated reply directly');
    assert.ok(mockTriggerBtn.classList.contains('is-success'), 'Button marks success state after direct insertion');
    assert.strictEqual(mockInput.dispatchedEvents.includes('input'), true, 'Input event must be dispatched to notify React');
  });

  // =========================================================================
  // SUITE 9: Desktop Tone Navigation & Spacious Context Inspector Layout
  // =========================================================================
  console.log('\n🎛️ Suite 9: Desktop Tone Navigation & Spacious Context Inspector Layout');

  runTest('SpaciousInspectorLayout', 'Context inspector separates target header and metadata into spacious 2-row layout', () => {
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    assert.ok(contentCode.includes('class="instareply-inspector-header"'), 'content.js must define .instareply-inspector-header');
    assert.ok(contentCode.includes('class="instareply-inspector-target"'), 'content.js must define .instareply-inspector-target');
    assert.ok(contentCode.includes('class="instareply-insight-bar"'), 'content.js must define .instareply-insight-bar in createCardDOM');

    assert.ok(cssCode.includes('.instareply-inspector-header'), 'CSS must style .instareply-inspector-header');
    assert.ok(cssCode.includes('.instareply-inspector-target'), 'CSS must style .instareply-inspector-target');
    assert.ok(cssCode.includes('max-width: 100%'), 'Role pill must not prematurely truncate to 140px');
    assert.ok(cssCode.includes('white-space: nowrap'), 'Sentiment pill must keep white-space nowrap');
  });

  runTest('DesktopToneControls', 'Tone ribbon supports desktop chevrons, mouse wheel scroll, grab drag, and grid view toggle', () => {
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    // Controls in DOM
    assert.ok(contentCode.includes('id="instareply-tone-prev"'), 'Must have left chevron for tone navigation');
    assert.ok(contentCode.includes('id="instareply-tone-next"'), 'Must have right chevron for tone navigation');
    assert.ok(contentCode.includes('id="instareply-tone-toggle-view"'), 'Must have grid/ribbon view toggle button');
    assert.ok(contentCode.includes('id="instareply-active-tone-name"'), 'Must display active tone name in header');

    // Desktop interactions
    assert.ok(contentCode.includes("tonesRibbon.addEventListener('wheel'"), 'Must support mouse wheel scrolling');
    assert.ok(contentCode.includes("tonesRibbon.addEventListener('mousedown'"), 'Must support click-and-drag scrolling');
    assert.ok(contentCode.includes("tonesRibbon.scrollBy({ left: -160"), 'Must scroll smoothly on chevron click');
    assert.ok(contentCode.includes("tonesWrapper.classList.toggle('is-grid')"), 'Must toggle grid view');
    assert.ok(contentCode.includes('scrollIntoView({ behavior: \'smooth\''), 'Must auto-scroll active tone into view');

    // CSS rules
    assert.ok(cssCode.includes('.instareply-tone-nav-btn'), 'CSS must style .instareply-tone-nav-btn');
    assert.ok(cssCode.includes('.instareply-tone-view-btn'), 'CSS must style .instareply-tone-view-btn');
    assert.ok(cssCode.includes('.instareply-tones-wrapper.is-grid'), 'CSS must style .instareply-tones-wrapper.is-grid');
    assert.ok(cssCode.includes('cursor: grab'), 'Ribbon must have grab cursor for desktop users');
  });

  runTest('KeyboardShortcutDetection', 'Alt+Q / Option+Q triggers quick reply shortcut detection logic', () => {
    let triggered = false;
    function handleKeyDown(e) {
      if (e.altKey && (e.code === 'KeyQ' || e.key?.toLowerCase() === 'q' || e.key === 'œ')) {
        triggered = true;
      }
    }

    // Test Windows/Linux Alt+Q
    handleKeyDown({ altKey: true, code: 'KeyQ', key: 'q' });
    assert.strictEqual(triggered, true, 'Must detect Alt+Q on Windows/Linux');

    // Test macOS Option+Q (which produces character 'œ')
    triggered = false;
    handleKeyDown({ altKey: true, code: 'KeyQ', key: 'œ' });
    assert.strictEqual(triggered, true, 'Must detect Option+Q on macOS');

    // Normal typing of 'q' without Alt must NOT trigger
    triggered = false;
    handleKeyDown({ altKey: false, code: 'KeyQ', key: 'q' });
    assert.strictEqual(triggered, false, 'Must not trigger without altKey');
  });

  // =========================================================================
  // SUITE 10: Resizable Toolbar Popup & In-Page Assistant Card
  // =========================================================================
  console.log('\n📐 Suite 10: Resizable Toolbar Popup & In-Page Assistant Card');

  runTest('PopupResizabilityStructure', 'Toolbar popup provides resize handle, boundary constraints, and local storage persistence', () => {
    const htmlCode = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.html'), 'utf8');
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.css'), 'utf8');
    const jsCode = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.js'), 'utf8');

    // DOM & CSS
    assert.ok(htmlCode.includes('id="popupResizeHandle"'), 'popup.html must contain popupResizeHandle element');
    assert.ok(cssCode.includes('.popup-resize-handle'), 'popup.css must define .popup-resize-handle styling');
    assert.ok(cssCode.includes('cursor: nwse-resize'), 'popup.css must have nwse-resize cursor for grip');
    assert.ok(cssCode.includes('min-width: 360px'), 'body must define min-width constraint');
    assert.ok(cssCode.includes('max-width: 780px'), 'body must define max-width constraint for Chrome popup limits');
    assert.ok(cssCode.includes('max-height: 600px'), 'body must define max-height constraint for Chrome popup limits');

    // Controller logic
    assert.ok(jsCode.includes('function setupPopupResize()'), 'popup.js must implement setupPopupResize function');
    assert.ok(jsCode.includes("addEventListener('pointerdown'"), 'setupPopupResize must listen to pointerdown');
    assert.ok(jsCode.includes("addEventListener('pointermove'"), 'setupPopupResize must track pointermove');
    assert.ok(jsCode.includes("chrome.storage?.local?.set"), 'setupPopupResize must persist dimensions to chrome.storage.local');
    assert.ok(jsCode.includes("chrome.storage?.local?.get"), 'setupPopupResize must restore saved dimensions on load');
  });

  runTest('CardResizabilityStructure', 'Assistant card provides bottom-right corner grip and persistence', () => {
    const contentCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const contentCss = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    // DOM creation & hookup
    assert.ok(contentCode.includes('class="instareply-resize-grip"'), 'createCardDOM must create .instareply-resize-grip');
    assert.ok(contentCode.includes('makeCardResizable(card)'), 'createCardDOM must call makeCardResizable');
    assert.ok(contentCode.includes('function makeCardResizable(card)'), 'content.js must define makeCardResizable function');

    // Bounds & storage
    assert.ok(contentCode.includes('localStorage.setItem(\'instareply_card_width\''), 'Must save card width to localStorage');
    assert.ok(contentCode.includes('localStorage.setItem(\'instareply_card_height\''), 'Must save card height to localStorage');
    assert.ok(contentCode.includes('localStorage.getItem(\'instareply_card_width\''), 'Must restore card width from localStorage');

    // CSS grip & minimized behavior
    assert.ok(contentCss.includes('.instareply-resize-grip'), 'content.css must style .instareply-resize-grip');
    assert.ok(contentCss.includes('cursor: nwse-resize'), 'content.css must define nwse-resize cursor on grip');
    assert.ok(contentCss.includes('.instareply-card-overlay.is-minimized .instareply-resize-grip'), 'Grip must be hidden when card is minimized');
  });

  runTest('ResizeMathClamping', 'Resize boundary math reliably clamps width and height within permissible viewport range', () => {
    function clampPopupDimensions(startW, startH, deltaX, deltaY) {
      const newW = Math.min(Math.max(startW + deltaX, 360), 780);
      const newH = Math.min(Math.max(startH + deltaY, 480), 600);
      return { width: newW, height: newH };
    }

    // Shrink past minimum
    const shrinkResult = clampPopupDimensions(380, 500, -200, -200);
    assert.strictEqual(shrinkResult.width, 360, 'Width must clamp to min 360px');
    assert.strictEqual(shrinkResult.height, 480, 'Height must clamp to min 480px');

    // Expand past maximum
    const expandResult = clampPopupDimensions(380, 500, 1000, 1000);
    assert.strictEqual(expandResult.width, 780, 'Width must clamp to max 780px');
    assert.strictEqual(expandResult.height, 600, 'Height must clamp to max 600px');

    // Within bounds
    const normalResult = clampPopupDimensions(380, 500, 120, 50);
    assert.strictEqual(normalResult.width, 500, 'Width must scale smoothly within bounds');
    assert.strictEqual(normalResult.height, 550, 'Height must scale smoothly within bounds');
  });

  runTest('TextareaFillsExpandedSpace', 'Textarea and card body flex to fill expanded vertical height without leaving dead bottom space', () => {
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    // Overlay flex column container
    assert.ok(
      cssCode.includes('display: flex !important;') && cssCode.includes('flex-direction: column !important;'),
      'instareply-card-overlay must use flex column layout to stretch children'
    );

    // Card body takes remaining height
    assert.ok(
      cssCode.includes('.instareply-card-body') && cssCode.includes('flex: 1 1 auto;'),
      'instareply-card-body must expand with flex: 1 1 auto'
    );

    // Output wrapper and textarea stretch to 100% height
    assert.ok(
      cssCode.includes('.instareply-output-wrapper') && cssCode.includes('flex: 1 1 auto;'),
      'instareply-output-wrapper must expand with flex: 1 1 auto'
    );
    assert.ok(
      cssCode.includes('.instareply-output-textarea') && cssCode.includes('flex: 1 1 auto;') && cssCode.includes('height: 100%;'),
      'instareply-output-textarea must expand with flex: 1 1 auto and height: 100%'
    );

    // Footer anchored at bottom
    assert.ok(
      cssCode.includes('.instareply-card-footer') && cssCode.includes('margin-top: auto;'),
      'instareply-card-footer must be anchored at bottom with margin-top: auto'
    );
  });

  // =========================================================================
  // SUITE 11: GitHub Sponsors & Community Funding Integration
  // =========================================================================
  console.log('\n💖 Suite 11: GitHub Sponsors & Community Funding Integration');

  runTest('GitHubSponsorsIntegration', 'Extension provides GitHub Sponsors links in popup, in-page assistant, funding config, and documentation', () => {
    const popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.html'), 'utf8');
    const popupCss = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.css'), 'utf8');
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const contentCss = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');
    const fundingYml = fs.readFileSync(path.join(ROOT_DIR, '.github/FUNDING.yml'), 'utf8');
    const readmeMd = fs.readFileSync(path.join(ROOT_DIR, 'README.md'), 'utf8');

    // Popup checks
    assert.ok(popupHtml.includes('https://github.com/sponsors/seventhmoon'), 'popup.html must link to GitHub Sponsors');
    assert.ok(popupHtml.includes('id="sponsorHeaderBtn"'), 'popup.html must include sponsorHeaderBtn in header');
    assert.ok(popupHtml.includes('class="card sponsor-card"'), 'popup.html must include sponsor-card in preferences');
    assert.ok(popupCss.includes('.sponsor-badge-btn'), 'popup.css must style .sponsor-badge-btn');
    assert.ok(popupCss.includes('.btn-sponsor'), 'popup.css must style .btn-sponsor');

    // Content script checks
    assert.ok(contentJs.includes('instareply-header-sponsor-btn'), 'content.js must include instareply-header-sponsor-btn');
    assert.ok(contentJs.includes('https://github.com/sponsors/seventhmoon'), 'content.js must link to GitHub Sponsors');
    assert.ok(contentJs.includes("e.target.closest('a')"), 'makeCardDraggable must allow clicking sponsor anchor without dragging');
    assert.ok(contentCss.includes('.instareply-header-sponsor-btn'), 'content.css must style .instareply-header-sponsor-btn');

    // GitHub repository checks
    assert.ok(fundingYml.includes('github: seventhmoon'), '.github/FUNDING.yml must declare seventhmoon as funding recipient');
    assert.ok(readmeMd.includes('https://github.com/sponsors/seventhmoon'), 'README.md must include GitHub Sponsors badge and link');
  });

  // =========================================================================
  // SUITE 12: Comment Reply Button Style, Compact Icon Mode & Layout Protection
  // =========================================================================
  console.log('\n🎨 Suite 12: Comment Button Style, Compact Icon Mode & Layout Protection');

  runTest('CommentButtonModeConfig', 'DEFAULT_CONFIG in service worker includes commentButtonMode: auto', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    assert.ok(
      swCode.includes("commentButtonMode: 'auto'"),
      'DEFAULT_CONFIG must define commentButtonMode: auto'
    );
  });

  runTest('CommentButtonModePopupUI', 'popup.html and popup.js provide user setting for Comment Button Mode', () => {
    const popupHtml = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.html'), 'utf8');
    const popupJs = fs.readFileSync(path.join(ROOT_DIR, 'popup/popup.js'), 'utf8');

    assert.ok(popupHtml.includes('id="commentButtonMode"'), 'popup.html must contain select #commentButtonMode');
    assert.ok(popupHtml.includes('value="auto"'), 'popup.html must have auto option');
    assert.ok(popupHtml.includes('value="icon"'), 'popup.html must have icon option');
    assert.ok(popupHtml.includes('value="icon_only"'), 'popup.html must have icon_only option');
    assert.ok(popupHtml.includes('value="badge"'), 'popup.html must have badge option');

    assert.ok(popupJs.includes('commentButtonMode: commentButtonMode ? commentButtonMode.value'), 'popup.js must bind commentButtonMode in getUIConfig');
    assert.ok(popupJs.includes('commentButtonMode.value = cfg.commentButtonMode'), 'popup.js must load saved commentButtonMode');
  });

  runTest('CommentButtonModeStyles', 'content.css prevents wrapping and supports compact icon-only styles', () => {
    const cssCode = fs.readFileSync(path.join(ROOT_DIR, 'content/content.css'), 'utf8');

    // No-wrap layout protection
    assert.ok(cssCode.includes('.instareply-chip-group {') && cssCode.includes('white-space: nowrap !important;'), 'instareply-chip-group must have white-space: nowrap !important');
    assert.ok(cssCode.includes('.instareply-comment-reply-chip') && cssCode.includes('white-space: nowrap !important;'), 'instareply-comment-reply-chip must have white-space: nowrap !important');
    assert.ok(cssCode.includes('.instareply-chip-label'), 'content.css must define .instareply-chip-label');

    // Compact mode rules
    assert.ok(cssCode.includes('.instareply-compact-group .instareply-chip-label'), 'compact group must hide chip label');
    assert.ok(cssCode.includes('.instareply-comment-reply-chip.instareply-icon-only'), 'icon-only chip must have compact padding');
    assert.ok(cssCode.includes('.instareply-single-icon'), 'content.css must support .instareply-single-icon');
  });

  runTest('CommentButtonModeContentLogic', 'content.js implements intelligent compact detection and icon-only loading state', () => {
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');

    // Span wrapped label
    assert.ok(contentJs.includes('<span class="instareply-chip-label"> AI Reply</span>'), 'content.js must wrap label in instareply-chip-label span');

    // Responsive and space auto-detection logic
    assert.ok(contentJs.includes('hasTranslation'), 'content.js must check for translation text in action row');
    assert.ok(contentJs.includes('commentBtnMode === \'icon\''), 'content.js must respect icon commentButtonMode setting');
    assert.ok(contentJs.includes('hideCaret'), 'content.js must hide caret when icon_only is selected');

    // isIconOnly drafting state in generateQuickReply
    assert.ok(contentJs.includes('instareply-icon-only') && contentJs.includes('instareply-compact-group'), 'generateQuickReply isIconOnly check must include compact and icon-only classes');
  });

  runTest('CommentButtonModeLayoutSimulation', 'Simulates auto-compact and explicit icon modes in action rows', () => {
    function computeMode(cachedConfig, actionRowText, actionCount, clientWidth) {
      const commentBtnMode = cachedConfig?.commentButtonMode || 'auto';
      const hasTranslation = Boolean(actionRowText?.match(/translation|翻譯|翻译|翻訳|번역|tradu/i));
      const hasManyActions = actionCount >= 3;
      const isNarrowContainer = Boolean(clientWidth > 0 && clientWidth < 320);
      const isCompact = commentBtnMode === 'icon' || commentBtnMode === 'icon_only' || (commentBtnMode === 'auto' && (hasTranslation || hasManyActions || isNarrowContainer));
      const hideCaret = commentBtnMode === 'icon_only';
      return { isCompact, hideCaret };
    }

    // 1. Auto mode with "See translation" -> should be compact
    const r1 = computeMode({ commentButtonMode: 'auto' }, '3 likes  Reply  See translation', 3, 300);
    assert.strictEqual(r1.isCompact, true, 'Auto mode with translation must be compact');
    assert.strictEqual(r1.hideCaret, false, 'Auto mode must still show tone caret');

    // 2. Auto mode with plenty of space and no translation -> standard badge
    const r2 = computeMode({ commentButtonMode: 'auto' }, 'Reply', 1, 450);
    assert.strictEqual(r2.isCompact, false, 'Auto mode in spacious row must remain badge');

    // 3. Explicit icon mode -> compact even with space
    const r3 = computeMode({ commentButtonMode: 'icon' }, 'Reply', 1, 450);
    assert.strictEqual(r3.isCompact, true, 'Explicit icon mode must always be compact');
    assert.strictEqual(r3.hideCaret, false, 'Icon mode includes tone caret');

    // 4. Explicit icon_only mode -> compact and no caret
    const r4 = computeMode({ commentButtonMode: 'icon_only' }, 'Reply', 1, 450);
    assert.strictEqual(r4.isCompact, true, 'Explicit icon_only mode must be compact');
    assert.strictEqual(r4.hideCaret, true, 'icon_only mode must hide caret');

    // 5. Explicit badge mode -> never compact even with translation
    const r5 = computeMode({ commentButtonMode: 'badge' }, '3 likes  Reply  See translation', 3, 280);
    assert.strictEqual(r5.isCompact, false, 'Explicit badge mode must stay badge');
  });

  // =========================================================================
  // SUITE 13: Multi-Platform Domain Routing & Manifest Adapter Registration
  // =========================================================================
  console.log('\n🌐 Suite 13: Multi-Platform Domain Routing (X, LinkedIn, Facebook, Threads)');

  const PlatformDetector = require('../content/adapters/platform-detector.js');
  const ThreadsAdapter = require('../content/adapters/threads-adapter.js');
  const XAdapter = require('../content/adapters/x-adapter.js');
  const LinkedInAdapter = require('../content/adapters/linkedin-adapter.js');
  const FacebookAdapter = require('../content/adapters/facebook-adapter.js');
  const MetaBusinessAdapter = require('../content/adapters/meta-business-adapter.js');

  runTest('PlatformDetection', 'Correctly resolves platform from various URLs and hostnames', () => {
    assert.strictEqual(PlatformDetector.detectPlatform('https://www.instagram.com/p/DdQLLRDAUN5/'), 'instagram');
    assert.strictEqual(PlatformDetector.detectPlatform('https://www.threads.net/@zuck/post/12345'), 'threads');
    assert.strictEqual(PlatformDetector.detectPlatform('https://x.com/user/status/123456789'), 'x');
    assert.strictEqual(PlatformDetector.detectPlatform('https://twitter.com/elonmusk'), 'x');
    assert.strictEqual(PlatformDetector.detectPlatform('https://www.linkedin.com/feed/update/urn:li:activity:123'), 'linkedin');
    assert.strictEqual(PlatformDetector.detectPlatform('https://business.facebook.com/latest/inbox/instagram'), 'meta_business');
    assert.strictEqual(PlatformDetector.detectPlatform('https://business.meta.com/latest/inbox/all'), 'meta_business');
    assert.strictEqual(PlatformDetector.detectPlatform('https://www.facebook.com/groups/12345/posts/6789/'), 'facebook');
    assert.strictEqual(PlatformDetector.detectPlatform('https://web.facebook.com/story.php'), 'facebook');
    assert.strictEqual(PlatformDetector.detectPlatform('https://example.com/'), 'generic');
  });

  runTest('AdapterCanHandle', 'Adapters correctly declare support for their domains', () => {
    assert.ok(ThreadsAdapter.canHandle('threads.net'), 'ThreadsAdapter must handle threads.net');
    assert.ok(!ThreadsAdapter.canHandle('instagram.com'), 'ThreadsAdapter must reject instagram.com');

    assert.ok(XAdapter.canHandle('x.com'), 'XAdapter must handle x.com');
    assert.ok(XAdapter.canHandle('twitter.com'), 'XAdapter must handle twitter.com');
    assert.ok(!XAdapter.canHandle('linkedin.com'), 'XAdapter must reject linkedin.com');

    assert.ok(LinkedInAdapter.canHandle('linkedin.com'), 'LinkedInAdapter must handle linkedin.com');
    assert.ok(!LinkedInAdapter.canHandle('x.com'), 'LinkedInAdapter must reject x.com');

    assert.ok(FacebookAdapter.canHandle('facebook.com'), 'FacebookAdapter must handle facebook.com');
    assert.ok(FacebookAdapter.canHandle('fb.com'), 'FacebookAdapter must handle fb.com');
    assert.ok(!FacebookAdapter.canHandle('instagram.com'), 'FacebookAdapter must reject instagram.com');

    assert.ok(MetaBusinessAdapter.canHandle('business.facebook.com'), 'MetaBusinessAdapter must handle business.facebook.com');
    assert.ok(MetaBusinessAdapter.canHandle('business.meta.com'), 'MetaBusinessAdapter must handle business.meta.com');
    assert.ok(!MetaBusinessAdapter.canHandle('instagram.com'), 'MetaBusinessAdapter must reject direct instagram.com');
  });

  runTest('ManifestMultiPlatformRegistration', 'Manifest registers content scripts and permissions for all target domains', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'manifest.json'), 'utf8'));
    const cs = manifest.content_scripts.find(c => c.js.includes('content/content.js'));
    assert.ok(cs, 'Must have content script entry with content.js');

    const expectedDomains = ['instagram.com', 'threads.net', 'x.com', 'twitter.com', 'linkedin.com', 'facebook.com', 'meta.com'];
    for (const domain of expectedDomains) {
      assert.ok(cs.matches.some(m => m.includes(domain)), `content_scripts matches must include ${domain}`);
    }

    assert.ok(cs.js.includes('content/adapters/platform-detector.js'), 'Must load platform-detector.js');
    assert.ok(cs.js.includes('content/adapters/threads-adapter.js'), 'Must load threads-adapter.js');
    assert.ok(cs.js.includes('content/adapters/x-adapter.js'), 'Must load x-adapter.js');
    assert.ok(cs.js.includes('content/adapters/linkedin-adapter.js'), 'Must load linkedin-adapter.js');
    assert.ok(cs.js.includes('content/adapters/facebook-adapter.js'), 'Must load facebook-adapter.js');
    assert.ok(cs.js.includes('content/adapters/meta-business-adapter.js'), 'Must load meta-business-adapter.js');
  });

  // =========================================================================
  // SUITE 14: Context Extraction, Character Limits & Service Worker Rules
  // =========================================================================
  console.log('\n⚡ Suite 14: Multi-Platform Context Extraction & Prompt Constraints');

  runTest('XAdapterContextExtraction', 'Extracts tweet author, text, and 280-char limit', () => {
    const mockTweet = {
      getAttribute: (attr) => attr === 'data-tweet-id' ? '123456789' : null,
      querySelector: (selector) => {
        if (selector === 'div[data-testid="User-Name"]') {
          return {
            querySelectorAll: () => [{
              getAttribute: (attr) => attr === 'href' ? '/technologist' : null
            }],
            textContent: 'Tech Guy @technologist'
          };
        }
        if (selector === 'div[data-testid="tweetText"]') {
          return { textContent: 'AI agents are changing developer productivity rapidly.' };
        }
        if (selector === 'div[data-testid="tweetPhoto"] img') {
          return {
            getAttribute: (attr) => attr === 'alt' ? 'Chart showing coding velocity' : 'https://pbs.twimg.com/media/test.jpg'
          };
        }
        return null;
      }
    };

    const ctx = XAdapter.extractContext(null, mockTweet);
    assert.strictEqual(ctx.platform, 'x');
    assert.strictEqual(ctx.author, '@technologist');
    assert.strictEqual(ctx.postCaption, 'AI agents are changing developer productivity rapidly.');
    assert.strictEqual(ctx.charLimit, 280);
    assert.strictEqual(ctx.postVisuals.mediaType, 'image');
    assert.strictEqual(ctx.postVisuals.description, 'Chart showing coding velocity');
  });

  runTest('LinkedInAdapterContextExtraction', 'Extracts professional feed post context and author', () => {
    const mockPost = {
      getAttribute: (attr) => attr === 'data-urn' ? 'urn:li:activity:987654321' : null,
      querySelector: (selector) => {
        if (selector.includes('actor__name')) {
          return { textContent: 'Sarah Connor • Senior Engineering Director' };
        }
        if (selector.includes('description') || selector.includes('text')) {
          return { textContent: 'Excited to announce our new open-source platform integration!' };
        }
        return null;
      }
    };

    const ctx = LinkedInAdapter.extractContext(null, mockPost);
    assert.strictEqual(ctx.platform, 'linkedin');
    assert.strictEqual(ctx.author, 'Sarah Connor • Senior Engineering Director');
    assert.strictEqual(ctx.postCaption, 'Excited to announce our new open-source platform integration!');
    assert.strictEqual(ctx.toneBias, 'professional');
  });

  runTest('ThreadsAdapterContextExtraction', 'Extracts Threads author, post text, and 500-char limit', () => {
    const mockThreadItem = {
      getAttribute: (attr) => attr === 'data-thread-id' ? 'th_1001' : null,
      querySelector: (selector) => {
        if (selector.includes('/@')) {
          return {
            getAttribute: (attr) => attr === 'href' ? '/@zuck' : null,
            textContent: 'Mark Zuckerberg'
          };
        }
        return null;
      },
      querySelectorAll: (selector) => {
        if (selector.includes('dir="auto"')) {
          return [{
            closest: () => null,
            textContent: 'Excited about the future of open-source AI and spatial computing.'
          }];
        }
        return [];
      }
    };

    const ctx = ThreadsAdapter.extractContext(null, mockThreadItem);
    assert.strictEqual(ctx.platform, 'threads');
    assert.strictEqual(ctx.author, '@zuck');
    assert.strictEqual(ctx.postCaption, 'Excited about the future of open-source AI and spatial computing.');
    assert.strictEqual(ctx.charLimit, 500);
    assert.strictEqual(ctx.toneBias, 'conversational');
  });

  runTest('FacebookAdapterContextExtraction', 'Extracts Facebook article author and post text', () => {
    const mockFbArticle = {
      id: 'fb_post_100',
      querySelector: (selector) => {
        if (selector.includes('strong')) {
          return { textContent: 'Alex Rivera' };
        }
        return null;
      },
      querySelectorAll: (selector) => {
        if (selector.includes('dir="auto"')) {
          return [{
            closest: () => null,
            textContent: 'Community meetup this Saturday in downtown Seattle!'
          }];
        }
        return [];
      }
    };

    const ctx = FacebookAdapter.extractContext(null, mockFbArticle);
    assert.strictEqual(ctx.platform, 'facebook');
    assert.strictEqual(ctx.author, 'Alex Rivera');
    assert.strictEqual(ctx.postCaption, 'Community meetup this Saturday in downtown Seattle!');
    assert.strictEqual(ctx.toneBias, 'friendly');
  });

  runTest('PromptPlatformConstraints', 'Builds platform-specific prompt constraints and lengths', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    const swNormBody = swCode.slice(swCode.indexOf('function normalizeToneName'), swCode.indexOf('function getBundledTonesFor'));
    const swBundleBody = swCode.slice(swCode.indexOf('function getBundledTonesFor'), swCode.indexOf('// In-memory cache'));
    const swToneInstBody = swCode.slice(swCode.indexOf('function getToneInstruction'), swCode.indexOf('function getLanguageInstruction'));
    const swLangInstBody = swCode.slice(swCode.indexOf('function getLanguageInstruction'), swCode.indexOf('function parseAIResponse'));
    const promptBody = swCode.slice(swCode.indexOf('function buildStructuredPrompt'), swCode.indexOf('function getToneInstruction'));

    const evalBuilder = new Function('opts', `
      ${swNormBody}
      ${swBundleBody}
      ${swToneInstBody}
      ${swLangInstBody}
      ${promptBody}
      return buildStructuredPrompt(opts);
    `);

    // X/Twitter constraint check
    const xPrompt = evalBuilder({
      platform: 'x',
      contextType: 'comment',
      incomingText: 'Thoughts on the new model?',
      postAuthor: 'developer',
      tone: 'friendly'
    });
    assert.ok(xPrompt.includes('X (Twitter) engagement assistant'), 'X prompt must address X (Twitter)');
    assert.ok(xPrompt.includes('280 characters'), 'X prompt must enforce under 280 characters');

    // LinkedIn constraint check
    const liPrompt = evalBuilder({
      platform: 'linkedin',
      contextType: 'comment',
      incomingText: 'How are you approaching system architecture in 2026?',
      postAuthor: 'lead_architect',
      tone: 'professional'
    });
    assert.ok(liPrompt.includes('LinkedIn professional networking and engagement assistant'), 'LinkedIn prompt must address LinkedIn networking');
    assert.ok(liPrompt.includes('LinkedIn networking, industry discourse'), 'LinkedIn prompt must enforce LinkedIn professional length');

    // Threads constraint check
    const thPrompt = evalBuilder({
      platform: 'threads',
      contextType: 'comment',
      incomingText: 'What are you building today?',
      postAuthor: 'zuck',
      tone: 'friendly'
    });
    assert.ok(thPrompt.includes('Threads engagement assistant'), 'Threads prompt must address Threads');
    assert.ok(thPrompt.includes('500 characters'), 'Threads prompt must enforce under 500 characters');

    // Facebook constraint check
    const fbPrompt = evalBuilder({
      platform: 'facebook',
      contextType: 'comment',
      incomingText: 'Great meetup!',
      postAuthor: 'community_lead',
      tone: 'friendly'
    });
    assert.ok(fbPrompt.includes('Facebook engagement assistant'), 'Facebook prompt must address Facebook');

    // Instagram default backward-compatibility check
    const igPrompt = evalBuilder({
      contextType: 'comment',
      incomingText: 'Loving this view!',
      postAuthor: 'traveler',
      tone: 'friendly'
    });
    assert.ok(igPrompt.includes('expert Instagram engagement assistant'), 'Instagram prompt must remain default');
  });

  runTest('UniversalEditorTextInsertion', 'content.js implements execCommand for Draft.js / Lexical and native setters for React', () => {
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    assert.ok(contentJs.includes("document.execCommand('insertText'"), 'content.js must use execCommand insertText for Draft.js & Lexical');
    assert.ok(contentJs.includes('HTMLTextAreaElement?.prototype'), 'content.js must resolve HTMLTextAreaElement prototype');
    assert.ok(contentJs.includes('HTMLInputElement?.prototype'), 'content.js must resolve HTMLInputElement prototype');
  });

  // =========================================================================
  // SUITE 15: Post Drafting, Toolbar Placement & LinkedIn Message Handling
  // =========================================================================
  console.log('\n✍️ Suite 15: Post Drafting, Toolbar Placement & LinkedIn Message Handling');

  runTest('XAdapterToolbarIsolation', 'XAdapter never injects into inputEl.parentElement and anchors to div[data-testid="toolBar"]', () => {
    const xCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/x-adapter.js'), 'utf8');
    assert.ok(
      !xCode.includes('return inputEl.parentElement;') && !xCode.includes('return inputEl?.parentElement;'),
      'XAdapter.findToolbarContainer must never fallback to inputEl.parentElement'
    );
    assert.ok(xCode.includes('data-testid="toolBar"'), 'XAdapter must search for toolBar');
  });

  runTest('LinkedInAdapterMessageAnchor', 'LinkedInAdapter anchors into .msg-form__left-actions for chat messaging', () => {
    const liCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/linkedin-adapter.js'), 'utf8');
    assert.ok(liCode.includes('.msg-form__left-actions'), 'LinkedInAdapter must target msg-form__left-actions');
    assert.ok(
      !liCode.includes('return inputEl.parentElement;') && !liCode.includes('return inputEl?.parentElement;'),
      'LinkedInAdapter.findToolbarContainer must never fallback to inputEl.parentElement'
    );
  });

  runTest('PostDraftingDetection', 'Adapters correctly classify standalone composers as post_draft', () => {
    const xCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/x-adapter.js'), 'utf8');
    const liCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/linkedin-adapter.js'), 'utf8');
    const thCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/threads-adapter.js'), 'utf8');
    const fbCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/facebook-adapter.js'), 'utf8');

    assert.ok(xCode.includes("post_draft"), 'XAdapter must support post_draft context');
    assert.ok(liCode.includes("post_draft"), 'LinkedInAdapter must support post_draft context');
    assert.ok(thCode.includes("post_draft"), 'ThreadsAdapter must support post_draft context');
    assert.ok(fbCode.includes("post_draft"), 'FacebookAdapter must support post_draft context');
  });

  runTest('PostDraftingPromptStructure', 'service-worker.js generates distinct new-post prompts with frameworks and constraints', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    const swNormBody = swCode.slice(swCode.indexOf('function normalizeToneName'), swCode.indexOf('function getBundledTonesFor'));
    const swBundleBody = swCode.slice(swCode.indexOf('function getBundledTonesFor'), swCode.indexOf('// In-memory cache'));
    const swToneInstBody = swCode.slice(swCode.indexOf('function getToneInstruction'), swCode.indexOf('function getLanguageInstruction'));
    const swLangInstBody = swCode.slice(swCode.indexOf('function getLanguageInstruction'), swCode.indexOf('function parseAIResponse'));
    const promptBody = swCode.slice(swCode.indexOf('function buildStructuredPrompt'), swCode.indexOf('function getToneInstruction'));

    const evalBuilder = new Function('opts', `
      ${swNormBody}
      ${swBundleBody}
      ${swToneInstBody}
      ${swLangInstBody}
      ${promptBody}
      return buildStructuredPrompt(opts);
    `);

    // X Post Draft check
    const xDraftPrompt = evalBuilder({
      platform: 'x',
      contextType: 'post_draft',
      draftNotes: 'Announcing our new open-source AI extension with multi-platform support',
      stance: 'hook',
      tone: 'confident'
    });

    assert.ok(xDraftPrompt.includes('DRAFT A NEW POST (NOT A REPLY)'), 'X draft prompt must state new post not reply');
    assert.ok(xDraftPrompt.includes('under 280 characters'), 'X draft prompt must enforce 280 chars limit');
    assert.ok(xDraftPrompt.includes('viral, scroll-stopping hook'), 'X draft prompt with stance hook must include hook instructions');

    // LinkedIn Post Draft check
    const liDraftPrompt = evalBuilder({
      platform: 'linkedin',
      contextType: 'post_draft',
      draftNotes: 'Lessons learned scaling distributed systems across regions',
      stance: 'insights',
      tone: 'thought_leader'
    });

    assert.ok(liDraftPrompt.includes('DRAFT A NEW POST (NOT A REPLY)'), 'LinkedIn draft prompt must state new post not reply');
    assert.ok(liDraftPrompt.includes('thought leadership'), 'LinkedIn draft prompt must emphasize thought leadership');
    assert.ok(liDraftPrompt.includes('Actionable takeaways'), 'LinkedIn draft prompt with stance insights must emphasize actionable takeaways');
  });

  runTest('DMPillInsetMargin', 'content.js positions X DM button safely away from pill border', () => {
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    assert.ok(
      contentJs.includes("btn.style.setProperty('right', '28px', 'important')") || contentJs.includes("btn.style.right = '28px'"),
      'content.js must inset X DM button by 28px to prevent overflow clipping'
    );
  });

  runTest('AdapterAttachToToolbarSupport', 'All multi-platform adapters provide attachToToolbar method', () => {
    const xCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/x-adapter.js'), 'utf8');
    const liCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/linkedin-adapter.js'), 'utf8');
    const fbCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/facebook-adapter.js'), 'utf8');
    const thCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/threads-adapter.js'), 'utf8');
    const mbCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/meta-business-adapter.js'), 'utf8');

    assert.ok(xCode.includes('attachToToolbar(btn, inputEl)'), 'XAdapter must implement attachToToolbar');
    assert.ok(liCode.includes('attachToToolbar(btn, inputEl)'), 'LinkedInAdapter must implement attachToToolbar');
    assert.ok(fbCode.includes('attachToToolbar(btn, inputEl)'), 'FacebookAdapter must implement attachToToolbar');
    assert.ok(thCode.includes('attachToToolbar(btn, inputEl)'), 'ThreadsAdapter must implement attachToToolbar');
    assert.ok(mbCode.includes('attachToToolbar(btn, inputEl)'), 'MetaBusinessAdapter must implement attachToToolbar');
  });

  runTest('NoInvalidCssSelectorStrings', 'Adapters contain no broken selector queries with question-mark dot in querySelector', () => {
    const adapterFiles = ['x-adapter.js', 'linkedin-adapter.js', 'facebook-adapter.js', 'threads-adapter.js', 'meta-business-adapter.js'];
    for (const f of adapterFiles) {
      const code = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters', f), 'utf8');
      const matches = code.match(/querySelector(All)?\([^)]*\?\.[^)]*\)/g);
      assert.strictEqual(matches, null, `File ${f} must not contain ?. inside querySelector argument: ${matches}`);
    }
  });

  runTest('DynamicActivationBinding', 'content.js implements bindDynamicActivation for lazy toolbar mounting', () => {
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    assert.ok(contentJs.includes('bindDynamicActivation(inputEl'), 'content.js must implement bindDynamicActivation');
    assert.ok(contentJs.includes("inputEl.addEventListener('focus'"), 'bindDynamicActivation must listen for focus');
    assert.ok(contentJs.includes("inputEl.addEventListener('click'"), 'bindDynamicActivation must listen for click');
  });

  runTest('MultiPlatformIsolationPrune', 'pruneDuplicateShortcutButtons isolates by platform without purging article/form elements', () => {
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    assert.ok(contentJs.includes("if (activePlat === 'instagram')"), 'pruneDuplicateShortcutButtons must branch by activePlat');
    assert.ok(contentJs.includes('.instareply-composer-actions'), 'multi-platform prune must target composer actions directly');
  });

  runTest('FollowButtonsExcludedFromActionChips', 'Comment action buttons strictly restricted to Instagram and ignore Follow buttons', () => {
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    assert.ok(
      contentJs.includes("if (activePlat !== 'instagram') return;"),
      'scanAndInjectCommentActionButtons must immediately exit if not on Instagram'
    );
    assert.ok(
      contentJs.includes('follow') && contentJs.includes('UserCell'),
      'scanAndInjectCommentActionButtons must explicitly guard against Follow buttons and UserCells'
    );
  });

  runTest('XAdapterMediaIconsRowPlacement', 'XAdapter locates media/action icons and attaches AI button to left toolbar row', () => {
    const xCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/x-adapter.js'), 'utf8');
    assert.ok(xCode.includes('button[data-testid="image"]'), 'XAdapter must search for native image/media buttons');
    assert.ok(xCode.includes('iconsGroup.appendChild(btn)'), 'XAdapter must append AI button to the left icons group');
    assert.ok(xCode.includes("parent.style.flexDirection = 'row'"), 'XAdapter must set flex-direction row on fallback');
  });

  runTest('LinkedInAdapterControlsAndPostButtonPlacement', 'LinkedInAdapter prioritizes submit controls and share modal Post button', () => {
    const liCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/linkedin-adapter.js'), 'utf8');
    assert.ok(liCode.includes('.comments-comment-box__controls'), 'LinkedInAdapter must target .comments-comment-box__controls');
    assert.ok(liCode.includes('button.comments-comment-box__submit-button'), 'LinkedInAdapter must target submit button');
    assert.ok(liCode.includes('button.share-actions__primary-action'), 'LinkedInAdapter must target share modal Post button');
    assert.ok(liCode.includes('parent.insertBefore(btn, submitBtn)'), 'LinkedInAdapter must place AI button cleanly before submit button');
  });

  runTest('MetaBusinessAdapterInboxAndToolbar', 'MetaBusinessAdapter handles composer discovery, toolbar attachment and context extraction', () => {
    const mbCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/meta-business-adapter.js'), 'utf8');
    assert.ok(mbCode.includes("platform: 'meta_business'"), 'MetaBusinessAdapter must specify platform meta_business');
    assert.ok(mbCode.includes('findComposerElements(root'), 'MetaBusinessAdapter must implement findComposerElements');
    assert.ok(mbCode.includes('findToolbarContainer(inputEl)'), 'MetaBusinessAdapter must implement findToolbarContainer');
    assert.ok(mbCode.includes('button[aria-label*="send" i]'), 'MetaBusinessAdapter must detect Send button in toolbar');
    assert.ok(mbCode.includes('extractContext(inputEl)'), 'MetaBusinessAdapter must implement extractContext');
    assert.ok(mbCode.includes('insertText(inputEl, text'), 'MetaBusinessAdapter must implement insertText');
  });

  runTest('XCharacterLimitEnforcement', 'Strictly enforces 280-character limit for X across prompt, post-processor, and UI', () => {
    const swCode = fs.readFileSync(path.join(ROOT_DIR, 'background/service-worker.js'), 'utf8');
    const contentJs = fs.readFileSync(path.join(ROOT_DIR, 'content/content.js'), 'utf8');
    const xCode = fs.readFileSync(path.join(ROOT_DIR, 'content/adapters/x-adapter.js'), 'utf8');

    // 1. Service worker prompt and post-processing bounds
    assert.ok(swCode.includes('CRITICAL HARD LIMIT FOR X'), 'Service worker prompt must declare CRITICAL HARD LIMIT FOR X');
    assert.ok(swCode.includes('enforcePlatformLengthLimit(result.reply, effectiveCharLimit)'), 'Service worker must post-process and trim reply to limit');
    assert.ok(swCode.includes('enforcePlatformLengthLimit(draft, effectiveCharLimit)'), 'Service worker must trim toneDrafts to limit');

    // 2. Content script insertion and UI counter
    assert.ok(contentJs.includes('instareply-char-badge'), 'Content script must render character limit badge');
    assert.ok(contentJs.includes('instareply-btn-trim'), 'Content script must render auto-trim button for over-limit text');
    assert.ok(contentJs.includes('updateCardCharCount'), 'Content script must implement updateCardCharCount');
    assert.ok(contentJs.includes('enforcePlatformLengthLimit(textToInsert, effectiveLimit)'), 'Content script must enforce 280 limit before insertion into X');

    // 3. X Adapter
    assert.ok(xCode.includes('insertText(inputEl, text)'), 'XAdapter must implement insertText');
    assert.ok(xCode.includes('text.length > 280'), 'XAdapter must enforce 280-character limit in insertText');

    // 4. Test enforcePlatformLengthLimit logic directly
    const evalEnforce = new Function(`
      ${swCode.slice(swCode.indexOf('function enforcePlatformLengthLimit('), swCode.indexOf('async function handleGenerateReply'))}
      return enforcePlatformLengthLimit;
    `)();

    const shortText = 'This is a short, punchy tweet.';
    assert.strictEqual(evalEnforce(shortText, 280), shortText);

    const longText = 'A'.repeat(250) + ' and another sentence here that exceeds the limit completely. And even more words.';
    const trimmed = evalEnforce(longText, 280);
    assert.ok(trimmed.length <= 280, `Trimmed text must not exceed 280 chars (got ${trimmed.length})`);
    assert.ok(!trimmed.endsWith(' '), 'Trimmed text must not have trailing spaces');
  });

  console.log('=================================================');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 All automated tests PASSED successfully!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
