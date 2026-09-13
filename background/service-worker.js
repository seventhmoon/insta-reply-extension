// InstaReply AI - Background Service Worker (Manifest V3)

const DEFAULT_CONFIG = {
  provider: 'gemini', // 'gemini' | 'edge_ai' | 'local_llm'
  geminiApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  localLlmUrl: 'http://localhost:11434/v1',
  localLlmModel: 'llama3.2',
  defaultTone: 'friendly',
  defaultStance: 'positive', // 'positive' | 'neutral' | 'negative'
  enableAnalysis: true,
  includeEmojis: true,
  includePostCaption: true,
  enableMultimodalVision: true,
  customInstructions: ''
};

// Initialize configuration on install and migrate outdated model names
chrome.runtime.onInstalled.addListener(async () => {
  const existing = await chrome.storage.sync.get(null);
  const updated = { ...DEFAULT_CONFIG, ...existing };
  if (updated.geminiModel === 'gemini-2.5-flash') {
    updated.geminiModel = 'gemini-1.5-flash';
  }
  await chrome.storage.sync.set(updated);
  console.log('[InstaReply AI] Service worker initialized with settings:', updated);
});

// Helper to resolve and normalize Gemini model names
function resolveGeminiModel(rawModel) {
  if (!rawModel || rawModel === 'gemini-2.5-flash') {
    return 'gemini-1.5-flash';
  }
  return rawModel.replace(/^models\//, '').trim();
}

// Listener for messages from content scripts and popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'GET_CONFIG') {
    chrome.storage.sync.get(DEFAULT_CONFIG).then(cfg => {
      if (cfg.geminiModel === 'gemini-2.5-flash') {
        cfg.geminiModel = 'gemini-1.5-flash';
        chrome.storage.sync.set({ geminiModel: 'gemini-1.5-flash' });
      }
      sendResponse(cfg);
    });
    return true;
  }

  if (request.action === 'SAVE_CONFIG') {
    if (request.config && request.config.geminiModel === 'gemini-2.5-flash') {
      request.config.geminiModel = 'gemini-1.5-flash';
    }
    chrome.storage.sync.set(request.config).then(() => {
      sendResponse({ success: true });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (request.action === 'FETCH_GEMINI_MODELS') {
    handleFetchGeminiModels(request.apiKey).then(sendResponse);
    return true;
  }

  if (request.action === 'FETCH_LOCAL_MODELS') {
    handleFetchLocalModels(request.url).then(sendResponse);
    return true;
  }

  if (request.action === 'TEST_CONNECTION') {
    handleTestConnection(request.config).then(sendResponse);
    return true;
  }

  if (request.action === 'GENERATE_REPLY') {
    handleGenerateReply(request.payload).then(sendResponse);
    return true;
  }
});

/**
 * Dynamically fetches the list of available models from Google Generative Language API
 */
async function handleFetchGeminiModels(apiKey) {
  try {
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, error: 'API key is required to fetch available models.' };
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey.trim())}`;
    const res = await fetch(url);
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error?.message || `HTTP ${res.status}: Failed to fetch models.` };
    }
    const data = await res.json();
    const rawList = data.models || [];
    const models = rawList
      .filter(m => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
      .map(m => {
        const id = m.name.replace(/^models\//, '');
        return {
          id,
          displayName: m.displayName || id,
          description: m.description || ''
        };
      });

    return { success: true, models };
  } catch (err) {
    return { success: false, error: err.message || 'Error fetching models.' };
  }
}

/**
 * Fetches locally installed models from Ollama or OpenAI-compatible server
 */
async function handleFetchLocalModels(rawUrl) {
  try {
    const baseUrl = (rawUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
    const rootUrl = baseUrl.replace(/\/v1$/, '');

    // 1. Try Ollama native /api/tags first
    let res = await fetch(`${rootUrl}/api/tags`).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data.models && Array.isArray(data.models) && data.models.length > 0) {
        const models = data.models.map(m => {
          let sizeStr = '';
          if (m.size) {
            sizeStr = ` (${(m.size / (1024 * 1024 * 1024)).toFixed(1)} GB)`;
          }
          return {
            id: m.name,
            displayName: `${m.name}${sizeStr}`
          };
        });
        return { success: true, models };
      }
    }

    // 2. Try OpenAI-compatible /models endpoint (LM Studio / LocalAI / Ollama /v1)
    const openAiModelsUrl = baseUrl.endsWith('/v1') ? `${baseUrl}/models` : `${baseUrl}/v1/models`;
    res = await fetch(openAiModelsUrl).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      const list = data.data || data.models || [];
      if (Array.isArray(list) && list.length > 0) {
        const models = list.map(m => ({
          id: m.id || m.name,
          displayName: m.id || m.name
        }));
        return { success: true, models };
      }
    }

    return {
      success: false,
      error: 'No models found on local server. If using Ollama, run: ollama pull llama3.2'
    };
  } catch (err) {
    return { success: false, error: err.message || 'Failed to fetch local models.' };
  }
}

/**
 * Tests connection to configured AI backend
 */
async function handleTestConnection(config) {
  try {
    if (config.provider === 'gemini') {
      if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
        return { success: false, error: 'Gemini API key is required.' };
      }
      const model = resolveGeminiModel(config.geminiModel);
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.geminiApiKey.trim())}`;
      
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: 'Respond with the single word "OK".' }] }]
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const errMsg = errorData.error?.message || `HTTP ${res.status}: ${res.statusText}`;
        return { success: false, error: errMsg };
      }

      const data = await res.json();
      const answer = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      return { success: true, message: `Connected to Gemini (${model}) successfully! Response: ${answer.trim()}` };
    }

    if (config.provider === 'local_llm') {
      const baseUrl = (config.localLlmUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
      const rootUrl = baseUrl.replace(/\/v1$/, '');

      // Try /models first (OpenAI compatibility)
      let res = await fetch(`${baseUrl}/models`, { method: 'GET' }).catch(() => null);

      // If 404 or failed, try Ollama native /api/tags
      if (!res || !res.ok) {
        res = await fetch(`${rootUrl}/api/tags`, { method: 'GET' }).catch(() => null);
      }

      // If still failed, try root ping
      if (!res || !res.ok) {
        res = await fetch(`${rootUrl}/`, { method: 'GET' }).catch(() => null);
      }

      if (!res) {
        return {
          success: false,
          error: 'Connection refused. Ensure Ollama or local LLM server is running on localhost:11434.'
        };
      }

      if (!res.ok) {
        if (res.status === 403) {
          return {
            success: false,
            error: 'Ollama 403 Forbidden. Reload extension or run: OLLAMA_ORIGINS="*" ollama serve'
          };
        }
        return { success: false, error: `Local LLM returned HTTP ${res.status}: ${res.statusText}` };
      }

      // Auto-fetch installed models to return to popup
      const localModelsResult = await handleFetchLocalModels(config.localLlmUrl);
      const modelCount = localModelsResult.success ? localModelsResult.models.length : 0;
      const countMsg = modelCount > 0 ? ` Found ${modelCount} installed models.` : '';

      return {
        success: true,
        message: `Connected to Local LLM (Ollama) successfully!${countMsg}`,
        models: localModelsResult.models || []
      };
    }

    if (config.provider === 'edge_ai') {
      return { success: true, message: 'Edge AI runs locally on device via Chrome Built-in Prompt API.' };
    }

    return { success: false, error: 'Unknown provider specified.' };
  } catch (err) {
    return { success: false, error: err.message || 'Connection failed.' };
  }
}

