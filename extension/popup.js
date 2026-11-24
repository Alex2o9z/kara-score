/**
 * KaraScore Companion Chrome Extension - Popup Controller (MV3)
 */

(function () {
  'use strict';

  const DEFAULT_TARGET = 'https://kara-score.pages.dev';
  const PRESET_URLS = [
    'https://kara-score.pages.dev',
    'https://dev.kara-score.pages.dev',
    'http://localhost:5174',
  ];

  const radioCards = document.querySelectorAll('.radio-card');
  const customInput = document.getElementById('customUrlInput');
  const debugLogToggle = document.getElementById('debugLogToggle');
  const statusMsg = document.getElementById('statusMsg');

  let statusTimeout = null;

  function showStatus(text) {
    if (!statusMsg) return;
    statusMsg.textContent = text || '✓ Đã lưu cài đặt';
    statusMsg.classList.add('visible');
    if (statusTimeout) clearTimeout(statusTimeout);
    statusTimeout = setTimeout(() => {
      statusMsg.classList.remove('visible');
    }, 1500);
  }

  function saveTargetUrl(url) {
    if (!url) return;
    try {
      // Validate URL syntax
      new URL(url);
    } catch {
      showStatus('⚠️ URL không hợp lệ');
      return;
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ targetBaseUrl: url }, () => {
        showStatus('✓ Đã lưu cài đặt');
      });
    } else {
      showStatus('✓ Đã lưu (cục bộ)');
    }
  }

  function saveDebugLog(enabled) {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set({ debugLog: enabled }, () => {
        showStatus(enabled ? '✓ Đã bật Debug Log' : '✓ Đã tắt Debug Log');
      });
    } else {
      showStatus('✓ Đã lưu (cục bộ)');
    }
  }

  function setSelectedCard(targetUrl) {
    const isPreset = PRESET_URLS.includes(targetUrl);

    radioCards.forEach((card) => {
      const radio = card.querySelector('input[type="radio"]');
      const cardUrl = card.dataset.url;

      if (isPreset && cardUrl === targetUrl) {
        radio.checked = true;
        card.classList.add('active');
      } else if (!isPreset && cardUrl === 'custom') {
        radio.checked = true;
        card.classList.add('active');
        if (customInput) {
          customInput.style.display = 'block';
          customInput.value = targetUrl;
        }
      } else {
        radio.checked = false;
        card.classList.remove('active');
      }
    });

    if (isPreset && customInput) {
      customInput.style.display = 'none';
    }
  }

  // Load saved preferences
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['targetBaseUrl', 'debugLog'], (result) => {
      const activeUrl = result && result.targetBaseUrl ? result.targetBaseUrl : DEFAULT_TARGET;
      setSelectedCard(activeUrl);
      if (debugLogToggle && result && typeof result.debugLog === 'boolean') {
        debugLogToggle.checked = result.debugLog;
      }
    });
  } else {
    setSelectedCard(DEFAULT_TARGET);
  }

  // Event handlers for target URL cards
  radioCards.forEach((card) => {
    card.addEventListener('click', (e) => {
      const cardUrl = card.dataset.url;
      const radio = card.querySelector('input[type="radio"]');

      if (e.target !== customInput) {
        radio.checked = true;
      }

      radioCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');

      if (cardUrl === 'custom') {
        if (customInput) {
          customInput.style.display = 'block';
          customInput.focus();
          if (customInput.value) {
            saveTargetUrl(customInput.value.trim());
          }
        }
      } else {
        if (customInput) {
          customInput.style.display = 'none';
        }
        saveTargetUrl(cardUrl);
      }
    });
  });

  // Debounced input handler for custom URL
  let customInputTimeout = null;
  if (customInput) {
    customInput.addEventListener('input', (e) => {
      const val = e.target.value.trim();
      if (customInputTimeout) clearTimeout(customInputTimeout);
      customInputTimeout = setTimeout(() => {
        saveTargetUrl(val);
      }, 500);
    });
  }

  // Toggle handler for debug log
  if (debugLogToggle) {
    debugLogToggle.addEventListener('change', () => {
      saveDebugLog(debugLogToggle.checked);
    });
  }
})();
