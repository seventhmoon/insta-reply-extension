// InstaReply AI - Background Service Worker (Manifest V3)

const DEFAULT_CONFIG = {
  provider: 'gemini', // 'gemini' | 'groq' | 'openrouter' | 'custom_openai' | 'edge_ai' | 'local_llm'
  geminiApiKey: '',
  geminiModel: 'gemini-1.5-flash',
  groqApiKey: '',
  groqModel: 'llama-3.3-70b-versatile',
  openrouterApiKey: '',
  openrouterModel: 'meta-llama/llama-3.3-70b-instruct:free',
  customOpenAiUrl: '',
  customOpenAiKey: '',
  customOpenAiModel: 'gpt-4o-mini',
  localLlmUrl: 'http://localhost:11434/v1',
  localLlmModel: 'llama3.2',
  defaultTone: 'friendly',
  defaultStance: 'positive', // 'positive' | 'neutral' | 'negative'
  enableAnalysis: true,
  includeEmojis: true,
  includePostCaption: true,
  enableMultimodalVision: true,
  replyLanguage: 'auto',
  customInstructions: ''
};

// Initialize configuration on install and migrate outdated model names
if (typeof chrome !== 'undefined' && chrome.runtime?.onInstalled) {
  chrome.runtime.onInstalled.addListener(async () => {
    const existing = await chrome.storage.sync.get(null);
    const updated = { ...DEFAULT_CONFIG, ...existing };
    if (updated.geminiModel === 'gemini-2.5-flash') {
      updated.geminiModel = 'gemini-1.5-flash';
    }
    await chrome.storage.sync.set(updated);
    console.log('[InstaReply AI] Service worker initialized with settings:', updated);
  });
}

// Helper to resolve and normalize Gemini model names
function resolveGeminiModel(rawModel) {
  if (!rawModel || rawModel === 'gemini-2.5-flash') {
    return 'gemini-1.5-flash';
  }
  return rawModel.replace(/^models\//, '').trim();
}

/**
 * Normalizes raw or model-generated tone strings into standard canonical tone names
 */
function normalizeToneName(tone) {
  if (!tone) return 'friendly';
  const clean = tone.toLowerCase().trim();
  if (clean === 'flirty' || clean.includes('flirt')) return 'flirting';
  if (clean.includes('sexy') || clean.includes('sensual')) return 'sexy';
  if (clean.includes('seduct')) return 'seductive';
  if (clean.includes('allur')) return 'alluring';
  if (clean.includes('mean') || clean.includes('haughty')) return 'mean';
  if (clean.includes('evil') || clean.includes('villain')) return 'evil';
  if (clean.includes('funny') || clean.includes('humor') || clean.includes('wit')) return 'humorous';
  if (clean.includes('playful') || clean.includes('cheeky') || clean.includes('naughty')) return 'playful';
  if (clean.includes('savage') || clean.includes('roast') || clean.includes('burn')) return 'savage';
  if (clean.includes('geek') || clean.includes('tech') || clean.includes('nerd')) return 'geek';
  if (clean.includes('spicy') || clean.includes('bold')) return 'spicy';
  if (clean.includes('hype') || clean.includes('enthusiastic')) return 'enthusiastic';
  if (clean.includes('profession') || clean.includes('polish')) return 'professional';
  if (clean.includes('empath') || clean.includes('caring')) return 'empathetic';
  if (clean.includes('short') || clean.includes('concise') || clean.includes('sweet')) return 'concise';
  if (clean.includes('friend')) return 'friendly';
  return clean;
}

/**
 * Determines the cluster of alternative tones to bundle into the AI response for instant switching
 */
function getBundledTonesFor(tone) {
  const primary = normalizeToneName(tone);
  if (['sexy', 'seductive', 'flirting', 'alluring'].includes(primary)) {
    return ['flirting', 'sexy', 'seductive', 'alluring', 'playful', 'savage'].filter(t => t !== primary);
  }
  if (['mean', 'evil', 'savage'].includes(primary)) {
    return ['mean', 'evil', 'savage', 'playful', 'humorous'].filter(t => t !== primary);
  }
  return ['friendly', 'humorous', 'playful', 'savage', 'flirting', 'concise'].filter(t => t !== primary);
}

// In-memory cache for service worker reply generations (persists across content script reloads)
const serviceWorkerReplyCache = new Map();

function getSwReplyCacheKey(payload) {
  if (!payload) return '';
  const cleanPostId = (payload.postId || 'post').trim();
  const cleanPostAuthor = (payload.postAuthor || '').toLowerCase().trim();
  const cleanAuthor = (payload.author || '').toLowerCase().trim();
  const textSnippet = (payload.incomingText || '').trim().toLowerCase().slice(0, 80);
  const cleanStance = (payload.stance || 'positive').toLowerCase().trim();
  const cleanTone = normalizeToneName(payload.tone);
  const cleanLang = (payload.replyLanguage || 'auto').toLowerCase().trim();
  return `${cleanPostId}|${cleanPostAuthor}|${cleanAuthor}|${textSnippet}|${cleanStance}|${cleanTone}|${cleanLang}`;
}

function setSwReplyCacheEntry(key, value) {
  if (!key) return;
  if (serviceWorkerReplyCache.size >= 300) {
    const oldestKey = serviceWorkerReplyCache.keys().next().value;
    if (oldestKey) serviceWorkerReplyCache.delete(oldestKey);
  }
  serviceWorkerReplyCache.set(key, value);
}

// Listener for messages from content scripts and popup
if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
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

    if (request.action === 'FETCH_GROQ_MODELS') {
      handleFetchGroqModels(request.apiKey).then(sendResponse);
      return true;
    }

    if (request.action === 'FETCH_OPENROUTER_MODELS') {
      handleFetchOpenRouterModels(request.apiKey).then(sendResponse);
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
}

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
 * Dynamically fetches the list of available models from Groq Cloud API
 */
async function handleFetchGroqModels(apiKey) {
  try {
    if (!apiKey || apiKey.trim() === '') {
      return { success: false, error: 'Groq API key is required.' };
    }
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { 'Authorization': `Bearer ${apiKey.trim()}` }
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { success: false, error: err.error?.message || `HTTP ${res.status}: Failed to fetch Groq models.` };
    }
    const data = await res.json();
    const models = (data.data || [])
      .filter(m => m.active !== false && !m.id.includes('whisper'))
      .map(m => ({ id: m.id, displayName: m.id }));
    return { success: true, models };
  } catch (err) {
    return { success: false, error: err.message || 'Error fetching Groq models.' };
  }
}

