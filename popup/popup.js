// InstaReply AI - Popup Controller

document.addEventListener('DOMContentLoaded', async () => {
  // DOM Elements
  const providerRadios = document.querySelectorAll('input[name="provider"]');
  const geminiPanel = document.getElementById('gemini-settings');
  const edgeAiPanel = document.getElementById('edge-ai-settings');
  const localLlmPanel = document.getElementById('local-llm-settings');

  const geminiApiKey = document.getElementById('geminiApiKey');
  const geminiModel = document.getElementById('geminiModel');
  const customModelWrapper = document.getElementById('customModelWrapper');
  const customModelInput = document.getElementById('customModelInput');
  const refreshModelsBtn = document.getElementById('refreshModelsBtn');
  const modelsFetchStatus = document.getElementById('modelsFetchStatus');
  const toggleKeyVisibility = document.getElementById('toggleKeyVisibility');

  const edgeAiStatus = document.getElementById('edgeAiStatus');

  const localLlmUrl = document.getElementById('localLlmUrl');
  const localLlmModelSelect = document.getElementById('localLlmModelSelect');
  const customLocalModelWrapper = document.getElementById('customLocalModelWrapper');
  const localLlmModel = document.getElementById('localLlmModel');
  const refreshLocalModelsBtn = document.getElementById('refreshLocalModelsBtn');
  const localModelsFetchStatus = document.getElementById('localModelsFetchStatus');

  const defaultTone = document.getElementById('defaultTone');
  const defaultStance = document.getElementById('defaultStance');
  const enableAnalysis = document.getElementById('enableAnalysis');
  const includeEmojis = document.getElementById('includeEmojis');
  const includePostCaption = document.getElementById('includePostCaption');
  const customInstructions = document.getElementById('customInstructions');

  const testConnectionBtn = document.getElementById('testConnectionBtn');
  const connectionStatus = document.getElementById('connectionStatus');
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  const saveFeedback = document.getElementById('saveFeedback');

  // Load saved configuration
  const config = await chrome.runtime.sendMessage({ action: 'GET_CONFIG' });
  applyConfigToUI(config || {});

  // Handle custom Gemini model toggle
  geminiModel.addEventListener('change', () => {
    if (geminiModel.value === 'custom') {
      customModelWrapper.classList.remove('hidden');
      customModelInput.focus();
    } else {
      customModelWrapper.classList.add('hidden');
    }
  });

  // Handle custom Local LLM model toggle
  localLlmModelSelect.addEventListener('change', () => {
    if (localLlmModelSelect.value === 'custom') {
      customLocalModelWrapper.classList.remove('hidden');
      localLlmModel.focus();
    } else {
      customLocalModelWrapper.classList.add('hidden');
    }
  });

  // Handle dynamic model fetch for Local LLM
  refreshLocalModelsBtn.addEventListener('click', async () => {
    await fetchAndPopulateLocalModels();
  });

  async function fetchAndPopulateLocalModels() {
    const url = localLlmUrl.value.trim() || 'http://localhost:11434/v1';
    refreshLocalModelsBtn.disabled = true;
    localModelsFetchStatus.style.color = 'var(--text-muted)';
    localModelsFetchStatus.textContent = 'Querying local server for installed models...';

    try {
      const res = await chrome.runtime.sendMessage({
        action: 'FETCH_LOCAL_MODELS',
        url
      });

      if (res && res.success && res.models && res.models.length > 0) {
        populateLocalModelDropdown(res.models, getSelectedLocalModelName());
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
  }

  // Handle dynamic model fetch from Google API
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
      const res = await chrome.runtime.sendMessage({
        action: 'FETCH_GEMINI_MODELS',
        apiKey: key
      });

      if (res && res.success && res.models && res.models.length > 0) {
        populateModelDropdown(res.models, getSelectedModelName());
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

  // Provider radio switch handler
  providerRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      updateProviderPanels(radio.value);
    });
  });

  // Toggle API Key visibility
  toggleKeyVisibility.addEventListener('click', () => {
    const isPassword = geminiApiKey.type === 'password';
    geminiApiKey.type = isPassword ? 'text' : 'password';
    toggleKeyVisibility.textContent = isPassword ? '🔒' : '👁️';
  });

  // Check Edge AI capability
  checkEdgeAiAvailability();

  // Test Connection
  testConnectionBtn.addEventListener('click', async () => {
    const currentConfig = getUIConfig();
    const spinner = testConnectionBtn.querySelector('.btn-spinner');
    
    testConnectionBtn.disabled = true;
    spinner.classList.remove('hidden');
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

        // Auto-refresh the Local LLM models list when connected
        if (currentConfig.provider === 'local_llm' && res.models && res.models.length > 0) {
          populateLocalModelDropdown(res.models, getSelectedLocalModelName());
          localModelsFetchStatus.style.color = 'var(--accent-green)';
          localModelsFetchStatus.textContent = `✓ Auto-updated ${res.models.length} model(s) from local server.`;
        }
      } else {
        connectionStatus.className = 'connection-status-msg error';
        connectionStatus.textContent = res?.error || 'Connection failed.';
      }
    } catch (err) {
      connectionStatus.className = 'connection-status-msg error';
      connectionStatus.textContent = err.message || 'Unexpected connection error.';
    } finally {
      testConnectionBtn.disabled = false;
      spinner.classList.add('hidden');
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

  function getSelectedLocalModelName() {
    if (localLlmModelSelect.value === 'custom') {
      return localLlmModel.value.trim() || 'llama3.2';
    }
    return localLlmModelSelect.value;
  }

  function populateLocalModelDropdown(modelsList, selectedValue) {
    localLlmModelSelect.innerHTML = '';

    let hasSelected = false;
    modelsList.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.displayName;
      if (m.id === selectedValue || m.id.split(':')[0] === selectedValue) {
        opt.selected = true;
        hasSelected = true;
      }
      localLlmModelSelect.appendChild(opt);
    });

    // Custom option
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '✏️ Enter Custom Model Name...';
    if (!hasSelected && selectedValue) {
      customOpt.selected = true;
      customLocalModelWrapper.classList.remove('hidden');
      localLlmModel.value = selectedValue;
    } else if (hasSelected) {
      customLocalModelWrapper.classList.add('hidden');
    }
    localLlmModelSelect.appendChild(customOpt);
  }

  function getSelectedModelName() {
    if (geminiModel.value === 'custom') {
      return customModelInput.value.trim() || 'gemini-1.5-flash';
    }
    return geminiModel.value;
  }

  function populateModelDropdown(modelsList, selectedValue) {
    geminiModel.innerHTML = '';

    // Sort models so flash / flash-lite are on top, followed by pro, then others
    const sorted = [...modelsList].sort((a, b) => {
      const aLower = a.id.toLowerCase();
      const bLower = b.id.toLowerCase();
      const aIsFlash = aLower.includes('flash');
      const bIsFlash = bLower.includes('flash');
      if (aIsFlash && !bIsFlash) return -1;
      if (!aIsFlash && bIsFlash) return 1;
      return aLower.localeCompare(bLower);
    });

    let hasSelected = false;
    sorted.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = `${m.displayName} (${m.id})`;
      if (m.id === selectedValue) {
        opt.selected = true;
        hasSelected = true;
      }
      geminiModel.appendChild(opt);
    });

    // Custom model option
    const customOpt = document.createElement('option');
    customOpt.value = 'custom';
    customOpt.textContent = '✏️ Enter Custom Model / Pointer...';
    if (!hasSelected && selectedValue) {
      customOpt.selected = true;
      customModelWrapper.classList.remove('hidden');
      customModelInput.value = selectedValue;
    }
    geminiModel.appendChild(customOpt);
  }

  // Helper: Update UI from config object
  function applyConfigToUI(cfg) {
    const provider = cfg.provider || 'gemini';
    const radio = document.querySelector(`input[name="provider"][value="${provider}"]`);
    if (radio) radio.checked = true;
    updateProviderPanels(provider);

    geminiApiKey.value = cfg.geminiApiKey || '';
    let selectedModel = cfg.geminiModel || 'gemini-1.5-flash';
    if (selectedModel === 'gemini-2.5-flash') selectedModel = 'gemini-1.5-flash';

    // Check if selectedModel exists in current options
    let optionExists = false;
    for (let i = 0; i < geminiModel.options.length; i++) {
      if (geminiModel.options[i].value === selectedModel) {
        geminiModel.selectedIndex = i;
        optionExists = true;
        break;
      }
    }

    if (!optionExists) {
      geminiModel.value = 'custom';
      customModelWrapper.classList.remove('hidden');
      customModelInput.value = selectedModel;
    } else {
      customModelWrapper.classList.add('hidden');
    }

    if (cfg.localLlmUrl) localLlmUrl.value = cfg.localLlmUrl;
    let selectedLocalModel = cfg.localLlmModel || 'llama3.2';

    // Check if selectedLocalModel exists in current local options
    let localOptionExists = false;
    for (let i = 0; i < localLlmModelSelect.options.length; i++) {
      if (localLlmModelSelect.options[i].value === selectedLocalModel) {
        localLlmModelSelect.selectedIndex = i;
        localOptionExists = true;
        break;
      }
    }

    if (!localOptionExists) {
      localLlmModelSelect.value = 'custom';
      customLocalModelWrapper.classList.remove('hidden');
      localLlmModel.value = selectedLocalModel;
    } else {
      customLocalModelWrapper.classList.add('hidden');
    }

    if (cfg.defaultTone) defaultTone.value = cfg.defaultTone;
    if (defaultStance && cfg.defaultStance) defaultStance.value = cfg.defaultStance;
    enableAnalysis.checked = cfg.enableAnalysis !== false;
    includeEmojis.checked = cfg.includeEmojis !== false;
    includePostCaption.checked = cfg.includePostCaption !== false;
    customInstructions.value = cfg.customInstructions || '';
  }

  // Helper: Extract current form values into config object
  function getUIConfig() {
    const selectedProvider = document.querySelector('input[name="provider"]:checked')?.value || 'gemini';
    const chosenGeminiModel = geminiModel.value === 'custom'
      ? (customModelInput.value.trim() || 'gemini-1.5-flash')
      : geminiModel.value;

    const chosenLocalModel = localLlmModelSelect.value === 'custom'
      ? (localLlmModel.value.trim() || 'llama3.2')
      : localLlmModelSelect.value;

    return {
      provider: selectedProvider,
      geminiApiKey: geminiApiKey.value.trim(),
      geminiModel: chosenGeminiModel,
      localLlmUrl: localLlmUrl.value.trim() || 'http://localhost:11434/v1',
      localLlmModel: chosenLocalModel,
      defaultTone: defaultTone.value,
      defaultStance: defaultStance ? defaultStance.value : 'positive',
      enableAnalysis: enableAnalysis.checked,
      includeEmojis: includeEmojis.checked,
      includePostCaption: includePostCaption.checked,
      customInstructions: customInstructions.value.trim()
    };
  }

  // Switch visible panels
  function updateProviderPanels(provider) {
    geminiPanel.classList.add('hidden');
    edgeAiPanel.classList.add('hidden');
    localLlmPanel.classList.add('hidden');
    connectionStatus.textContent = '';

    if (provider === 'gemini') {
      geminiPanel.classList.remove('hidden');
    } else if (provider === 'edge_ai') {
      edgeAiPanel.classList.remove('hidden');
    } else if (provider === 'local_llm') {
      localLlmPanel.classList.remove('hidden');
    }
  }

  // Check Chrome Prompt API / window.ai / LanguageModel
  async function checkEdgeAiAvailability() {
    try {
      const api = (typeof LanguageModel !== 'undefined' ? LanguageModel : null) ||
                  (typeof window !== 'undefined' && window.LanguageModel ? window.LanguageModel : null) ||
                  (typeof window !== 'undefined' && window.ai?.languageModel ? window.ai.languageModel : null) ||
                  (typeof ai !== 'undefined' && ai?.languageModel ? ai.languageModel : null) ||
                  (typeof window !== 'undefined' && window.ai?.assistant ? window.ai.assistant : null);

      if (api) {
        if (typeof api.availability === 'function') {
          const capabilityOptions = {
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }]
          };
          let avail = await api.availability(capabilityOptions).catch(() => null);
          if (!avail) {
            avail = await api.availability().catch(() => 'available');
          }
          if (avail === 'readily' || avail === 'available') {
            edgeAiStatus.className = 'status-indicator ready';
            edgeAiStatus.textContent = '🟢 Prompt API (Gemini Nano) is downloaded and ready!';
            return;
          } else if (avail === 'downloading' || avail === 'downloadable' || avail === 'after-download') {
            edgeAiStatus.className = 'status-indicator not-ready';
            edgeAiStatus.textContent = '🟡 Gemini Nano is downloading in the background (~1.5 GB). Check chrome://on-device-internals';
            return;
          }
        }
        edgeAiStatus.className = 'status-indicator ready';
        edgeAiStatus.textContent = '🟢 Chrome Built-in AI Prompt API is available!';
      } else {
        edgeAiStatus.className = 'status-indicator not-ready';
        edgeAiStatus.innerHTML = '🟡 Prompt API requires 2 flags:<br>' +
          '1. <b>#optimization-guide-on-device-model</b> ➔ Enabled BypassPerfRequirement<br>' +
          '2. <b>#prompt-api-for-gemini-nano</b> ➔ Enabled<br>' +
          '3. Relaunch Chrome.';
      }
    } catch {
      edgeAiStatus.className = 'status-indicator not-ready';
      edgeAiStatus.textContent = 'Prompt API check unavailable.';
    }
  }
});
