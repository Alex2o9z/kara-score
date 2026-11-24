/**
 * KaraScore Companion Chrome Extension - Content Script (MV3)
 * Injects "🎤 Hát chấm điểm" button on YouTube Watch and Search pages.
 */

(function () {
  'use strict';

  const DEFAULT_TARGET_URL = 'https://kara-score.pages.dev';
  let targetBaseUrl = DEFAULT_TARGET_URL;

  // 1. Synchronize target base URL from extension storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['targetBaseUrl'], (result) => {
      if (result && result.targetBaseUrl) {
        targetBaseUrl = result.targetBaseUrl;
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync' && changes.targetBaseUrl) {
        targetBaseUrl = changes.targetBaseUrl.newValue || DEFAULT_TARGET_URL;
      }
    });
  }

  const VIDEO_ID_REGEX = /^[a-zA-Z0-9_-]{11}$/;

  function extractVideoIdFromUrl(urlString) {
    if (!urlString) return null;
    try {
      const url = new URL(urlString, window.location.origin);
      const v = url.searchParams.get('v');
      if (v && VIDEO_ID_REGEX.test(v)) {
        return v;
      }
      // Check /shorts/<id>
      const matchShorts = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (matchShorts && matchShorts[1]) {
        return matchShorts[1];
      }
    } catch {
      // Fallback regex matching
      const match = urlString.match(/[?&]v=([a-zA-Z0-9_-]{11})/);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  function pauseYouTubePlayer() {
    try {
      const videoEl = document.querySelector('video');
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
      }
    } catch {
      // Safe fallback
    }
  }

  function launchKaraScore(videoId, title) {
    pauseYouTubePlayer();
    const cleanTitle = (title || '').replace(/ - YouTube$/, '').trim();
    const url = new URL(targetBaseUrl);
    url.searchParams.set('v', videoId);
    if (cleanTitle) {
      url.searchParams.set('title', cleanTitle);
    }
    window.open(url.toString(), '_blank');
  }

  // 2. Watch Page Injection (/watch?v=...)
  function injectWatchPageButton() {
    if (window.location.pathname !== '/watch') return;

    const videoId = extractVideoIdFromUrl(window.location.href);
    if (!videoId) return;

    // Check if button is already injected
    const existing = document.querySelector('.karascore-watch-btn[data-karascore-injected="true"]');
    if (existing) {
      // Update videoId in case of in-page SPA video switch
      existing.dataset.videoId = videoId;
      return;
    }

    // Target YouTube's primary action bar so it sits inline with Like/Share buttons
    const actionsContainer =
      document.querySelector('ytd-watch-metadata #actions-inner #top-level-buttons-computed') ||
      document.querySelector('ytd-watch-metadata #actions #top-level-buttons-computed') ||
      document.querySelector('#actions-inner #top-level-buttons-computed') ||
      document.querySelector('#actions #top-level-buttons-computed') ||
      document.querySelector('#top-level-buttons-computed') ||
      document.querySelector('ytd-watch-metadata #actions-inner ytd-menu-renderer') ||
      document.querySelector('ytd-watch-metadata #actions-inner') ||
      document.querySelector('ytd-watch-metadata #actions');

    if (!actionsContainer) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'karascore-watch-btn';
    btn.dataset.karascoreInjected = 'true';
    btn.dataset.videoId = videoId;
    btn.title = 'Mở bài hát này trên KaraScore để hát karaoke và chấm điểm trực tiếp';
    btn.innerHTML = `
      <svg viewBox="0 0 24 24">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
      </svg>
      <span>Hát chấm điểm</span>
    `;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const currentVideoId = btn.dataset.videoId || extractVideoIdFromUrl(window.location.href);
      if (!currentVideoId) return;

      const titleEl =
        document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
        document.querySelector('h1.title yt-formatted-string') ||
        document.querySelector('#title h1');
      const videoTitle = titleEl ? titleEl.textContent : document.title;

      launchKaraScore(currentVideoId, videoTitle);
    });

    // Insert inline directly inside the action bar
    if (actionsContainer.id === 'top-level-buttons-computed') {
      actionsContainer.insertBefore(btn, actionsContainer.firstChild);
    } else {
      actionsContainer.appendChild(btn);
    }
  }

  // 3. Search Results & Video Card Badge Injection
  function injectCardBadges() {
    const cardSelectors = [
      'ytd-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-rich-item-renderer',
    ];

    const cards = document.querySelectorAll(cardSelectors.join(','));
    cards.forEach((card) => {
      if (card.querySelector('.karascore-card-badge[data-karascore-injected="true"]')) {
        return;
      }

      // Find anchor to extract videoId
      const anchor =
        card.querySelector('a#thumbnail[href*="/watch?v="]') ||
        card.querySelector('a#video-title[href*="/watch?v="]') ||
        card.querySelector('a[href*="/watch?v="]');

      if (!anchor) return;

      const videoId = extractVideoIdFromUrl(anchor.getAttribute('href') || anchor.href);
      if (!videoId) return;

      // Find metadata container to append badge
      const metaContainer =
        card.querySelector('#metadata-line') ||
        card.querySelector('#channel-name') ||
        card.querySelector('.ytd-video-meta-block') ||
        card.querySelector('#title-wrapper') ||
        card.querySelector('#meta');

      if (!metaContainer) return;

      const badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'karascore-card-badge';
      badge.dataset.karascoreInjected = 'true';
      badge.title = 'Hát chấm điểm bài này trên KaraScore';
      badge.innerHTML = `
        <svg viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
          <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
        </svg>
        <span>Hát</span>
      `;

      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const titleEl = card.querySelector('#video-title');
        const cardTitle = titleEl ? titleEl.textContent || titleEl.getAttribute('title') : '';
        launchKaraScore(videoId, cardTitle);
      });

      metaContainer.appendChild(badge);
    });
  }

  // 4. Combined idempotent execution
  function runInjection() {
    injectWatchPageButton();
    injectCardBadges();
  }

  // Run on initial script execution
  runInjection();

  // Listen to YouTube SPA navigation finish event
  window.addEventListener('yt-navigate-finish', () => {
    // Small delay to allow YouTube Polymer DOM elements to settle
    setTimeout(runInjection, 150);
  });

  // Debounced MutationObserver for dynamic infinite-scroll loading on search/home
  let debounceTimeout = null;
  const observer = new MutationObserver(() => {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      runInjection();
    }, 250);
  });

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
      runInjection();
    });
  }
})();