/**
 * Fetches free and popular models from OpenRouter API
 */
async function handleFetchOpenRouterModels(apiKey) {
  try {
    const headers = {
      'HTTP-Referer': 'https://github.com/seventhmoon/insta-reply-extension',
      'X-Title': 'InstaReply AI'
    };
    if (apiKey && apiKey.trim()) {
      headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    }
    const res = await fetch('https://openrouter.ai/api/v1/models', { headers });
    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}: Failed to fetch OpenRouter models.` };
    }
    const data = await res.json();
    const rawList = data.data || [];
    // Prioritize free models (:free suffix or 0 prompt price)
    const freeModels = rawList.filter(m => m.id.endsWith(':free') || m.pricing?.prompt === '0');
    const targetList = freeModels.length > 0 ? freeModels : rawList.slice(0, 30);
    const models = targetList.map(m => ({
      id: m.id,
      displayName: m.name ? `${m.name} ${m.id.endsWith(':free') ? '(Free)' : ''}`.trim() : m.id
    }));
    return { success: true, models };
  } catch (err) {
    return { success: false, error: err.message || 'Error fetching OpenRouter models.' };
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

    if (config.provider === 'groq') {
      if (!config.groqApiKey || config.groqApiKey.trim() === '') {
        return { success: false, error: 'Groq API key is required. Get a free key at console.groq.com/keys.' };
      }
      const model = (config.groqModel || 'llama-3.3-70b-versatile').trim();
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.groqApiKey.trim()}`
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || `HTTP ${res.status}: Failed to connect to Groq.` };
      }

      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || 'OK';
      return { success: true, message: `Connected to Groq (${model}) successfully! Response: ${answer.trim()}` };
    }

    if (config.provider === 'openrouter') {
      if (!config.openrouterApiKey || config.openrouterApiKey.trim() === '') {
        return { success: false, error: 'OpenRouter API key is required. Get a free key at openrouter.ai/keys.' };
      }
      const model = (config.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free').trim();
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${config.openrouterApiKey.trim()}`,
          'HTTP-Referer': 'https://github.com/seventhmoon/insta-reply-extension',
          'X-Title': 'InstaReply AI'
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5
        })
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || `HTTP ${res.status}: Failed to connect to OpenRouter.` };
      }

      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || 'OK';
      return { success: true, message: `Connected to OpenRouter (${model}) successfully! Response: ${answer.trim()}` };
    }

    if (config.provider === 'custom_openai') {
      const rawUrl = (config.customOpenAiUrl || '').replace(/\/+$/, '');
      if (!rawUrl) {
        return { success: false, error: 'Custom OpenAI Base URL is required (e.g. https://models.inference.ai.azure.com).' };
      }
      const openAiUrl = rawUrl.endsWith('/chat/completions') ? rawUrl : (rawUrl.endsWith('/v1') ? `${rawUrl}/chat/completions` : `${rawUrl}/v1/chat/completions`);
      const model = (config.customOpenAiModel || 'gpt-4o-mini').trim();
      const headers = { 'Content-Type': 'application/json' };
      if (config.customOpenAiKey && config.customOpenAiKey.trim()) {
        headers['Authorization'] = `Bearer ${config.customOpenAiKey.trim()}`;
      }

      const res = await fetch(openAiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'Say OK' }],
          max_tokens: 5
        })
      }).catch(err => ({ error: err }));

      if (!res || res.error) {
        return { success: false, error: res?.error?.message || 'Failed to reach custom OpenAI server.' };
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        return { success: false, error: err.error?.message || `HTTP ${res.status}: ${res.statusText}` };
      }

      const data = await res.json();
      const answer = data.choices?.[0]?.message?.content || 'OK';
      return { success: true, message: `Connected to Custom OpenAI endpoint (${model}) successfully! Response: ${answer.trim()}` };
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
      variationIndex = 0,
      replyLanguage = payload.replyLanguage || config.replyLanguage || 'auto'
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
      replyLanguage,
      hintLen: userDraftHint.length
    });

    const isCacheEligible = variationIndex === 0 && !userDraftHint;
    const cacheKey = isCacheEligible ? getSwReplyCacheKey({
      postId: payload.postId,
      postAuthor,
      author,
      incomingText,
      stance,
      tone,
      replyLanguage
    }) : null;

    if (isCacheEligible && cacheKey && serviceWorkerReplyCache.has(cacheKey)) {
      console.log(`[InstaReply AI] ⚡ Service worker serving cached reply for @${author || postAuthor} (${stance} / ${tone})`);
      return { ...serviceWorkerReplyCache.get(cacheKey), fromCache: true };
    }

    let result;
    if (provider === 'gemini') {
      result = await generateWithGemini({
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
        variationIndex,
        replyLanguage
      });
    } else if (provider === 'groq' || provider === 'openrouter' || provider === 'custom_openai' || provider === 'local_llm') {
      result = await generateWithOpenAiCompatible({
        provider,
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
        variationIndex,
        replyLanguage
      });
    } else if (provider === 'edge_ai') {
      return {
        success: false,
        requiresPageContext: true,
        error: 'Edge AI (Prompt API) must be executed in the page context. Switching to page runner...'
      };
    } else {
      return { success: false, error: `Unsupported provider: ${provider}` };
    }

    if (result && result.success && isCacheEligible && cacheKey) {
      setSwReplyCacheEntry(cacheKey, result);

      if (result.toneDrafts && typeof result.toneDrafts === 'object') {
        for (const [rawAltTone, altReply] of Object.entries(result.toneDrafts)) {
          if (!altReply || typeof altReply !== 'string' || !altReply.trim()) continue;
          const altTone = normalizeToneName(rawAltTone);
          const altKey = getSwReplyCacheKey({
            postId: payload.postId,
            postAuthor,
            author,
            incomingText,
            stance,
            tone: altTone,
            replyLanguage
          });
          if (!serviceWorkerReplyCache.has(altKey)) {
            setSwReplyCacheEntry(altKey, {
              ...result,
              reply: altReply.trim(),
              toneUsed: altTone,
              fromCache: true
            });
          }
        }
      }
    }

    return result;
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
    console.warn('[InstaReply AI] Error converting image to base64 for vision analysis:', err);
    return null;
  }
}

/**
 * Patterns of known multimodal vision-capable model names / families
 */
const VISION_MODEL_PATTERNS = [
  /gemma-?3/i,                   // Gemma 3 (natively multimodal: 1b, 4b, 12b, 27b)
  /paligemma/i,                  // PaliGemma & PaliGemma 2
  /llama-?3\.2.*vision/i,        // Llama 3.2 Vision
  /\bvision\b/i,                 // Generic -vision suffix / prefix
  /-vl\b|\bvl-/i,                // Qwen2-VL, Qwen2.5-VL, DeepSeek-VL
  /llava/i,                      // LLaVA, LLaVA-NeXT, LLaVA-Llama3
  /minicpm-?v/i,                 // MiniCPM-V
  /moondream/i,                  // Moondream
  /pixtral/i,                    // Mistral Pixtral
  /cogvlm/i,                     // CogVLM
  /bakllava/i,                   // BakLLaVA
  /internvl/i,                   // InternVL
  /gpt-4(?:o|-turbo|-vision)/i,  // OpenAI GPT-4o, GPT-4o-mini, GPT-4 Vision
  /claude-3/i,                   // Anthropic Claude 3
  /gemini/i                      // Google Gemini
];

/**
 * Checks if a model name matches known multimodal vision patterns.
 */
function isKnownVisionModel(modelName) {
  if (!modelName || typeof modelName !== 'string') return false;
  return VISION_MODEL_PATTERNS.some(pattern => pattern.test(modelName.trim()));
}

/**
 * In-memory cache for detected model vision capability: "provider:model" -> boolean
 */
const visionCapabilityCache = new Map();

/**
 * Probes Ollama /api/show to inspect model architecture for vision/clip projector.
 */
async function checkOllamaVisionCapability(rootUrl, modelName) {
  try {
    const cleanUrl = (rootUrl || 'http://localhost:11434').replace(/\/+$/, '');
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId = controller ? setTimeout(() => controller.abort(), 1500) : null;
    const res = await fetch(`${cleanUrl}/api/show`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: modelName }),
      signal: controller ? controller.signal : undefined
    }).catch(() => null);

    if (timeoutId) clearTimeout(timeoutId);
    if (!res || !res.ok) return false;

    const data = await res.json().catch(() => ({}));
    const families = Array.isArray(data.details?.families) ? data.details.families : [];
    if (families.some(f => /clip|vision/i.test(String(f)))) return true;

    const infoStr = JSON.stringify(data.model_info || {});
    if (/clip|vision/i.test(infoStr)) return true;

    const modelfile = String(data.modelfile || '');
    if (/projector|vision/i.test(modelfile)) return true;

    return false;
  } catch {
    return false;
  }
}

/**
 * Determines whether the specified model supports multimodal vision input.
 */
async function isModelVisionSupported({ provider, model, rootUrl }) {
  if (!model) return false;
  const cacheKey = `${provider}:${model}`;
  if (visionCapabilityCache.has(cacheKey)) {
    return visionCapabilityCache.get(cacheKey);
  }

  // 1. Fast regex match against known vision model families
  if (isKnownVisionModel(model)) {
    visionCapabilityCache.set(cacheKey, true);
    return true;
  }

  // 2. Ollama /api/show architecture inspection
  if (provider === 'local_llm' && rootUrl) {
    const isVision = await checkOllamaVisionCapability(rootUrl, model);
    visionCapabilityCache.set(cacheKey, isVision);
    return isVision;
  }

  visionCapabilityCache.set(cacheKey, false);
  return false;
}

/**
 * Detects whether an API error indicates rejection of multimodal/image payload.
 */
function isVisionRejectionError(status, errText) {
  if (!errText) return status === 400 || status === 422;
  const lower = String(errText).toLowerCase();
  return (
    status === 400 ||
    status === 422 ||
    lower.includes('vision') ||
    lower.includes('does not support image') ||
    lower.includes('does not support multimodal') ||
    lower.includes('unsupported image') ||
    lower.includes('expected string') ||
    lower.includes('image_url') ||
    lower.includes('content must be a string') ||
    lower.includes('not a multimodal model') ||
    lower.includes('unknown parameter: images')
  );
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
  variationIndex,
  replyLanguage = 'auto'
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
    replyLanguage: replyLanguage || config.replyLanguage || 'auto',
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
 * Universal OpenAI-Compatible Generator (Groq, OpenRouter, Custom OpenAI, Local LLM)
 */
async function generateWithOpenAiCompatible({
  provider,
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
  variationIndex,
  replyLanguage = 'auto'
}) {
  let openAiUrl = '';
  let rootUrl = '';
  let model = '';
  let providerBrand = 'AI';
  const headers = { 'Content-Type': 'application/json' };

  if (provider === 'groq') {
    const apiKey = (config.groqApiKey || '').trim();
    if (!apiKey) {
      return { success: false, error: 'Groq API key is missing. Please enter your API key in extension settings.' };
    }
    openAiUrl = 'https://api.groq.com/openai/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey}`;
    model = (config.groqModel || 'llama-3.3-70b-versatile').trim();
    providerBrand = 'Groq';
  } else if (provider === 'openrouter') {
    const apiKey = (config.openrouterApiKey || '').trim();
    if (!apiKey) {
      return { success: false, error: 'OpenRouter API key is missing. Please enter your API key in extension settings.' };
    }
    openAiUrl = 'https://openrouter.ai/api/v1/chat/completions';
    headers['Authorization'] = `Bearer ${apiKey}`;
    headers['HTTP-Referer'] = 'https://github.com/seventhmoon/insta-reply-extension';
    headers['X-Title'] = 'InstaReply AI';
    model = (config.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free').trim();
    providerBrand = 'OpenRouter';
  } else if (provider === 'custom_openai') {
    const rawUrl = (config.customOpenAiUrl || '').replace(/\/+$/, '');
    if (!rawUrl) {
      return { success: false, error: 'Custom OpenAI Base URL is missing. Please enter the endpoint URL in settings.' };
    }
    openAiUrl = rawUrl.endsWith('/chat/completions') ? rawUrl : (rawUrl.endsWith('/v1') ? `${rawUrl}/chat/completions` : `${rawUrl}/v1/chat/completions`);
    model = (config.customOpenAiModel || 'gpt-4o-mini').trim();
    providerBrand = 'OpenAI';
    if (config.customOpenAiKey && config.customOpenAiKey.trim()) {
      headers['Authorization'] = `Bearer ${config.customOpenAiKey.trim()}`;
    }
  } else {
    // local_llm (Ollama, LM Studio)
    const rawUrl = (config.localLlmUrl || 'http://localhost:11434/v1').replace(/\/+$/, '');
    rootUrl = rawUrl.replace(/\/v1$/, '');
    openAiUrl = rawUrl.endsWith('/v1') ? `${rawUrl}/chat/completions` : `${rawUrl}/v1/chat/completions`;
    model = (config.localLlmModel || 'llama3.2').trim();
    providerBrand = 'Local';
  }

  // Check if Multimodal Image analysis is enabled and supported for this model
  const canUseMultimodal = config.enableMultimodalVision !== false && Boolean(postVisuals?.thumbnailUrl);
  let inlineImagePart = null;
  let useVisionPayload = false;

  if (canUseMultimodal) {
    const supportsVision = await isModelVisionSupported({ provider, model, rootUrl });
    if (supportsVision) {
      try {
        inlineImagePart = await fetchImageAsBase64(postVisuals.thumbnailUrl);
        if (inlineImagePart) {
          useVisionPayload = true;
          console.log(`[InstaReply AI] Prepared base64 image data for ${providerBrand} Vision (${model}).`);
        }
      } catch (imgErr) {
        console.warn(`[InstaReply AI] Could not prepare image for ${model}:`, imgErr);
      }
    }
  }

  function getPrompt(withVision) {
    return buildStructuredPrompt({
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
      replyLanguage: replyLanguage || config.replyLanguage || 'auto',
      enableAnalysis: config.enableAnalysis,
      includeEmojis: config.includeEmojis,
      customInstructions: config.customInstructions,
      hasMultimodalImage: withVision
    });
  }

  function formatUserContent(textPrompt, imagePart) {
    if (!imagePart) {
      return textPrompt;
    }
    return [
      { type: 'text', text: textPrompt },
      {
        type: 'image_url',
        image_url: {
          url: `data:${imagePart.mimeType};base64,${imagePart.data}`
        }
      }
    ];
  }

  let prompt = getPrompt(useVisionPayload);

  const requestBody = {
    model,
    messages: [
      { role: 'system', content: 'You are an Instagram engagement assistant. Output valid JSON only.' },
      { role: 'user', content: formatUserContent(prompt, inlineImagePart) }
    ],
    temperature: 0.7 + (variationIndex * 0.1)
  };

  // Groq and OpenRouter support json_object mode natively
  if (provider === 'groq' || provider === 'openrouter') {
    requestBody.response_format = { type: 'json_object' };
  }

  // 1. Send to standard OpenAI-compatible endpoint
  let res = await fetch(openAiUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(requestBody)
  }).catch(() => null);

  // If server rejected the multimodal image payload, gracefully fallback to text-only prompt
  if (useVisionPayload && res && !res.ok) {
    const errPeek = await res.clone().text().catch(() => '');
    if (isVisionRejectionError(res.status, errPeek)) {
      console.warn(`[InstaReply AI] Model (${model}) does not accept vision payload (${errPeek.slice(0, 120)}). Retrying with text-only prompt.`);
      visionCapabilityCache.set(`${provider}:${model}`, false);
      useVisionPayload = false;
      inlineImagePart = null;
      prompt = getPrompt(false);
      requestBody.messages[1].content = prompt;
      res = await fetch(openAiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(requestBody)
      }).catch(() => null);
    }
  }

  let rawOutput = '';

  if (res && res.ok) {
    const data = await res.json().catch(() => ({}));
    rawOutput = data.choices?.[0]?.message?.content || '';
  } else if (provider === 'local_llm' && rootUrl) {
    // 2. Fallback to Ollama native /api/chat endpoint
    const ollamaUrl = `${rootUrl}/api/chat`;
    const ollamaUserMsg = { role: 'user', content: prompt };
    if (useVisionPayload && inlineImagePart) {
      ollamaUserMsg.images = [inlineImagePart.data];
    }
    res = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [ollamaUserMsg],
        stream: false,
        format: 'json'
      })
    }).catch(() => null);

    // If native Ollama rejected images, retry text-only
    if (useVisionPayload && res && !res.ok) {
      const errPeek = await res.clone().text().catch(() => '');
      if (isVisionRejectionError(res.status, errPeek)) {
        console.warn(`[InstaReply AI] Ollama native chat rejected image payload. Retrying with text-only prompt.`);
        useVisionPayload = false;
        inlineImagePart = null;
        prompt = getPrompt(false);
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
      }
    }

    if (res && res.ok) {
      const data = await res.json().catch(() => ({}));
      rawOutput = data.message?.content || '';
    }
  }

  if (!res) {
    const targetName = provider === 'local_llm' ? 'Local LLM (Ollama)' : providerBrand;
    return { success: false, error: `Could not connect to ${targetName}. Please check network or configuration.` };
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    if (res.status === 403 && provider === 'local_llm') {
      return {
        success: false,
        error: 'Ollama returned 403 Forbidden. On Mac, run in Terminal: OLLAMA_ORIGINS="*" ollama serve'
      };
    }
    return { success: false, error: `${providerBrand} error (${res.status}): ${errText || res.statusText}` };
  }

  if (!rawOutput) {
    return { success: false, error: `${providerBrand} returned an empty response.` };
  }

  const parsed = parseAIResponse(rawOutput);
  return {
    success: true,
    modelUsed: `${providerBrand} (${model})${useVisionPayload ? ' 👁️ Vision' : ''}`,
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
  replyLanguage = 'auto',
  enableAnalysis,
  includeEmojis,
  customInstructions
}) {
  const isCommentReply = replyMode === 'comment_reply' || Boolean(isSpecificCommentReply);
  const isStoryReply = replyMode === 'story_reply' || contextType === 'story';
  const isPostComment = replyMode === 'post_comment' && !isCommentReply && !isStoryReply && contextType !== 'dm';

  const primaryTone = normalizeToneName(tone);
  const altTones = getBundledTonesFor(primaryTone);

  let multiToneInstruction = '';
  let multiToneSchema = '';
  if (variationIndex === 0 && !userDraftHint) {
    multiToneInstruction = `   - In addition to your primary "reply" (crafted in the requested "${primaryTone}" tone), also generate distinct alternative drafts for these contrasting tone styles:
${altTones.map(t => `     * ${t}: ${getToneInstruction(t)}`).join('\n')}
   - Output these inside the "toneDrafts" object mapping each tone name to its drafted reply text.\n`;

    const sampleDrafts = altTones.map(t => `    "${t}": "Distinct alternative reply in ${t} style"`).join(',\n');
    multiToneSchema = `,\n  "toneDrafts": {\n${sampleDrafts}\n  }`;
  }

  let roleHeader = '';
  if (relationshipSummary) {
    roleHeader = `- Relationship: ${relationshipSummary}\n`;
  }
  if (isCurrentUserPostAuthor) {
    roleHeader += `- User Perspective: CREATOR of the post (@${postAuthor}). Replying directly to audience/commenters.\n`;
  } else if (isStoryReply) {
    roleHeader += `- User Perspective: FOLLOWER / FRIEND replying directly to @${postAuthor || 'creator'}'s Instagram Story (sent via DM).\n`;
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
  } else if (isStoryReply) {
    incomingSection = `### ACTION:
Writing a direct reaction / reply to the Instagram Story shown above (sent via DM to @${postAuthor || 'creator'}).`;
  } else {
    incomingSection = `### ACTION:
Writing a top-level engaging comment on the post described above.`;
  }

  let engagementRequirement = '';
  if (isCurrentUserPostAuthor) {
    engagementRequirement = `1. CREATOR ENGAGEMENT:
   - You are the creator responding to a fan or follower. Answer their questions warmly, thank them for their appreciation, or share background details about your work/post.
   - NEVER speak about @${postAuthor} in the third person or say "Love this post @${postAuthor}!".`;
  } else if (isStoryReply) {
    engagementRequirement = `1. INSTAGRAM STORY REPLY (SENT VIA DM):
   - You are sending a direct reaction/reply to @${postAuthor || 'the creator'}'s Instagram Story.
   - React naturally, enthusiastically, or wittily to what is shown in the Story (photo, video, or text sticker).
   - Keep it concise, casual, authentic, and conversational like a real Instagram direct message reaction.`;
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
Your goal is to craft a high-quality, authentic Instagram ${isStoryReply ? 'Story reply (direct message)' : (contextType === 'dm' ? 'Direct Message (DM) reply' : (isCommentReply ? 'reply to a comment' : 'top-level comment on a post'))}.

### INTERACTION CONTEXT:
- Context Type: ${isStoryReply ? 'Instagram Story Reply (via Direct Message)' : (contextType === 'dm' ? 'Direct Message (private chat)' : 'Public Post Comment')}
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
   - Style: ${getToneInstruction(tone)}
   - Emojis: ${includeEmojis ? 'Include natural, tasteful Instagram-style emojis' : 'Do NOT use emojis'}.
${customInstructions ? `   - Custom Rule: ${customInstructions}\n` : ''}${variationIndex > 0 ? `   - Variation #${variationIndex + 1}: Make this variation noticeably distinct in phrasing and perspective from previous drafts.\n` : ''}   - Length: 1 to 3 natural, impactful sentences authentic to Instagram.
   - Avoid generic AI-sounding phrases, cliches, or corporate buzzwords.
6. LANGUAGE PREFERENCE:
${getLanguageInstruction(replyLanguage)}

7. MULTI-TONE BUNDLING FOR INSTANT SWITCHING:
${multiToneInstruction || '   - None required for this variation.'}
### OUTPUT FORMAT:
You MUST respond with valid JSON matching this exact structure:
{
  "sentiment": "positive" | "neutral" | "negative" | "question" | "praise" | "complaint",
  "sentimentLabel": "Friendly & Positive" (short 2-4 word summary with sentiment emoji),
  "topics": ["Key Topic 1", "Key Topic 2"],
  "visualAnalysis": "Brief 1-sentence description of what you see in the post image/visuals (subjects, setting, attire, colors, mood). If no visual or image is provided or visible, leave this as an empty string \"\" without apologizing or explaining.",
  "reply": "Your drafted reply text here in ${primaryTone} style"${multiToneSchema}
}
Only output the JSON object. Do not include markdown code block backticks if possible.`;
}

/**
 * Builds the tone style instruction string for AI prompt
 */
function getToneInstruction(tone) {
  const t = (tone || 'friendly').toLowerCase();
  switch (t) {
    case 'sexy':
      return 'SEXY & SENSUAL: Sultry, confident, sensual charm, bold magnetic allure, and uninhibited charisma. Warm, intoxicating, and tasteful while turning up the heat.';
    case 'seductive':
      return 'SEDUCTIVE & TANTALIZING: Hypnotic, irresistible charm, slow-burn mystery, smooth and whisper-soft temptation. Leaves them wanting more.';
    case 'flirting':
    case 'flirty':
      return 'FLIRTING & CHARMING: Playful romantic banter, cute teasing, charming compliments, magnetic spark, and witty chemistry. Heart-fluttering and fun.';
    case 'alluring':
      return 'ALLURING & ENCHANTING: Sophisticated elegance, graceful fascination, captivating mystery, poetically mesmerizing compliments, and irresistible poise.';
    case 'mean':
      return 'MEAN & HAUGHTY: Unapologetic bad-bitch energy, condescending side-eye, cutting deadpan shade, elite snark, and deliciously icy dismissiveness. Hilariously ruthless without violating safety guidelines.';
    case 'evil':
    case 'villain':
      return 'EVIL & VILLAIN ERA: Deliciously wicked mastermind energy, dramatic theatrical flair, nefarious chuckle (muahaha), cunning schemes, dark comedic sarcasm, and unapologetic chaos.';
    case 'playful':
    case 'naughty':
      return 'PLAYFUL & CHEEKY / NAUGHTY: Mischievous charm, witty banter, playful teasing, subtle innuendo or cheeky wink-and-nudge humor. Fun, magnetic, and socially savvy without violating platform safety.';
    case 'savage':
    case 'roast':
      return 'SAVAGE & ROAST: Sharp comedic wit, hilarious burn, deadpan sarcasm, bold clapback (in the viral style of Wendy\'s Twitter or comedy roast). Witty and entertaining without being hateful or abusive.';
    case 'humorous':
    case 'funny':
      return 'FUNNY & WITTY: Relatable comedy, comedic punchlines, situational irony, punchy meme-like humor, laugh-out-loud amusement.';
    case 'geek':
    case 'nerd':
      return 'GEEK & TECH: Analytical curiosity, smart tech/pop-culture/gaming references, nerd pride, clever specs or lore breakdown.';
    case 'spicy':
      return 'SPICY & BOLD: Confident, fiery attitude, unapologetic bold energy, feisty punch, and magnetic charisma.';
    case 'enthusiastic':
      return 'HYPED & ENTHUSIASTIC: High energy, pumped, celebratory excitement, hype-person energy.';
    case 'professional':
      return 'PROFESSIONAL & POLISHED: Courteous, articulate, business-savvy, respectful, and reliable.';
    case 'empathetic':
      return 'EMPATHETIC & CARING: Deeply warm, understanding, emotionally supportive, heartfelt compassion.';
    case 'concise':
      return 'SHORT & SWEET: Ultra punchy (under 12 words), straight to the point, minimal filler.';
    case 'friendly':
    default:
      return 'FRIENDLY & CASUAL: Warm, approachable, authentic everyday Instagram conversation.';
  }
}

/**
 * Builds the language instruction string for AI prompt
 */
function getLanguageInstruction(lang) {
  if (!lang || lang === 'auto') {
    return `   - STRICT CONTEXT LANGUAGE MATCHING (Auto-Detect):
   - You MUST detect the primary language of the incoming comment or message (or post caption if writing a top-level post comment).
   - Write your ENTIRE reply in the EXACT SAME LANGUAGE and script as the context (e.g. if Japanese, reply in natural Japanese; if Traditional Chinese, reply in Traditional Chinese; if Spanish, reply in Spanish; if English, reply in English).
   - NEVER default or translate to English unless the context itself is in English!`;
  }
  const langNames = {
    'en': 'English',
    'ja': 'Japanese (日本語)',
    'zh-TW': 'Traditional Chinese (繁體中文)',
    'zh-CN': 'Simplified Chinese (简体中文)',
    'es': 'Spanish (Español)',
    'fr': 'French (Français)',
    'de': 'German (Deutsch)',
    'ko': 'Korean (한국어)',
    'pt': 'Portuguese (Português)',
    'it': 'Italian (Italiano)'
  };
  const target = langNames[lang] || lang;
  return `   - FORCED LANGUAGE: You MUST write your entire reply in ${target}, regardless of the language of the incoming context.`;
}

/**
 * Safely parses the AI's output into structured reply & sentiment fields
 */
function parseAIResponse(rawText) {
  try {
    let clean = rawText.trim();
    // Remove markdown ```json ... ``` wrapper if present
    if (clean.startsWith('```')) {
      clean = clean.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim();
    }
    // Extract substring between first { and last } if preamble exists
    const firstBrace = clean.indexOf('{');
    const lastBrace = clean.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      clean = clean.slice(firstBrace, lastBrace + 1);
    }
    const json = JSON.parse(clean);
    const rawDrafts = (json.toneDrafts && typeof json.toneDrafts === 'object') ? json.toneDrafts : {};
    const normalizedDrafts = {};
    for (const [k, v] of Object.entries(rawDrafts)) {
      if (typeof v === 'string' && v.trim()) {
        normalizedDrafts[normalizeToneName(k)] = v.trim();
      }
    }
    return {
      sentiment: json.sentiment || 'neutral',
      sentimentLabel: json.sentimentLabel || formatSentimentLabel(json.sentiment),
      topics: Array.isArray(json.topics) ? json.topics : [],
      visualAnalysis: json.visualAnalysis || '',
      reply: json.reply || clean,
      toneDrafts: normalizedDrafts
    };
  } catch (err) {
    console.warn('[InstaReply AI] Could not parse strict JSON, falling back to regex extraction:', err);
    // Fallback extraction
    return {
      sentiment: 'neutral',
      sentimentLabel: '✨ Analyzed',
      topics: [],
      visualAnalysis: '',
      reply: rawText.replace(/\{[\s\S]*"reply"\s*:\s*"([^"]+)"[\s\S]*\}/, '$1').trim(),
      toneDrafts: {}
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DEFAULT_CONFIG,
    VISION_MODEL_PATTERNS,
    isKnownVisionModel,
    isModelVisionSupported,
    isVisionRejectionError,
    checkOllamaVisionCapability,
    buildStructuredPrompt,
    parseAIResponse
  };
}
