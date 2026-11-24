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

  // Load saved preference
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['targetBaseUrl'], (result) => {
      const activeUrl = result && result.targetBaseUrl ? result.targetBaseUrl : DEFAULT_TARGET;
      setSelectedCard(activeUrl);
    });
  } else {
    setSelectedCard(DEFAULT_TARGET);
  }

  // Event handlers
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
          if (customInput.value.trim()) {
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

  if (customInput) {
    customInput.addEventListener('change', () => {
      const val = customInput.value.trim();
      if (val) {
        saveTargetUrl(val);
      }
    });

    customInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const val = customInput.value.trim();
        if (val) {
          saveTargetUrl(val);
        }
      }
    });
  }
})();
