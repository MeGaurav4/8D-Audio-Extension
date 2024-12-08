document.addEventListener('DOMContentLoaded', function() {
  const toggleButton = document.getElementById('toggle');
  const editControlsButton = document.getElementById('editControls');
  const controlsDiv = document.getElementById('controls');
  const intensitySlider = document.getElementById('intensity');
  const intensityValue = document.getElementById('intensityValue');
  const rotationSpeedSlider = document.getElementById('rotationSpeed');
  const rotationSpeedValue = document.getElementById('rotationSpeedValue');
  const resetButton = document.getElementById('resetControls');
  const infoIcon = document.getElementById('info-icon');
  const infoText = document.getElementById('info-text');

  const defaultIntensity = 1.5;
  const defaultRotationSpeed = 0.02;

  function updateButtonText(enabled) {
    toggleButton.textContent = enabled ? 'Disable 8D Audio' : 'Enable 8D Audio';
  }

  function updateControls(intensity, rotationSpeed) {
    intensitySlider.value = intensity;
    intensityValue.textContent = intensity;
    rotationSpeedSlider.value = rotationSpeed;
    rotationSpeedValue.textContent = rotationSpeed;
  }

  function saveSettings(intensity, rotationSpeed) {
    chrome.storage.sync.set({ intensity, rotationSpeed });
  }

  function resetControls() {
    updateControls(defaultIntensity, defaultRotationSpeed);
    saveSettings(defaultIntensity, defaultRotationSpeed);
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'setIntensity',
        value: defaultIntensity
      });
      chrome.tabs.sendMessage(tabs[0].id, {
        action: 'setRotationSpeed',
        value: defaultRotationSpeed
      });
    });
  }

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    const url = tabs[0].url;
    if (url && (url.includes('youtube.com') || url.includes('music.youtube.com'))) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'getState'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError);
          toggleButton.textContent = 'Error: Refresh the page';
          toggleButton.disabled = true;
        } else {
          updateButtonText(response.enabled);
          chrome.storage.sync.get(['intensity', 'rotationSpeed'], function(result) {
            const intensity = result.intensity || defaultIntensity;
            const rotationSpeed = result.rotationSpeed || defaultRotationSpeed;
            updateControls(intensity, rotationSpeed);
          });
        }
      });
    } else {
      toggleButton.textContent = 'Not available on this page';
      toggleButton.disabled = true;
      editControlsButton.style.display = 'none';
    }
  });

  toggleButton.addEventListener('click', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'toggle'}, function(response) {
        if (chrome.runtime.lastError) {
          console.error('Error:', chrome.runtime.lastError);
        } else {
          updateButtonText(response.enabled);
        }
      });
    });
  });

  editControlsButton.addEventListener('click', function() {
    controlsDiv.classList.toggle('visible');
  });

  intensitySlider.addEventListener('input', function() {
    const value = parseFloat(this.value);
    intensityValue.textContent = value;
    saveSettings(value, parseFloat(rotationSpeedSlider.value));
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'setIntensity', value: value});
    });
  });

  rotationSpeedSlider.addEventListener('input', function() {
    const value = parseFloat(this.value);
    rotationSpeedValue.textContent = value;
    saveSettings(parseFloat(intensitySlider.value), value);
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      chrome.tabs.sendMessage(tabs[0].id, {action: 'setRotationSpeed', value: value});
    });
  });

  resetButton.addEventListener('click', resetControls);

  infoIcon.addEventListener('click', function() {
    infoText.style.display = infoText.style.display === 'none' ? 'block' : 'none';
  });
});