/**
 * Main orchestrator for sentiment analysis & contextual reply generation
 */
async function handleGenerateReply(payload) {
  try {
    const config = await chrome.storage.sync.get(DEFAULT_CONFIG);
    const provider = config.provider || 'gemini';

    let {
      contextType = 'comment',
      replyMode = 'post_comment',
      isCurrentUserPostAuthor = false,
      relationshipSummary = '',
      incomingText = '',
      postCaption = '',
      postAuthor = '',
      postVisuals = null,
      author = '',
      isSpecificCommentReply = false,
      userDraftHint = '',
      stance = config.defaultStance || 'positive',
      tone = config.defaultTone || 'friendly',
      variationIndex = 0
    } = payload;

    if (!incomingText && !postCaption && !userDraftHint && !postVisuals?.description) {
      incomingText = 'Instagram post or reel. Draft a warm, engaging, and friendly creator comment or question for this post.';
    }

    console.log('[InstaReply AI] Generating reply:', {
      provider,
      contextType,
      replyMode,
      isCurrentUserPostAuthor,
      author,
      postAuthor,
      hasPostCaption: Boolean(postCaption),
      hasVisuals: Boolean(postVisuals?.description),
      stance,
      tone,
      variationIndex,
      hintLen: userDraftHint.length
    });

    if (provider === 'gemini') {
      return await generateWithGemini({
        config,
        contextType,
        replyMode,
        isCurrentUserPostAuthor,
        relationshipSummary,
        incomingText,
        postCaption,
        postAuthor,
        postVisuals,
        author,
        isSpecificCommentReply,
        userDraftHint,
        stance,
        tone,
        variationIndex
      });
    } else if (provider === 'local_llm') {
      return await generateWithLocalLlm({
        config,
        contextType,
        replyMode,
        isCurrentUserPostAuthor,
        relationshipSummary,
        incomingText,
        postCaption,
        postAuthor,
        postVisuals,
        author,
        isSpecificCommentReply,
        userDraftHint,
        stance,
        tone,
        variationIndex
      });
    } else if (provider === 'edge_ai') {
      // Return flag so content script can execute window.ai in the DOM context if available,
      // or we handle here if chrome.aiOriginTrial is available in worker
      return {
        success: false,
        requiresPageContext: true,
        error: 'Edge AI (Prompt API) must be executed in the page context. Switching to page runner...'
      };
    }

    return { success: false, error: `Unsupported provider: ${provider}` };
  } catch (err) {
    console.error('[InstaReply AI] Generation error:', err);
    return { success: false, error: err.message || 'Failed to generate reply.' };
  }
}

