let audioContext;
let sourceNode;
let pannerNode;
let isEnabled = false;
let angle = 0;
let intensity = 1.5;
let rotationSpeed = 0.02;
let intervalId;

chrome.storage.sync.get(['intensity', 'rotationSpeed'], function(result) {
  intensity = result.intensity || 1.5;
  rotationSpeed = result.rotationSpeed || 0.02;
});

function initializeAudioNodes() {
  if (audioContext) return true;

  console.log('Initializing audio nodes');
  let audioElement = document.querySelector('audio, video');

  if (!audioElement) {
    console.error('No audio or video element found on the page');
    return false;
  }

  audioContext = new (window.AudioContext || window.webkitAudioContext)();
  sourceNode = audioContext.createMediaElementSource(audioElement);
  pannerNode = audioContext.createPanner();
  
  pannerNode.panningModel = 'HRTF';
  pannerNode.distanceModel = 'inverse';
  pannerNode.refDistance = 1;
  pannerNode.maxDistance = 10000;
  pannerNode.rolloffFactor = 1;
  pannerNode.coneInnerAngle = 360;
  pannerNode.coneOuterAngle = 0;
  pannerNode.coneOuterGain = 0;
  
  sourceNode.connect(pannerNode);
  pannerNode.connect(audioContext.destination);

  console.log('Audio nodes initialized');
  return true;
}

function enable8DAudio() {
  console.log('Enabling 8D Audio');
  if (!audioContext || !sourceNode || !pannerNode) {
    if (!initializeAudioNodes()) {
      console.error('Failed to initialize audio nodes');
      return false;
    }
  }

  audioContext.resume();
  isEnabled = true;
  angle = 0;
  if (intervalId) {
    clearInterval(intervalId);
  }
  intervalId = setInterval(applyEffect, 16);
  console.log('8D Audio enabled');
  return true;
}

function disable8DAudio() {
  console.log('Disabling 8D Audio');
  if (audioContext) {
    clearInterval(intervalId);
    intervalId = null;
    if (pannerNode) {
      pannerNode.positionX.setValueAtTime(0, audioContext.currentTime);
      pannerNode.positionZ.setValueAtTime(0, audioContext.currentTime);
    }
    isEnabled = false;
    console.log('8D Audio disabled');
  }
}

function applyEffect() {
  if (isEnabled && pannerNode) {
    angle += rotationSpeed;
    if (angle > Math.PI * 2) {
      angle = 0;
    }
    
    const x = Math.cos(angle) * intensity;
    const z = Math.sin(angle) * intensity;
    
    pannerNode.positionX.setValueAtTime(x, audioContext.currentTime);
    pannerNode.positionZ.setValueAtTime(z, audioContext.currentTime);
  }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  console.log('Message received:', request);
  if (request.action === 'toggle') {
    const newState = isEnabled ? disable8DAudio() : enable8DAudio();
    sendResponse({enabled: newState});
  } else if (request.action === 'getState') {
    sendResponse({enabled: isEnabled, intensity: intensity, rotationSpeed: rotationSpeed});
  } else if (request.action === 'setIntensity') {
    intensity = request.value;
    chrome.storage.sync.set({ intensity: request.value });
  } else if (request.action === 'getIntensity') {
    sendResponse({intensity: intensity});
  } else if (request.action === 'setRotationSpeed') {
    rotationSpeed = request.value;
    chrome.storage.sync.set({ rotationSpeed: request.value });
  }
  return true;
});

console.log('Content script loaded');

logAudioState();

