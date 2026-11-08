document.addEventListener('DOMContentLoaded', () => {
  const toggleButton = document.getElementById('toggle');
  const editControlsButton = document.getElementById('editControls');
  const controlsDiv = document.getElementById('controls');
  const intensitySlider = document.getElementById('intensity');
  const intensityValue = document.getElementById('intensityValue');
  const rotationSpeedSlider = document.getElementById('rotationSpeed');
  const rotationSpeedValue = document.getElementById('rotationSpeedValue');
  const lapValue = document.getElementById('lapValue');
  const resetButton = document.getElementById('resetControls');

  const DEFAULT_INTENSITY = 1.5;
  const DEFAULT_SPEED = 0.02;
  const isYouTube = (url) => !!url && /^https:\/\/([a-z0-9-]+\.)*youtube\.com\//.test(url);
  const lapSeconds = (speed) => (2 * Math.PI * 0.016) / speed;

  let tabId = null;

  function updateButtonText(enabled) {
    toggleButton.textContent = enabled ? 'Disable 8D Audio' : 'Enable 8D Audio';
    toggleButton.classList.toggle('on', !!enabled);
  }

  function updateControls(intensity, speed) {
    intensitySlider.value = intensity;
    intensityValue.textContent = intensity;
    rotationSpeedSlider.value = speed;
    rotationSpeedValue.textContent = speed;
    lapValue.textContent = lapSeconds(speed).toFixed(1) + 's per lap';
  }

  function send(message) {
    return new Promise((resolve) => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) resolve(null);
        else resolve(response);
      });
    });
  }

  // If the page was open before the extension loaded, inject the scripts and try again
  // instead of asking the user to refresh.
  async function getStateOrInject() {
    let state = await send({ action: 'getState' });
    if (state) return state;
    try {
      await chrome.scripting.executeScript({ target: { tabId }, files: ['engine.js', 'content.js'] });
      state = await send({ action: 'getState' });
    } catch (e) {
      state = null;
    }
    return state;
  }

  chrome.tabs.query({ active: true, currentWindow: true }, async (tabs) => {
    const tab = tabs[0];
    if (!tab || !isYouTube(tab.url)) {
      toggleButton.textContent = 'Not available on this page';
      toggleButton.disabled = true;
      editControlsButton.style.display = 'none';
      return;
    }
    tabId = tab.id;
    const state = await getStateOrInject();
    if (!state) {
      toggleButton.textContent = 'Error: Refresh the page';
      toggleButton.disabled = true;
      return;
    }
    updateButtonText(state.enabled);
    updateControls(state.intensity || DEFAULT_INTENSITY, state.rotationSpeed || DEFAULT_SPEED);
  });

  toggleButton.addEventListener('click', async () => {
    const response = await send({ action: 'toggle' });
    if (response) updateButtonText(response.enabled);
  });

  editControlsButton.addEventListener('click', () => {
    controlsDiv.classList.toggle('visible');
  });

  intensitySlider.addEventListener('input', function () {
    const value = parseFloat(this.value);
    intensityValue.textContent = value;
    send({ action: 'setIntensity', value });
  });

  rotationSpeedSlider.addEventListener('input', function () {
    const value = parseFloat(this.value);
    updateControls(parseFloat(intensitySlider.value), value);
    send({ action: 'setRotationSpeed', value });
  });

  resetButton.addEventListener('click', () => {
    updateControls(DEFAULT_INTENSITY, DEFAULT_SPEED);
    send({ action: 'setIntensity', value: DEFAULT_INTENSITY });
    send({ action: 'setRotationSpeed', value: DEFAULT_SPEED });
  });
});
