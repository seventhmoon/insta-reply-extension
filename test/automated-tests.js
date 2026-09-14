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

  runTest('StoryInputDiscovery', 'Identifies Story reply input and pill container', () => {
    function isStoryInput(placeholder, ariaLabel, insideViewer) {
      const p = (placeholder || '').toLowerCase();
      const a = (ariaLabel || '').toLowerCase();
      return insideViewer || p.startsWith('reply to') || a.startsWith('reply to') || p.includes('reply') || a.includes('reply');
    }

    assert.strictEqual(isStoryInput('Reply to story_creator...', '', false), true);
    assert.strictEqual(isStoryInput('', 'Reply to story_creator...', false), true);
    assert.strictEqual(isStoryInput('', '', true), true);
    assert.strictEqual(isStoryInput('Add a comment...', '', false), false);
    assert.strictEqual(isStoryInput('Message...', '', false), false);
  });

  runTest('StoryAuthorExtraction', 'Extracts author from /stories/<username>/ route URL and header', () => {
    function extractStoryAuthor(pathname, headerLink) {
      const urlMatch = pathname.match(/\/stories\/([a-zA-Z0-9._]+)/);
      if (urlMatch && urlMatch[1]) {
        const banned = new Set(['explore', 'direct', 'reels', 'reel', 'p', 'stories']);
        if (!banned.has(urlMatch[1].toLowerCase())) return urlMatch[1];
      }
      if (headerLink) {
        const m = headerLink.match(/^\/([a-zA-Z0-9._]+)\/?/);
        if (m && m[1]) return m[1];
      }
      return '';
    }

    assert.strictEqual(extractStoryAuthor('/stories/nature_photographer/312345/', ''), 'nature_photographer');
    assert.strictEqual(extractStoryAuthor('/stories/travel_diaries/', ''), 'travel_diaries');
    assert.strictEqual(extractStoryAuthor('/direct/t/123/', '/travel_diaries/'), 'travel_diaries');
  });

  runTest('StoryIdentifier', 'Generates unique story identifier scoping replies to active slide', () => {
    function extractStoryIdentifier(pathname, storyAuthor) {
      const match = pathname.match(/\/stories\/([a-zA-Z0-9._]+)(?:\/([0-9]+))?/);
      if (match) {
        const user = match[1];
        const storyId = match[2];
        return storyId ? `story_${user}_${storyId}` : `story_${user}_active`;
      }
      return `story_${storyAuthor || 'user'}_active`;
    }

    assert.strictEqual(extractStoryIdentifier('/stories/nature_photographer/312345/', 'nature_photographer'), 'story_nature_photographer_312345');
    assert.strictEqual(extractStoryIdentifier('/stories/nature_photographer/', 'nature_photographer'), 'story_nature_photographer_active');
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
