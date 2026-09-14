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
  let savedReplyLanguage = 'auto';
  const enableAnalysis = document.getElementById('enableAnalysis');
  const includeEmojis = document.getElementById('includeEmojis');
  const includePostCaption = document.getElementById('includePostCaption');
  const enableMultimodalVision = document.getElementById('enableMultimodalVision');
  const customInstructions = document.getElementById('customInstructions');

  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const saveFeedback = document.getElementById('saveFeedback');

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
    
    testConnectionBtn.disabled = true;
    if (spinner) spinner.classList.remove('hidden');
    connectionStatus.className = 'connection-status-msg';
    connectionStatus.textContent = 'Testing connection...';

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'TEST_CONNECTION',
        config: currentConfig
      });

      if (res && res.success) {
        connectionStatus.className = 'connection-status-msg success';
        connectionStatus.textContent = res.message || 'Connected successfully!';
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
    if (selectedGeminiModel === 'gemini-2.5-flash') selectedGeminiModel = 'gemini-1.5-flash';
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
    if (cfg.replyLanguage) savedReplyLanguage = cfg.replyLanguage;
    enableAnalysis.checked = cfg.enableAnalysis !== false;
    includeEmojis.checked = cfg.includeEmojis !== false;
    includePostCaption.checked = cfg.includePostCaption !== false;
    if (enableMultimodalVision) enableMultimodalVision.checked = cfg.enableMultimodalVision !== false;
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
      replyLanguage: savedReplyLanguage || 'auto',
      enableAnalysis: enableAnalysis.checked,
      includeEmojis: includeEmojis.checked,
      includePostCaption: includePostCaption.checked,
      enableMultimodalVision: enableMultimodalVision ? enableMultimodalVision.checked : true,
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
});