/**
 * Fetches an image URL and converts it to a base64 inlineData object for Gemini Multimodal API.
 */
async function fetchImageAsBase64(imageUrl) {
  try {
    if (!imageUrl || typeof imageUrl !== 'string' || !imageUrl.startsWith('http')) {
      return null;
    }
    const response = await fetch(imageUrl);
    if (!response.ok) {
      console.warn('[InstaReply AI] Could not download image for multimodal analysis:', response.status);
      return null;
    }
    const blob = await response.blob();
    // Prevent sending massive files over 8MB
    if (blob.size > 8 * 1024 * 1024) {
      console.warn('[InstaReply AI] Image exceeded 8MB size limit for inline data.');
      return null;
    }
    const mimeType = blob.type || 'image/jpeg';
    const buffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    let binary = '';
    const len = bytes.byteLength;
    const chunkSize = 8192;
    for (let i = 0; i < len; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(i + chunkSize, len)));
    }
    const data = btoa(binary);
    return { mimeType, data };
  } catch (err) {
    console.warn('[InstaReply AI] Error converting image to base64 for Gemini vision:', err);
    return null;
  }
}

/**
 * Google Gemini API Generation with Sentiment & Key Topic extraction
 */
async function generateWithGemini({
  config,
  contextType,
  replyMode,
  isCurrentUserPostAuthor,
  relationshipSummary,
  incomingText,
  postCaption,
  postAuthor,
  postVisuals,
  author,
  isSpecificCommentReply,
  userDraftHint,
  stance,
  tone,
  variationIndex
}) {
  if (!config.geminiApiKey || config.geminiApiKey.trim() === '') {
    return {
      success: false,
      error: 'Gemini API Key is missing. Please click the extension icon in your toolbar and enter your API Key.'
    };
  }

  const model = resolveGeminiModel(config.geminiModel);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(config.geminiApiKey.trim())}`;

  // Check if Multimodal Image analysis is enabled and available
  const canUseMultimodal = config.enableMultimodalVision !== false && Boolean(postVisuals?.thumbnailUrl);
  let inlineImagePart = null;

  if (canUseMultimodal) {
    try {
      inlineImagePart = await fetchImageAsBase64(postVisuals.thumbnailUrl);
      if (inlineImagePart) {
        console.log('[InstaReply AI] Successfully prepared base64 image data for Gemini Vision.');
      }
    } catch (fetchErr) {
      console.warn('[InstaReply AI] Multimodal fetch failed, falling back to text prompt:', fetchErr);
    }
  }

  const prompt = buildStructuredPrompt({
    contextType,
    replyMode,
    isCurrentUserPostAuthor,
    relationshipSummary,
    incomingText,
    postCaption,
    postAuthor,
    postVisuals,
    hasMultimodalImage: Boolean(inlineImagePart),
    author,
    isSpecificCommentReply,
    userDraftHint,
    stance,
    tone,
    variationIndex,
    enableAnalysis: config.enableAnalysis,
    includeEmojis: config.includeEmojis,
    customInstructions: config.customInstructions
  });

  const parts = [];
  if (inlineImagePart) {
    parts.push({
      inlineData: {
        mimeType: inlineImagePart.mimeType,
        data: inlineImagePart.data
      }
    });
  }
  parts.push({ text: prompt });

  const body = {
    contents: [
      {
        parts
      }
    ],
    generationConfig: {
      temperature: 0.7 + (variationIndex * 0.1),
      responseMimeType: "application/json"
    }
  };

  console.log('[InstaReply AI] Sending prompt to Gemini model:', model);
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  // If 400 Bad Request, retry without responseMimeType in case this model doesn't support structured output parameter
  if (!res.ok && res.status === 400) {
    console.warn('[InstaReply AI] Gemini returned 400 with responseMimeType, retrying with standard text mode...');
    delete body.generationConfig.responseMimeType;
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  if (!res.ok) {
    const errObj = await res.json().catch(() => ({}));
    const message = errObj.error?.message || `Gemini API returned ${res.status}: ${res.statusText}`;
    console.error('[InstaReply AI] Gemini API call failed:', message);
    return { success: false, error: message };
  }

  const data = await res.json();
  const rawOutput = data.candidates?.[0]?.content?.parts?.[0]?.text;

  if (!rawOutput) {
    return { success: false, error: 'Gemini returned an empty response.' };
  }

  const parsed = parseAIResponse(rawOutput);
  return {
    success: true,
    modelUsed: model,
    ...parsed
  };
}

/**
 * Local LLM (Ollama or OpenAI compatible endpoint)
 */
async function generateWithLocalLlm({
  config,
  contextType,
  replyMode,
  isCurrentUserPostAuthor,
  relationshipSummary,
  incomingText,
  postCaption,
  postAuthor,
  postVisuals,
  author,
  isSpecificCommentReply,
  userDraftHint,
  stance,
  tone,
  variationIndex
}) {
  const rawUrl = (config.localLlmUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
  const model = config.localLlmModel || 'llama3.2';

  const prompt = buildStructuredPrompt({
    contextType,
    replyMode,
    isCurrentUserPostAuthor,
    relationshipSummary,
    incomingText,
    postCaption,
    postAuthor,
    postVisuals,
    author,
    isSpecificCommentReply,
    userDraftHint,
    stance,
    tone,
    variationIndex,
    enableAnalysis: config.enableAnalysis,
    includeEmojis: config.includeEmojis,
    customInstructions: config.customInstructions
  });

  const rootUrl = rawUrl.replace(/\/v1$/, '');
  const openAiUrl = rawUrl.endsWith('/v1') ? `${rawUrl}/chat/completions` : `${rawUrl}/v1/chat/completions`;

  // 1. Try standard OpenAI-compatible format
  let res = await fetch(openAiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: 'You are an Instagram engagement assistant. Output valid JSON only.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.7 + (variationIndex * 0.1)
    })
  }).catch(() => null);

  let rawOutput = '';

  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    rawOutput = data.choices?.[0]?.message?.content || '';
  } else {
    // 2. Fallback to Ollama native /api/chat endpoint
    const ollamaUrl = `${rootUrl}/api/chat`;
    res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        format: 'json'
      })
    }).catch(() => null);

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      rawOutput = data.message?.content || '';
    }
  }

  if (!res) {
    return { success: false, error: 'Could not connect to Local LLM. Please check that Ollama is running on localhost:11434.' };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 403) {
      return {
        success: false,
        error: 'Ollama returned 403 Forbidden. On Mac, run in Terminal: OLLAMA_ORIGINS="*" ollama serve'
      };
    }
    return { success: false, error: `Local LLM error (${res.status}): ${errText || res.statusText}` };
  }

  if (!rawOutput) {
    return { success: false, error: 'Local LLM returned an empty response.' };
  }

  const parsed = parseAIResponse(rawOutput);
  return {
    success: true,
    modelUsed: `Local (${model})`,
    ...parsed
  };
}

/**
 * Builds the comprehensive prompt for AI
 */
function buildStructuredPrompt({
  contextType,
  replyMode = 'post_comment',
  isCurrentUserPostAuthor = false,
  relationshipSummary = '',
  incomingText,
  postCaption,
  postAuthor,
  postVisuals,
  hasMultimodalImage = false,
  author,
  isSpecificCommentReply,
  userDraftHint,
  stance = 'positive',
  tone,
  variationIndex,
  enableAnalysis,
  includeEmojis,
  customInstructions
}) {
  const isCommentReply = replyMode === 'comment_reply' || Boolean(isSpecificCommentReply);
  const isPostComment = replyMode === 'post_comment' && !isCommentReply && contextType !== 'dm';

  let roleHeader = '';
  if (relationshipSummary) {
    roleHeader = `- Relationship: ${relationshipSummary}\n`;
  }
  if (isCurrentUserPostAuthor) {
    roleHeader += `- User Perspective: CREATOR of the post (@${postAuthor}). Replying directly to audience/commenters.\n`;
  } else if (isCommentReply) {
    roleHeader += `- User Perspective: FOLLOWER / VISITOR replying to @${author}'s comment on @${postAuthor || 'creator'}'s post.\n`;
  } else if (isPostComment) {
    roleHeader += `- User Perspective: FOLLOWER / VISITOR writing a top-level comment on @${postAuthor || 'creator'}'s post.\n`;
  }

  let visualContextBlock = '';
  if (hasMultimodalImage) {
    visualContextBlock = `### POST VISUAL CONTENT (ACTUAL IMAGE ATTACHED DIRECTLY):
An image of the post has been directly attached to this request.
Inspect the image's composition, subjects, text, colors, scenery, and emotion directly.
${postVisuals?.description ? `Supplementary description: "${postVisuals.description}"\n` : ''}
`;
  } else if (postVisuals && postVisuals.description) {
    visualContextBlock = `### POST VISUAL CONTENT (${postVisuals.mediaType === 'video' ? 'VIDEO / REEL' : 'IMAGE / PHOTO'}):
Scene description / visual content: "${postVisuals.description}"
Notice: Use this visual description to understand what the photo/video actually depicts (lighting, objects, colors, environment, mood).
`;
  }

  let incomingSection = '';
  if (isCommentReply && incomingText) {
    incomingSection = `### SPECIFIC COMMENT TO REPLY TO (from @${author}):
"""
${incomingText}
"""`;
  } else if (incomingText && incomingText !== postCaption) {
    incomingSection = `### INCOMING MESSAGE / COMMENT:
"""
${incomingText}
"""`;
  } else {
    incomingSection = `### ACTION:
Writing a top-level engaging comment on the post described above.`;
  }

  let engagementRequirement = '';
  if (isCurrentUserPostAuthor) {
    engagementRequirement = `1. CREATOR PERSPECTIVE (YOU ARE @${postAuthor}):
   - Speak in the first person ("I", "my", "we").
   - You are the creator responding to a fan or follower. Answer their questions warmly, thank them for their appreciation, or share background details about your work/post.
   - NEVER speak about @${postAuthor} in the third person or say "Love this post @${postAuthor}!".`;
  } else if (isCommentReply) {
    engagementRequirement = `1. DIRECT COMMENT REPLY:
   - You are replying to @${author}'s specific comment, NOT writing a top-level post comment.
   - Directly answer @${author}'s question or build upon their remark, while referencing the post context where helpful.`;
  } else {
    engagementRequirement = `1. TOP-LEVEL POST COMMENT:
   - You are commenting directly on @${postAuthor || 'the creator'}'s post.
   - Start an authentic conversation: react to the post caption and visual image, ask an insightful question, or give specific praise.`;
  }

  let stanceGuidance = '';
  if (stance === 'negative') {
    stanceGuidance = `2. REPLY STANCE / ATTITUDE: NEGATIVE / CRITICAL / FIRM
   - You MUST adopt a critical, firm, disagreeing, or boundary-setting stance.
   - Politely disagree, correct a misconception, decline an offer, or firmly state boundaries.
   - Do NOT give enthusiastic agreement or unearned praise. Maintain professional composure on Instagram while firmly standing your ground.`;
  } else if (stance === 'neutral') {
    stanceGuidance = `2. REPLY STANCE / ATTITUDE: NEUTRAL / OBJECTIVE
   - You MUST adopt an objective, balanced, calm, and matter-of-fact stance.
   - State facts, provide straightforward information, or offer a balanced view without emotional hype or negativity.
   - Be polite, grounded, and concise.`;
  } else {
    stanceGuidance = `2. REPLY STANCE / ATTITUDE: POSITIVE / SUPPORTIVE
   - You MUST adopt a warm, enthusiastic, supportive, and appreciative stance.
   - Encourage the conversation, share good vibes, agree with or praise the positive aspects, and warmly engage.`;
  }

  let visualRequirement = '';
  if (postVisuals && postVisuals.description) {
    visualRequirement = `3. VISUAL AWARENESS & GROUNDING:
   - The post shows: "${postVisuals.description}".
   - Thoughtfully reference what is actually shown in the image or video (e.g., the scene, lighting, mood, subject) so the reply is grounded in visual reality.`;
  }

  return `You are an expert Instagram engagement assistant.
Your goal is to craft a high-quality, authentic Instagram ${contextType === 'dm' ? 'Direct Message (DM) reply' : (isCommentReply ? 'reply to a comment' : 'top-level comment on a post')}.

### INTERACTION CONTEXT:
- Context Type: ${contextType === 'dm' ? 'Direct Message (private chat)' : 'Public Post Comment'}
- Reply Stance: ${stance.toUpperCase()} (${stance === 'negative' ? 'Critical / Firm / Boundary' : (stance === 'neutral' ? 'Neutral / Balanced / Objective' : 'Positive / Supportive / Warm')})
${roleHeader}${postAuthor ? `- Post Author: @${postAuthor}\n` : ''}${author && author !== postAuthor ? `- Commenter: @${author}\n` : ''}
${visualContextBlock}
${postCaption ? `### ORIGINAL POST CAPTION & TOPIC:
"""
${postCaption}
"""
` : ''}
${incomingSection}

${userDraftHint ? `### IMPORTANT USER DRAFT HINT:
The user already typed this initial draft or instruction into the reply box:
"""
${userDraftHint}
"""
You MUST prioritize and incorporate the user's draft intent or hint directly into your reply! Treat this draft as direction/inspiration for the response.
` : ''}

### CRITICAL CONTEXT & STYLE REQUIREMENTS:
${engagementRequirement}
${stanceGuidance}
${visualRequirement ? visualRequirement + '\n' : ''}4. DEEP POST RELEVANCE:
${postCaption ? `   - Specifically connect your reply to the topics, locations, questions, or themes in the Post Caption above.
   - Do NOT generate generic filler like "Nice post!" or "Great shot!".
   - Ground the reply in the specific details provided.` : '   - Ensure your reply directly engages with the specific subject matter.'}
5. TONE & VOCABULARY:
   - Tone: ${tone.toUpperCase()} (e.g. friendly, enthusiastic, humorous, professional, empathetic, or concise).
   - Emojis: ${includeEmojis ? 'Include natural, tasteful Instagram-style emojis' : 'Do NOT use emojis'}.
${customInstructions ? `   - Custom Rule: ${customInstructions}\n` : ''}${variationIndex > 0 ? `   - Variation #${variationIndex + 1}: Make this variation noticeably distinct in phrasing and perspective from previous drafts.\n` : ''}   - Length: 1 to 3 natural, impactful sentences authentic to Instagram.
   - Avoid generic AI-sounding phrases, cliches, or corporate buzzwords.

