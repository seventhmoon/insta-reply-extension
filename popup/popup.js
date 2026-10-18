// InstaReply AI - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements - Provider Select & Panels
  const providerSelect = document.getElementById('providerSelect');
  const providerRadios = document.querySelectorAll('input[name="provider"]');
  const geminiPanel = document.getElementById('gemini-settings');
  const groqPanel = document.getElementById('groq-settings');
  const openrouterPanel = document.getElementById('openrouter-settings');
  const customOpenAiPanel = document.getElementById('custom-openai-settings');
  const edgeAiPanel = document.getElementById('edge-ai-settings');
  const localLlmPanel = document.getElementById('local-llm-settings');

  // Gemini Elements
  const geminiApiKey = document.getElementById('geminiApiKey');
  const geminiModel = document.getElementById('geminiModel');
  const customModelWrapper = document.getElementById('customModelWrapper');
  const customModelInput = document.getElementById('customModelInput');
  const refreshModelsBtn = document.getElementById('refreshModelsBtn');
  const modelsFetchStatus = document.getElementById('modelsFetchStatus');
  const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');

  // Groq Elements
  const groqApiKey = document.getElementById('groqApiKey');
  const groqModel = document.getElementById('groqModel');
  const customGroqModelWrapper = document.getElementById('customGroqModelWrapper');
  const customGroqModelInput = document.getElementById('customGroqModelInput');
  const refreshGroqModelsBtn = document.getElementById('refreshGroqModelsBtn');
  const groqModelsFetchStatus = document.getElementById('groqModelsFetchStatus');
  const toggleGroqKeyVisibility = document.getElementById('toggleGroqKeyVisibility');

  // OpenRouter Elements
  const openrouterApiKey = document.getElementById('openrouterApiKey');
  const openrouterModel = document.getElementById('openrouterModel');
  const customOpenRouterModelWrapper = document.getElementById('customOpenRouterModelWrapper');
  const customOpenRouterModelInput = document.getElementById('customOpenRouterModelInput');
  const refreshOpenRouterModelsBtn = document.getElementById('refreshOpenRouterModelsBtn');
  const openRouterModelsFetchStatus = document.getElementById('openRouterModelsFetchStatus');
  const toggleOpenRouterKeyVisibility = document.getElementById('toggleOpenRouterKeyVisibility');

  // Custom OpenAI Elements
  const customOpenAiUrl = document.getElementById('customOpenAiUrl');
  const customOpenAiKey = document.getElementById('customOpenAiKey');
  const customOpenAiModel = document.getElementById('customOpenAiModel');
  const toggleCustomOpenAiKeyVisibility = document.getElementById('toggleCustomOpenAiKeyVisibility');

  // Edge AI Elements
  const edgeAiStatus = document.getElementById('edgeAiStatus');

  // Local LLM Elements
  const localLlmUrl = document.getElementById('localLlmUrl');
  const localLlmModelSelect = document.getElementById('localLlmModelSelect');
  const customLocalModelWrapper = document.getElementById('customLocalModelWrapper');
  const localLlmModel = document.getElementById('localLlmModel');
  const refreshLocalModelsBtn = document.getElementById('refreshLocalModelsBtn');
  const localModelsFetchStatus = document.getElementById('localModelsFetchStatus');

  // Reply Preferences Elements
  const defaultTone = document.getElementById('defaultTone');
  const defaultStance = document.getElementById('defaultStance');
  const replyLanguageSelect = document.getElementById('replyLanguageSelect');
  let savedReplyLanguage = 'auto';
  const enableAnalysis = document.getElementById('enableAnalysis');
  const includeEmojis = document.getElementById('includeEmojis');
  const includePostCaption = document.getElementById('includePostCaption');
  const enableMultimodalVision = document.getElementById('enableMultimodalVision');
  const enableSpamFilter = document.getElementById('enableSpamFilter');
  const enableQuickReply = document.getElementById('enableQuickReply');
  const shortcutClickAction = document.getElementById('shortcutClickAction');
  const quickReplyTone = document.getElementById('quickReplyTone');
  const composerButtonMode = document.getElementById('composerButtonMode');
  const commentButtonMode = document.getElementById('commentButtonMode');
  const launchMode = document.getElementById('launchMode');
  const openSidePanelBtn = document.getElementById('openSidePanelBtn');
  const myVoiceSamples = document.getElementById('myVoiceSamples');
  const customInstructions = document.getElementById('customInstructions');

  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const saveFeedback = document.getElementById('saveFeedback');

  // Tab Switching Logic
  const tabBtns = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const targetTab = btn.dataset.tab;
      tabBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetPane = document.getElementById(targetTab);
      if (targetPane) targetPane.classList.add('active');
      if (targetTab === 'tab-history') {
        loadHistory();
      }
      if (targetTab === 'tab-reply' || targetTab === 'tab-history') {
        document.querySelector('.app-footer')?.classList.add('hidden');
      } else {
        document.querySelector('.app-footer')?.classList.remove('hidden');
      }
    });
  });

  // Populate version badge dynamically from extension manifest
  try {
    const versionBadge = document.querySelector('.version-badge');
    if (versionBadge && typeof chrome !== 'undefined' && chrome.runtime?.getManifest) {
      const manifest = chrome.runtime.getManifest();
      if (manifest?.version) {
        versionBadge.textContent = `v${manifest.version}`;
      }
    }
  } catch (_) {}

  // Detect Side Panel Mode and adapt styling
  initSidePanelMode();

  function initSidePanelMode() {
    let isSidePanel = false;
    try {
      if (chrome.extension?.getViews) {
        const popups = chrome.extension.getViews({ type: 'popup' });
        if (popups && popups.length > 0 && !popups.includes(window)) {
          isSidePanel = true;
        }
      }
      if (window.location.search.includes('sidepanel')) {
        isSidePanel = true;
      }
    } catch (_) {}

    if (isSidePanel) {
      document.body.classList.add('is-sidepanel');
    }

    if (typeof chrome !== 'undefined' && chrome.runtime?.getContexts) {
      chrome.runtime.getContexts({ contextTypes: ['SIDE_PANEL'] }).then(contexts => {
        if (contexts && contexts.length > 0) {
          if (contexts.some(c => c.documentUrl?.includes('popup.html'))) {
            document.body.classList.add('is-sidepanel');
          }
        }
      }).catch(() => {});
    }
  }

  // Open Side Panel button
  if (openSidePanelBtn) {
    openSidePanelBtn.addEventListener('click', async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (typeof chrome !== 'undefined' && chrome.sidePanel?.open && tab?.windowId) {
          await chrome.sidePanel.open({ windowId: tab.windowId });
          window.close();
        } else {
          alert('Chrome Side Panel is available in Chrome 114+ and can also be opened via the Side Panel icon in Chrome toolbar.');
        }
      } catch (err) {
        console.warn('[InstaReply AI] Could not open side panel:', err);
      }
    });
  }

  // Immediate launchMode change listener
  if (launchMode) {
    launchMode.addEventListener('change', async () => {
      try {
        await chrome.runtime.sendMessage({
          action: 'SET_LAUNCH_MODE',
          mode: launchMode.value
        });
      } catch (err) {
        console.warn('[InstaReply AI] Failed to set launch mode:', err);
      }
    });
  }

  // Load saved configuration
  const config = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
  applyConfigToUI(config || {});

  // Provider Combobox Change Listener
  if (providerSelect) {
    providerSelect.addEventListener('change', () => {
      updateProviderPanels(providerSelect.value);
    });
  }

  // Legacy radio buttons (backwards compatibility)
  providerRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateProviderPanels(radio.value);
    });
  });

  // Toggle Custom Model Wrappers
  geminiModel.addEventListener('change', () => {
    if (geminiModel.value === 'custom') {
      customModelWrapper.classList.remove('hidden');
      customModelInput.focus();
    } else {
      customModelWrapper.classList.add('hidden');
    }
  });

  if (groqModel) {
    groqModel.addEventListener('change', () => {
      if (groqModel.value === 'custom') {
        customGroqModelWrapper.classList.remove('hidden');
        customGroqModelInput.focus();
      } else {
        customGroqModelWrapper.classList.add('hidden');
      }
    });
  }

  if (openrouterModel) {
    openrouterModel.addEventListener('change', () => {
      if (openrouterModel.value === 'custom') {
        customOpenRouterModelWrapper.classList.remove('hidden');
        customOpenRouterModelInput.focus();
      } else {
        customOpenRouterModelWrapper.classList.add('hidden');
      }
    });
  }

  localLlmModelSelect.addEventListener('change', () => {
    if (localLlmModelSelect.value === 'custom') {
      customLocalModelWrapper.classList.remove('hidden');
      localLlmModel.focus();
    } else {
      customLocalModelWrapper.classList.add('hidden');
    }
  });

  // Password Visibility Toggles
  function setupPasswordToggle(button, input) {
    if (!button || !input) return;
    button.addEventListener('click', () => {
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      button.textContent = isPassword ? '🔒' : '👁️';
    });
  }
  setupPasswordToggle(toggleKeyVisibility, geminiApiKey);
  setupPasswordToggle(toggleGroqKeyVisibility, groqApiKey);
  setupPasswordToggle(toggleOpenRouterKeyVisibility, openrouterApiKey);
  setupPasswordToggle(toggleCustomOpenAiKeyVisibility, customOpenAiKey);

  // Dynamic model fetch for Groq
  if (refreshGroqModelsBtn) {
    refreshGroqModelsBtn.addEventListener('click', async () => {
      const key = groqApiKey.value.trim();
      if (!key) {
        groqModelsFetchStatus.style.color = 'var(--accent-red)';
        groqModelsFetchStatus.textContent = 'Please enter your Groq API key above first.';
        groqApiKey.focus();
        return;
      }
      refreshGroqModelsBtn.disabled = true;
      groqModelsFetchStatus.style.color = 'var(--text-muted)';
      groqModelsFetchStatus.textContent = 'Querying Groq API for available models...';

      try {
        const res = await chrome.runtime.sendMessage({ action: 'FETCH_GROQ_MODELS', apiKey: key });
        if (res && res.success && res.models && res.models.length > 0) {
          populateDropdown(groqModel, res.models, getSelectedGroqModelName(), customGroqModelWrapper, customGroqModelInput);
          groqModelsFetchStatus.style.color = 'var(--accent-green)';
          groqModelsFetchStatus.textContent = `✓ Found ${res.models.length} active models.`;
        } else {
          groqModelsFetchStatus.style.color = 'var(--accent-red)';
          groqModelsFetchStatus.textContent = res?.error || 'Could not fetch Groq models.';
        }
      } catch (err) {
        groqModelsFetchStatus.style.color = 'var(--accent-red)';
        groqModelsFetchStatus.textContent = err.message || 'Error querying Groq models.';
      } finally {
        refreshGroqModelsBtn.disabled = false;
      }
    });
  }

  // Dynamic model fetch for OpenRouter
  if (refreshOpenRouterModelsBtn) {
    refreshOpenRouterModelsBtn.addEventListener('click', async () => {
      const key = openrouterApiKey.value.trim();
      refreshOpenRouterModelsBtn.disabled = true;
      openRouterModelsFetchStatus.style.color = 'var(--text-muted)';
      openRouterModelsFetchStatus.textContent = 'Fetching free models from OpenRouter...';

      try {
        const res = await chrome.runtime.sendMessage({ action: 'FETCH_OPENROUTER_MODELS', apiKey: key });
        if (res && res.success && res.models && res.models.length > 0) {
          populateDropdown(openrouterModel, res.models, getSelectedOpenRouterModelName(), customOpenRouterModelWrapper, customOpenRouterModelInput);
          openRouterModelsFetchStatus.style.color = 'var(--accent-green)';
          openRouterModelsFetchStatus.textContent = `✓ Found ${res.models.length} free/available models.`;
        } else {
          openRouterModelsFetchStatus.style.color = 'var(--accent-red)';
          openRouterModelsFetchStatus.textContent = res?.error || 'Could not fetch OpenRouter models.';
        }
      } catch (err) {
        openRouterModelsFetchStatus.style.color = 'var(--accent-red)';
        openRouterModelsFetchStatus.textContent = err.message || 'Error querying OpenRouter.';
      } finally {
        refreshOpenRouterModelsBtn.disabled = false;
      }
    });
  }

  // Dynamic model fetch from Google API
  refreshModelsBtn.addEventListener('click', async () => {
    const key = geminiApiKey.value.trim();
    if (!key) {
      modelsFetchStatus.style.color = 'var(--accent-red)';
      modelsFetchStatus.textContent = 'Please enter your Gemini API key above first.';
      geminiApiKey.focus();
      return;
    }

    refreshModelsBtn.disabled = true;
    modelsFetchStatus.style.color = 'var(--text-muted)';
    modelsFetchStatus.textContent = 'Querying Google AI for live available models...';

    try {
      const res = await chrome.runtime.sendMessage({ action: 'FETCH_GEMINI_MODELS', apiKey: key });
      if (res && res.success && res.models && res.models.length > 0) {
        populateDropdown(geminiModel, res.models, getSelectedModelName(), customModelWrapper, customModelInput);
        modelsFetchStatus.style.color = 'var(--accent-green)';
        modelsFetchStatus.textContent = `✓ Found ${res.models.length} active models for your API key.`;
      } else {
        modelsFetchStatus.style.color = 'var(--accent-red)';
        modelsFetchStatus.textContent = res?.error || 'Could not fetch models. Check API key.';
      }
    } catch (err) {
      modelsFetchStatus.style.color = 'var(--accent-red)';
      modelsFetchStatus.textContent = err.message || 'Error querying models.';
    } finally {
      refreshModelsBtn.disabled = false;
    }
  });

  // Dynamic model fetch for Local LLM
  refreshLocalModelsBtn.addEventListener('click', async () => {
    const url = localLlmUrl.value.trim() || 'http://localhost:11434/v1';
    refreshLocalModelsBtn.disabled = true;
    localModelsFetchStatus.style.color = 'var(--text-muted)';
    localModelsFetchStatus.textContent = 'Querying local server for installed models...';

    try {
      const res = await chrome.runtime.sendMessage({ action: 'FETCH_LOCAL_MODELS', url });
      if (res && res.success && res.models && res.models.length > 0) {
        populateDropdown(localLlmModelSelect, res.models, getSelectedLocalModelName(), customLocalModelWrapper, localLlmModel);
        localModelsFetchStatus.style.color = 'var(--accent-green)';
        localModelsFetchStatus.textContent = `✓ Found ${res.models.length} installed model(s).`;
      } else {
        localModelsFetchStatus.style.color = 'var(--accent-red)';
        localModelsFetchStatus.textContent = res?.error || 'No models found. Check Ollama.';
      }
    } catch (err) {
      localModelsFetchStatus.style.color = 'var(--accent-red)';
      localModelsFetchStatus.textContent = err.message || 'Error querying local models.';
    } finally {
      refreshLocalModelsBtn.disabled = false;
    }
  });

  // Generic Dropdown populator
  function populateDropdown(selectEl, modelsList, selectedValue, customWrapper, customInput) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    let hasSelected = false;

    modelsList.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.displayName || m.id;
      if (m.id === selectedValue) {
        opt.selected = true;
        hasSelected = true;
      }
      selectEl.appendChild(opt);
    });

    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '✏️ Enter Custom Model...';
    if (!hasSelected && selectedValue) {
      customOpt.selected = true;
      if (customWrapper) customWrapper.classList.remove('hidden');
      if (customInput) customInput.value = selectedValue;
    } else if (customWrapper && hasSelected) {
      customWrapper.classList.add('hidden');
    }
    selectEl.appendChild(customOpt);
  }

  function getSelectedModelName() {
    return geminiModel.value === 'custom' ? (customModelInput.value.trim() || 'gemini-1.5-flash') : geminiModel.value;
  }

  function getSelectedGroqModelName() {
    if (!groqModel) return 'llama-3.3-70b-versatile';
    return groqModel.value === 'custom' ? (customGroqModelInput.value.trim() || 'llama-3.3-70b-versatile') : groqModel.value;
  }

  function getSelectedOpenRouterModelName() {
    if (!openrouterModel) return 'meta-llama/llama-3.3-70b-instruct:free';
    return openrouterModel.value === 'custom' ? (customOpenRouterModelInput.value.trim() || 'meta-llama/llama-3.3-70b-instruct:free') : openrouterModel.value;
  }

  function getSelectedLocalModelName() {
    return localLlmModelSelect.value === 'custom' ? (localLlmModel.value.trim() || 'llama3.2') : localLlmModelSelect.value;
  }

  // Test Connection
  testConnectionBtn.addEventListener('click', async () => {
    const currentConfig = getUIConfig();
    const spinner = testConnectionBtn.querySelector('.btn-spinner');
    const startTime = Date.now();
    
    testConnectionBtn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    connectionStatus.className = 'connection-status-msg';
    connectionStatus.textContent = 'Testing connection...';

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'TEST_CONNECTION',
        config: currentConfig
      });

      const elapsed = Date.now() - startTime;

      if (res && res.success) {
        connectionStatus.className = 'connection-status-msg success';
        connectionStatus.innerHTML = `✓ ${res.message || 'Connected successfully!'} <span class="connection-latency-badge">${elapsed}ms</span>`;
      } else {
        connectionStatus.className = 'connection-status-msg error';
        connectionStatus.textContent = res?.error || 'Connection failed.';
      }
    } catch (err) {
      connectionStatus.className = 'connection-status-msg error';
      connectionStatus.textContent = err.message || 'Unexpected connection error.';
    } finally {
      testConnectionBtn.disabled = false;
      if (spinner) spinner.classList.add('hidden');
    }
  });

  // Save Settings
  saveSettingsBtn.addEventListener('click', async () => {
    const newConfig = getUIConfig();
    try {
      if (newConfig.provider === 'custom_openai' && newConfig.customOpenAiUrl && chrome.permissions?.request) {
        try {
          const origin = new URL(newConfig.customOpenAiUrl).origin + '/*';
          const hasPerm = await chrome.permissions.contains({ origins: [origin] });
          if (!hasPerm) {
            await chrome.permissions.request({ origins: [origin] }).catch(() => {});
          }
        } catch (_) {}
      }

      const res = await chrome.runtime.sendMessage({
        action: 'SAVE_CONFIG',
        config: newConfig
      });

      if (res && res.success) {
        saveFeedback.classList.remove('hidden');
        saveFeedback.textContent = '✓ Settings saved successfully!';
        setTimeout(() => {
          saveFeedback.classList.add('hidden');
        }, 2500);
      }
    } catch (err) {
      saveFeedback.classList.remove('hidden');
      saveFeedback.style.color = 'var(--accent-red)';
      saveFeedback.textContent = 'Failed to save settings.';
    }
  });

  // Apply saved config to UI
  function applyConfigToUI(cfg) {
    const provider = cfg.provider || 'gemini';
    if (providerSelect) {
      providerSelect.value = provider;
    }
    const radio = document.querySelector(`input[name="provider"][value="${provider}"]`);
    if (radio) radio.checked = true;
    updateProviderPanels(provider);

    // Gemini
    geminiApiKey.value = cfg.geminiApiKey || '';
    let selectedGeminiModel = cfg.geminiModel || 'gemini-1.5-flash';
    setSelectOrCustom(geminiModel, selectedGeminiModel, customModelWrapper, customModelInput);

    // Groq
    if (groqApiKey) groqApiKey.value = cfg.groqApiKey || '';
    if (groqModel) {
      const selectedGroq = cfg.groqModel || 'llama-3.3-70b-versatile';
      setSelectOrCustom(groqModel, selectedGroq, customGroqModelWrapper, customGroqModelInput);
    }

    // OpenRouter
    if (openrouterApiKey) openrouterApiKey.value = cfg.openrouterApiKey || '';
    if (openrouterModel) {
      const selectedOR = cfg.openrouterModel || 'meta-llama/llama-3.3-70b-instruct:free';
      setSelectOrCustom(openrouterModel, selectedOR, customOpenRouterModelWrapper, customOpenRouterModelInput);
    }

    // Custom OpenAI
    if (customOpenAiUrl) customOpenAiUrl.value = cfg.customOpenAiUrl || '';
    if (customOpenAiKey) customOpenAiKey.value = cfg.customOpenAiKey || '';
    if (customOpenAiModel) customOpenAiModel.value = cfg.customOpenAiModel || 'gpt-4o-mini';

    // Local LLM
    if (cfg.localLlmUrl) localLlmUrl.value = cfg.localLlmUrl;
    const selectedLocalModel = cfg.localLlmModel || 'llama3.2';
    setSelectOrCustom(localLlmModelSelect, selectedLocalModel, customLocalModelWrapper, localLlmModel);

    // Preferences
    if (cfg.defaultTone) defaultTone.value = cfg.defaultTone;
    if (defaultStance && cfg.defaultStance) defaultStance.value = cfg.defaultStance;
    if (cfg.replyLanguage) {
      savedReplyLanguage = cfg.replyLanguage;
      if (replyLanguageSelect) replyLanguageSelect.value = cfg.replyLanguage;
    }
    enableAnalysis.checked = cfg.enableAnalysis !== false;
    includeEmojis.checked = cfg.includeEmojis !== false;
    includePostCaption.checked = cfg.includePostCaption !== false;
    if (enableMultimodalVision) enableMultimodalVision.checked = cfg.enableMultimodalVision !== false;
    if (enableSpamFilter) enableSpamFilter.checked = cfg.enableSpamFilter !== false;
    if (enableQuickReply) enableQuickReply.checked = cfg.enableQuickReply !== false;
    if (shortcutClickAction) shortcutClickAction.value = cfg.shortcutClickAction || 'quick';
    if (quickReplyTone) quickReplyTone.value = cfg.quickReplyTone || cfg.defaultTone || 'friendly';
    if (composerButtonMode) composerButtonMode.value = cfg.composerButtonMode || 'smart';
    if (commentButtonMode) commentButtonMode.value = cfg.commentButtonMode || 'auto';
    if (launchMode && cfg.launchMode) launchMode.value = cfg.launchMode;
    if (myVoiceSamples) myVoiceSamples.value = cfg.myVoiceSamples || '';
    customInstructions.value = cfg.customInstructions || '';
  }

  function setSelectOrCustom(selectEl, value, wrapper, input) {
    if (!selectEl) return;
    let exists = false;
    for (let i = 0; i < selectEl.options.length; i++) {
      if (selectEl.options[i].value === value) {
        selectEl.selectedIndex = i;
        exists = true;
        break;
      }
    }
    if (!exists) {
      selectEl.value = 'custom';
      if (wrapper) wrapper.classList.remove('hidden');
      if (input) input.value = value;
    } else {
      if (wrapper) wrapper.classList.add('hidden');
    }
  }

  function getUIConfig() {
    const selectedProvider = providerSelect ? providerSelect.value : (document.querySelector('input[name="provider"]:checked')?.value || 'gemini');

    return {
      provider: selectedProvider,
      geminiApiKey: geminiApiKey.value.trim(),
      geminiModel: getSelectedModelName(),
      groqApiKey: groqApiKey ? groqApiKey.value.trim() : '',
      groqModel: getSelectedGroqModelName(),
      openrouterApiKey: openrouterApiKey ? openrouterApiKey.value.trim() : '',
      openrouterModel: getSelectedOpenRouterModelName(),
      customOpenAiUrl: customOpenAiUrl ? customOpenAiUrl.value.trim() : '',
      customOpenAiKey: customOpenAiKey ? customOpenAiKey.value.trim() : '',
      customOpenAiModel: customOpenAiModel ? customOpenAiModel.value.trim() : 'gpt-4o-mini',
      localLlmUrl: localLlmUrl.value.trim() || 'http://localhost:11434/v1',
      localLlmModel: getSelectedLocalModelName(),
      defaultTone: defaultTone.value,
      defaultStance: defaultStance ? defaultStance.value : 'positive',
      replyLanguage: replyLanguageSelect ? replyLanguageSelect.value : (savedReplyLanguage || 'auto'),
      enableAnalysis: enableAnalysis.checked,
      includeEmojis: includeEmojis.checked,
      includePostCaption: includePostCaption.checked,
      enableMultimodalVision: enableMultimodalVision ? enableMultimodalVision.checked : true,
      enableSpamFilter: enableSpamFilter ? enableSpamFilter.checked : true,
      enableQuickReply: enableQuickReply ? enableQuickReply.checked : true,
      shortcutClickAction: shortcutClickAction ? shortcutClickAction.value : 'quick',
      quickReplyTone: quickReplyTone ? quickReplyTone.value : 'friendly',
      composerButtonMode: composerButtonMode ? composerButtonMode.value : 'smart',
      commentButtonMode: commentButtonMode ? commentButtonMode.value : 'auto',
      launchMode: launchMode ? launchMode.value : 'popup',
      myVoiceSamples: myVoiceSamples ? myVoiceSamples.value.trim() : '',
      customInstructions: customInstructions.value.trim()
    };
  }

  // Switch visible panels
  function updateProviderPanels(provider) {
    [geminiPanel, groqPanel, openrouterPanel, customOpenAiPanel, edgeAiPanel, localLlmPanel].forEach(panel => {
      if (panel) panel.classList.add('hidden');
    });
    if (connectionStatus) connectionStatus.textContent = '';

    if (provider === 'gemini' && geminiPanel) {
      geminiPanel.classList.remove('hidden');
    } else if (provider === 'groq' && groqPanel) {
      groqPanel.classList.remove('hidden');
    } else if (provider === 'openrouter' && openrouterPanel) {
      openrouterPanel.classList.remove('hidden');
    } else if (provider === 'custom_openai' && customOpenAiPanel) {
      customOpenAiPanel.classList.remove('hidden');
    } else if (provider === 'edge_ai' && edgeAiPanel) {
      edgeAiPanel.classList.remove('hidden');
    } else if (provider === 'local_llm' && localLlmPanel) {
      localLlmPanel.classList.remove('hidden');
    }
  }

  // Check Edge AI capability
  checkEdgeAiAvailability();

  async function checkEdgeAiAvailability() {
    if (!edgeAiStatus) return;
    try {
      const api = (typeof LanguageModel !== 'undefined' ? LanguageModel : null) ||
                  (typeof window !== 'undefined' && window.LanguageModel ? window.LanguageModel : null) ||
                  (typeof window !== 'undefined' && window.ai?.languageModel ? window.ai.languageModel : null) ||
                  (typeof ai !== 'undefined' && ai?.languageModel ? ai.languageModel : null) ||
                  (typeof window !== 'undefined' && window.ai?.assistant ? window.ai.assistant : null);

      if (api) {
        edgeAiStatus.className = 'status-indicator ready';
        edgeAiStatus.textContent = '🟢 Chrome Built-in AI Prompt API is available!';
      } else {
        edgeAiStatus.className = 'status-indicator not-ready';
        edgeAiStatus.innerHTML = '🟡 Prompt API requires Chrome 128+ with flags enabled.<br>Check chrome://flags/#prompt-api-for-gemini-nano';
      }
    } catch {
      edgeAiStatus.className = 'status-indicator not-ready';
      edgeAiStatus.textContent = 'Prompt API check unavailable.';
    }
  }

  // Setup Popup Resizing
  setupPopupResize();

  function setupPopupResize() {
    const resizeHandle = document.getElementById('popupResizeHandle');
    if (!resizeHandle) return;
    if (document.body.classList.contains('is-sidepanel')) return;

    // Load saved dimensions
    try {
      chrome.storage?.local?.get(['popupWidth', 'popupHeight'], (res) => {
        if (document.body.classList.contains('is-sidepanel')) return;
        if (res?.popupWidth) {
          const w = Math.min(Math.max(res.popupWidth, 360), 780);
          document.body.style.width = `${w}px`;
        }
        if (res?.popupHeight) {
          const h = Math.min(Math.max(res.popupHeight, 480), 600);
          document.body.style.height = `${h}px`;
        }
      });
    } catch (_) {}

    let isResizing = false;
    let startX = 0;
    let startY = 0;
    let startW = 0;
    let startH = 0;

    resizeHandle.addEventListener('pointerdown', (e) => {
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startW = document.body.offsetWidth;
      startH = document.body.offsetHeight;
      document.body.classList.add('is-resizing');

      function onPointerMove(ev) {
        if (!isResizing) return;
        const deltaX = ev.clientX - startX;
        const deltaY = ev.clientY - startY;

        const newW = Math.min(Math.max(startW + deltaX, 360), 780);
        const newH = Math.min(Math.max(startH + deltaY, 480), 600);

        document.body.style.width = `${newW}px`;
        document.body.style.height = `${newH}px`;
      }

      function onPointerUp() {
        if (!isResizing) return;
        isResizing = false;
        document.body.classList.remove('is-resizing');
        document.removeEventListener('pointermove', onPointerMove);
        try {
          chrome.storage?.local?.set({
            popupWidth: document.body.offsetWidth,
            popupHeight: document.body.offsetHeight
          });
        } catch (_) {}
      }

      document.addEventListener('pointermove', onPointerMove);
      document.addEventListener('pointerup', onPointerUp, { once: true });
      e.preventDefault();
      e.stopPropagation();
    });
  }

  // History tab controller
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  const historyListContainer = document.getElementById('historyListContainer');

  async function loadHistory() {
    if (!historyListContainer) return;
    try {
      const res = await chrome.runtime.sendMessage({ action: 'GET_REPLY_HISTORY' });
      if (res && res.success && res.history && res.history.length > 0) {
        historyListContainer.innerHTML = '';
        res.history.forEach(item => {
          const itemEl = document.createElement('div');
          itemEl.className = 'history-item';
          const time = new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          itemEl.innerHTML = `
            <div class="history-item-header">
              <span class="history-meta">${escapeHtml(item.platform || 'instagram')} • ${escapeHtml(item.tone || 'friendly')} • ${time}</span>
              <button type="button" class="history-copy-btn">📋 Copy</button>
            </div>
            <div class="history-item-text"></div>
          `;
          itemEl.querySelector('.history-item-text').textContent = item.replyText;
          itemEl.querySelector('.history-copy-btn').addEventListener('click', async (e) => {
            await navigator.clipboard.writeText(item.replyText);
            e.target.textContent = '✓ Copied!';
            setTimeout(() => { e.target.textContent = '📋 Copy'; }, 1500);
          });
          historyListContainer.appendChild(itemEl);
        });
      } else {
        historyListContainer.innerHTML = '<p class="hint-text">No reply history yet. Generate a reply to see your recent drafts here!</p>';
      }
    } catch (_) {}
  }

  function escapeHtml(str) {
    return String(str || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener('click', async () => {
      await chrome.runtime.sendMessage({ action: 'CLEAR_REPLY_HISTORY' });
      if (historyListContainer) {
        historyListContainer.innerHTML = '<p class="hint-text">History cleared.</p>';
      }
    });
  }

  // =========================================================================
  // Live Reply Assistant (Side Panel & Popup Integration)
  // =========================================================================
  const replyTargetBadge = document.getElementById('replyTargetBadge');
  const replyPlatformTag = document.getElementById('replyPlatformTag');
  const replyContextText = document.getElementById('replyContextText');
  const replyExtraContext = document.getElementById('replyExtraContext');
  const replyExtraCaption = document.getElementById('replyExtraCaption');
  const liveReplyStance = document.getElementById('liveReplyStance');
  const liveReplyTone = document.getElementById('liveReplyTone');
  const liveReplyHint = document.getElementById('liveReplyHint');
  const liveDraftText = document.getElementById('liveDraftText');
  const liveCharCounter = document.getElementById('liveCharCounter');
  const draftLoadingOverlay = document.getElementById('draftLoadingOverlay');
  const insertReplyBtn = document.getElementById('insertReplyBtn');
  const regenerateReplyBtn = document.getElementById('regenerateReplyBtn');
  const copyLiveReplyBtn = document.getElementById('copyLiveReplyBtn');
  const liveReplyFeedback = document.getElementById('liveReplyFeedback');

  let activeLiveContext = null;
  let activeBundledTones = {};

  initLiveReplyWorkflow();

  function initLiveReplyWorkflow() {
    if (!liveDraftText) return;

    // Character counter listener
    liveDraftText.addEventListener('input', updateLiveCharCount);

    // Stance change listener -> triggers regeneration
    if (liveReplyStance) {
      liveReplyStance.addEventListener('change', () => {
        executeLiveDraftGeneration();
      });
    }

    // Tone change listener -> uses bundled tone if available, else regenerates
    if (liveReplyTone) {
      liveReplyTone.addEventListener('change', () => {
        const selectedTone = liveReplyTone.value;
        if (activeBundledTones && activeBundledTones[selectedTone]) {
          liveDraftText.value = activeBundledTones[selectedTone];
          updateLiveCharCount();
        } else {
          executeLiveDraftGeneration();
        }
      });
    }

    // Regenerate button
    if (regenerateReplyBtn) {
      regenerateReplyBtn.addEventListener('click', () => {
        executeLiveDraftGeneration();
      });
    }

    // Copy button
    if (copyLiveReplyBtn) {
      copyLiveReplyBtn.addEventListener('click', async () => {
        const text = liveDraftText.value.trim();
        if (!text) return;
        await navigator.clipboard.writeText(text);
        showLiveFeedback('✓ Copied to clipboard!', 'success');
      });
    }

    // Insert into Comment button
    if (insertReplyBtn) {
      insertReplyBtn.addEventListener('click', async () => {
        const text = liveDraftText.value.trim();
        if (!text) {
          showLiveFeedback('Please generate or enter a reply first.', 'error');
          return;
        }

        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.id) {
            chrome.tabs.sendMessage(tab.id, {
              action: 'INSERT_REPLY_FROM_SIDEPANEL',
              text: text,
              context: activeLiveContext
            }, (response) => {
              if (chrome.runtime.lastError || !response?.success) {
                showLiveFeedback('Could not insert: input not found or page reloaded.', 'error');
              } else {
                showLiveFeedback('✓ Inserted into comment! 🚀', 'success');
              }
            });
          }
        } catch (err) {
          showLiveFeedback('Failed to insert reply into page.', 'error');
        }
      });
    }

    // Listen for live reply context update messages
    if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage) {
      chrome.runtime.onMessage.addListener((message) => {
        if (message.action === 'ACTIVE_REPLY_CONTEXT_UPDATED' && message.context) {
          applyLiveContext(message.context);
        }
      });
    }

    // Check for cached reply context on mount
    fetchInitialLiveContext();
  }

  async function fetchInitialLiveContext() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'GET_ACTIVE_REPLY_CONTEXT' });
      if (res && res.success && res.context) {
        applyLiveContext(res.context);
        return;
      }

      // Fallback: query active tab for lastContextData
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, { action: 'GET_PAGE_REPLY_CONTEXT' }, (pageRes) => {
          if (!chrome.runtime.lastError && pageRes?.success && pageRes?.context) {
            applyLiveContext(pageRes.context);
          }
        });
      }
    } catch (_) {}
  }

  function applyLiveContext(ctx) {
    if (!ctx) return;
    activeLiveContext = ctx;

    // Switch to Reply tab
    switchToReplyTab();

    // Update target context display
    const author = ctx.author ? `@${ctx.author.replace(/^@/, '')}` : 'Post';
    const cType = ctx.contextType === 'story' ? '📸 Instagram Story' :
                  ctx.contextType === 'dm' ? `✉️ DM with ${author}` :
                  `💬 Replying to ${author}`;

    if (replyTargetBadge) replyTargetBadge.textContent = cType;
    if (replyPlatformTag) replyPlatformTag.textContent = (ctx.platform || 'instagram').toUpperCase();

    const snippet = ctx.incomingText || ctx.postCaption || 'Post context loaded';
    if (replyContextText) replyContextText.textContent = `"${snippet}"`;

    if (ctx.postVisuals?.description && replyExtraContext && replyExtraCaption) {
      replyExtraCaption.textContent = `Visual scene: ${ctx.postVisuals.description}`;
      replyExtraContext.classList.remove('hidden');
    }

    if (ctx.userDraftHint && liveReplyHint) {
      liveReplyHint.value = ctx.userDraftHint;
    }

    // Auto-generate reply for loaded context
    executeLiveDraftGeneration();
  }

  function switchToReplyTab() {
    tabBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-selected', 'false');
    });
    tabPanes.forEach(p => p.classList.remove('active'));

    const replyBtn = document.getElementById('tabBtnReply');
    const replyPane = document.getElementById('tab-reply');
    if (replyBtn) {
      replyBtn.classList.add('active');
      replyBtn.setAttribute('aria-selected', 'true');
    }
    if (replyPane) {
      replyPane.classList.add('active');
    }
    document.querySelector('.app-footer')?.classList.add('hidden');
  }

  async function executeLiveDraftGeneration() {
    if (!liveDraftText) return;

    if (draftLoadingOverlay) draftLoadingOverlay.classList.remove('hidden');
    if (liveReplyFeedback) liveReplyFeedback.classList.add('hidden');

    const stance = liveReplyStance ? liveReplyStance.value : 'positive';
    const tone = liveReplyTone ? liveReplyTone.value : 'friendly';
    const hint = liveReplyHint ? liveReplyHint.value.trim() : '';

    const payload = {
      platform: activeLiveContext?.platform || 'instagram',
      contextType: activeLiveContext?.contextType || 'comment',
      incomingText: activeLiveContext?.incomingText || '',
      postCaption: activeLiveContext?.postCaption || '',
      postAuthor: activeLiveContext?.postAuthor || '',
      postVisuals: activeLiveContext?.postVisuals || null,
      author: activeLiveContext?.author || '',
      isSpecificCommentReply: activeLiveContext?.isSpecificCommentReply || false,
      userDraftHint: hint || activeLiveContext?.userDraftHint || '',
      stance,
      tone,
      variationIndex: 0
    };

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'GENERATE_REPLY',
        payload
      });

      if (res && res.success && res.reply) {
        liveDraftText.value = res.reply;
        activeBundledTones = res.toneReplies || {};
        updateLiveCharCount();
      } else {
        liveDraftText.value = '';
        showLiveFeedback(res?.error || 'Failed to generate reply.', 'error');
      }
    } catch (err) {
      showLiveFeedback('Generation request failed.', 'error');
    } finally {
      if (draftLoadingOverlay) draftLoadingOverlay.classList.add('hidden');
    }
  }

  function updateLiveCharCount() {
    if (!liveDraftText || !liveCharCounter) return;
    const len = liveDraftText.value.length;
    const limit = activeLiveContext?.charLimit || (activeLiveContext?.platform === 'x' ? 280 : activeLiveContext?.platform === 'threads' ? 500 : 2200);

    liveCharCounter.textContent = `${len} / ${limit}`;
    liveCharCounter.classList.remove('warning', 'overlimit');
    if (len > limit) {
      liveCharCounter.classList.add('overlimit');
    } else if (len > limit * 0.85) {
      liveCharCounter.classList.add('warning');
    }
  }

  function showLiveFeedback(msg, type = 'success') {
    if (!liveReplyFeedback) return;
    liveReplyFeedback.textContent = msg;
    liveReplyFeedback.className = `save-feedback ${type}`;
    liveReplyFeedback.classList.remove('hidden');
    setTimeout(() => {
      liveReplyFeedback.classList.add('hidden');
    }, 2500);
  }
});
