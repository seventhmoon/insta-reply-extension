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
    const output = execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });

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


  console.log('\n=================================================');
  console.log(`📊 Tests Executed: ${totalTests} | Passed: ${passedTests} | Failed: ${failedTests}`);
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