### OUTPUT FORMAT:
You MUST respond with valid JSON matching this exact structure:
{
  "sentiment": "positive" | "neutral" | "negative" | "question" | "praise" | "complaint",
  "sentimentLabel": "Friendly & Positive" (short 2-4 word summary with sentiment emoji),
  "topics": ["Key Topic 1", "Key Topic 2"],
  "reply": "Your drafted reply text here"
}
Only output the JSON object. Do not include markdown code block backticks if possible.`;
}

/**
 * Safely parses the AI's output into structured reply & sentiment fields
 */
function parseAIResponse(rawText) {
  try {
    let clean = rawText.trim();
    // Remove markdown ```json ... ``` wrapper if present
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const json = JSON.parse(clean);
    return {
      sentiment: json.sentiment || 'neutral',
      sentimentLabel: json.sentimentLabel || formatSentimentLabel(json.sentiment),
      topics: Array.isArray(json.topics) ? json.topics : [],
      reply: json.reply || clean
    };
  } catch (err) {
    console.warn('[InstaReply AI] Could not parse strict JSON, falling back to regex extraction:', err);
    // Fallback extraction
    return {
      sentiment: 'neutral',
      sentimentLabel: '✨ Analyzed',
      topics: [],
      reply: rawText.replace(/\{[\s\S]*"reply"\s*:\s*"([^"]+)"[\s\S]*\}/, '$1').trim()
    };
  }
}

function formatSentimentLabel(sentiment) {
  switch (sentiment?.toLowerCase()) {
    case 'positive':
    case 'praise':
      return '🟢 Positive / Praise';
    case 'question':
      return '🟡 Inquiring / Question';
    case 'negative':
    case 'complaint':
      return '🔴 Critical / Issue';
    default:
      return '⚪ Neutral';
  }
}
