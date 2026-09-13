// InstaReply AI - Main World Bridge for Chrome Built-in Prompt API (Gemini Nano)

(function () {
  'use strict';

  // Listen for requests from the content script (isolated world)
  window.addEventListener('message', async (event) => {
    if (event.source !== window || !event.data || event.data.type !== 'INSTAREPLY_RUN_PROMPT_API') {
      return;
    }

    const { requestId, payload } = event.data;

    try {
      // 1. Detect any supported Prompt API interface (W3C LanguageModel or legacy window.ai)
      let apiInterface = null;
      let apiKind = '';

      if (typeof LanguageModel !== 'undefined') {
        apiInterface = LanguageModel;
        apiKind = 'LanguageModel';
      } else if (typeof window !== 'undefined' && window.LanguageModel) {
        apiInterface = window.LanguageModel;
        apiKind = 'LanguageModel';
      } else if (typeof window !== 'undefined' && window.ai?.languageModel) {
        apiInterface = window.ai.languageModel;
        apiKind = 'window.ai.languageModel';
      } else if (typeof ai !== 'undefined' && ai?.languageModel) {
        apiInterface = ai.languageModel;
        apiKind = 'ai.languageModel';
      } else if (typeof window !== 'undefined' && window.ai?.assistant) {
        apiInterface = window.ai.assistant;
        apiKind = 'window.ai.assistant';
      }

      if (!apiInterface) {
        window.postMessage({
          type: 'INSTAREPLY_PROMPT_API_RESPONSE',
          requestId,
          success: false,
          error: 'Chrome Built-in Prompt API (Gemini Nano) requires 2 flags in Chrome:\n' +
                 '1. chrome://flags/#optimization-guide-on-device-model ➔ Set to "Enabled BypassPerfRequirement"\n' +
                 '2. chrome://flags/#prompt-api-for-gemini-nano ➔ Set to "Enabled"\n' +
                 '3. Click Relaunch at the bottom of chrome://flags to restart Chrome.\n' +
                 '4. Check chrome://components ➔ Ensure "Optimization Guide On Device Model" is downloaded.'
        }, '*');
        return;
      }

      // Shared capability options for Chrome Built-in Prompt API (Gemini Nano)
      // Specifying expectedInputs & expectedOutputs with supported language tags ('en')
      // satisfies Chrome's safety attestation requirement and prevents:
      // "No output language was specified in a LanguageModel API request"
      const capabilityOptions = {
        expectedInputs: [{ type: 'text', languages: ['en'] }],
        expectedOutputs: [{ type: 'text', languages: ['en'] }]
      };

      // Check availability / capabilities
      let isAvailable = true;
      if (typeof apiInterface.availability === 'function') {
        let avail = await apiInterface.availability(capabilityOptions).catch(() => null);
        if (!avail) {
          // Fallback for earlier Chrome builds where availability took no options
          avail = await apiInterface.availability().catch(() => null);
        }

        // Returns: 'readily', 'available', 'downloadable', 'downloading', 'no', 'unavailable'
        if (avail === 'no' || avail === 'unavailable') {
          window.postMessage({
            type: 'INSTAREPLY_PROMPT_API_RESPONSE',
            requestId,
            success: false,
            error: 'Gemini Nano is not ready on this machine. In chrome://flags, set #optimization-guide-on-device-model to "Enabled BypassPerfRequirement" and restart Chrome.'
          }, '*');
          return;
        }
        if (avail === 'downloading' || avail === 'downloadable' || avail === 'after-download') {
          console.log('[InstaReply AI] Gemini Nano model needs download or is downloading...');
        }
      } else if (typeof apiInterface.capabilities === 'function') {
        const caps = await apiInterface.capabilities().catch(() => null);
        if (caps && caps.available === 'no') {
          window.postMessage({
            type: 'INSTAREPLY_PROMPT_API_RESPONSE',
            requestId,
            success: false,
            error: 'Gemini Nano returned availability: "no". In chrome://flags, set #optimization-guide-on-device-model to "Enabled BypassPerfRequirement" and restart Chrome.'
          }, '*');
          return;
        }
      }

      // Create Prompt Session with safety/language attestation and initialPrompts
      const systemInstruction = "You are an expert Instagram assistant. Respond in valid JSON with fields: sentiment (positive, question, negative, neutral), sentimentLabel, topics (string array), visualAnalysis (brief 1-sentence description of what you see in the post visuals), reply (the text to post).";

      const sessionOptions = {
        ...capabilityOptions,
        outputLanguage: 'en',
        initialPrompts: [
          { role: 'system', content: systemInstruction }
        ],
        systemPrompt: systemInstruction
      };

      let session;
      try {
        session = await apiInterface.create(sessionOptions);
      } catch (createErr) {
        console.warn('[InstaReply AI] Full session options failed, attempting fallback create...', createErr);
        try {
          session = await apiInterface.create({
            expectedOutputs: capabilityOptions.expectedOutputs,
            systemPrompt: systemInstruction
          });
        } catch (legacyErr) {
          session = await apiInterface.create({
            systemPrompt: systemInstruction
          });
        }
      }

      const isCommentReply = payload.replyMode === 'comment_reply' || Boolean(payload.isSpecificCommentReply);
      const stance = payload.stance || 'positive';
      let stanceRule = '2. Stance: Positive. Be warm, supportive, and encouraging.';
      if (stance === 'negative') {
        stanceRule = '2. Stance: Negative / Firm. Politely disagree, set firm boundaries, or decline respectfully without enthusiasm.';
      } else if (stance === 'neutral') {
        stanceRule = '2. Stance: Neutral. Be objective, calm, and matter-of-fact without emotional hype or negativity.';
      }
      const replyLang = payload.replyLanguage || 'auto';
      let langRule = '5. Language: Strictly match the language of the incoming comment/post (e.g. if Japanese, reply in natural Japanese; if Traditional Chinese, reply in Traditional Chinese; if Spanish, reply in Spanish; if English, reply in English). Do NOT default or translate to English unless context is English!';
      if (replyLang !== 'auto') {
        const langMap = {
          'en': 'English', 'ja': 'Japanese', 'zh-TW': 'Traditional Chinese', 'zh-CN': 'Simplified Chinese',
          'es': 'Spanish', 'fr': 'French', 'de': 'German', 'ko': 'Korean', 'pt': 'Portuguese', 'it': 'Italian'
        };
        langRule = `5. Language: Always write the entire reply in ${langMap[replyLang] || replyLang}.`;
      }

      const prompt = `Instagram Context:
- Target Reply Stance: ${stance.toUpperCase()}
${payload.relationshipSummary ? `- Relationship: ${payload.relationshipSummary}` : ''}
${payload.isCurrentUserPostAuthor ? `- User Role: POST CREATOR (@${payload.postAuthor}) replying to audience` : (isCommentReply ? `- User Role: Replying to @${payload.author}'s comment` : '- User Role: Writing a top-level post comment')}
${payload.postAuthor ? `- Post Author: @${payload.postAuthor}` : ''}
${payload.postVisuals?.description ? `- Post Visual Content (${payload.postVisuals.mediaType === 'video' ? 'Video' : 'Photo'}): "${payload.postVisuals.description}"` : ''}
${payload.postCaption ? `- Original Post Caption: "${payload.postCaption}"` : ''}
${isCommentReply ? `- Comment Being Replied To: "${payload.incomingText}" (by @${payload.author})` : `- Incoming / Post Context: "${payload.incomingText || 'Instagram post'}"`}
${payload.author && !isCommentReply ? `- Author: @${payload.author}` : ''}
${payload.userDraftHint ? `- User Draft Hint: "${payload.userDraftHint}" (incorporate this hint!)` : ''}
- Tone: ${payload.tone}

CRITICAL RULES:
${payload.isCurrentUserPostAuthor ? '1. You are the CREATOR (@' + payload.postAuthor + '). Speak in first person ("I", "my") and answer or thank your audience.' : (isCommentReply ? '1. Directly answer @' + payload.author + '\'s specific comment while referencing the post context.' : '1. Write an engaging top-level comment on the creator\'s post and image.')}
${stanceRule}
${payload.postVisuals?.description ? '3. Visual Grounding: Reference what is depicted in the image/video ("' + payload.postVisuals.description + '").' : ''}
4. Be authentic, concise (1-2 sentences), and tailored to Instagram. Avoid robotic marketing language.
${langRule}

Respond with valid JSON:
{
  "sentiment": "positive",
  "sentimentLabel": "🟢 Positive",
  "topics": ["photography", "presets"],
  "visualAnalysis": "Brief 1-sentence description of what you see in the post visuals",
  "reply": "Draft reply here"
}`;

      let result = '';
      try {
        result = await session.prompt(prompt);
      } finally {
        try {
          if (session && typeof session.destroy === 'function') {
            session.destroy();
          }
        } catch (_) {}
      }

      let parsed = {
        sentiment: 'positive',
        sentimentLabel: '⚡ On-Device AI',
        topics: ['Instagram'],
        reply: result.trim()
      };

      try {
        let clean = result.trim();
        if (clean.startsWith('```')) {
          clean = clean.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
        }
        const json = JSON.parse(clean);
        parsed = { ...parsed, ...json };
      } catch (_) {}

      // Send result back to content script
      window.postMessage({
        type: 'INSTAREPLY_PROMPT_API_RESPONSE',
        requestId,
        success: true,
        modelUsed: 'Gemini Nano (Edge AI)',
        ...parsed
      }, '*');
    } catch (err) {
      window.postMessage({
        type: 'INSTAREPLY_PROMPT_API_RESPONSE',
        requestId,
        success: false,
        error: `Edge AI error: ${err.message || 'Prompt execution failed.'}`
      }, '*');
    }
  });

  // Signal that the bridge is active in the page
  window.__INSTAREPLY_BRIDGE_ACTIVE__ = true;
})();
