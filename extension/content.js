/**
 * KaraScore Companion Chrome Extension - Content Script (MV3)
 * Injects native-styled "🎤 Hát chấm điểm" button on YouTube Watch and Search pages.
 */

(function () {
  'use strict';

  const DEFAULT_TARGET_URL = 'https://kara-score.pages.dev';
  let targetBaseUrl = DEFAULT_TARGET_URL;
  let isDebugLog = false;
  let activeResizeObserver = null;

  function log(...args) {
    if (isDebugLog) {
      console.log('[KaraScore]', ...args);
    }
  }

  // 1. Synchronize target base URL and debugLog from extension storage
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.get(['targetBaseUrl', 'debugLog'], (result) => {
      if (result) {
        if (result.targetBaseUrl) targetBaseUrl = result.targetBaseUrl;
        if (typeof result.debugLog === 'boolean') isDebugLog = result.debugLog;
        log('Initialized settings from storage:', { targetBaseUrl, isDebugLog });
      }
    });

    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === 'sync') {
        if (changes.targetBaseUrl) {
          targetBaseUrl = changes.targetBaseUrl.newValue || DEFAULT_TARGET_URL;
          log('Updated targetBaseUrl:', targetBaseUrl);
        }
        if (changes.debugLog) {
          isDebugLog = Boolean(changes.debugLog.newValue);
          log('Updated debugLog:', isDebugLog);
        }
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
        log('Paused active YouTube player element');
      }
    } catch (err) {
      log('Could not pause player:', err);
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
    log('Launching KaraScore URL:', url.toString());
    window.open(url.toString(), '_blank');
  }

  function cleanupResizeObserver() {
    if (activeResizeObserver) {
      activeResizeObserver.disconnect();
      activeResizeObserver = null;
    }
  }

  function syncButtonGeometry(btn, refBtn) {
    if (!refBtn) return;
    try {
      const cs = window.getComputedStyle(refBtn);
      const parsedH = parseFloat(cs.height);
      if (!isNaN(parsedH) && parsedH > 0) {
        btn.style.setProperty('height', `${parsedH}px`, 'important');
        btn.style.setProperty('border-radius', `${parsedH / 2}px`, 'important');
        if (cs.paddingLeft && cs.paddingRight) {
          btn.style.setProperty('padding', `0 ${cs.paddingRight} 0 ${cs.paddingLeft}`, 'important');
        }
        if (cs.fontSize) {
          btn.style.setProperty('font-size', cs.fontSize, 'important');
        }
        if (cs.fontWeight) {
          btn.style.setProperty('font-weight', cs.fontWeight, 'important');
        }
      }
    } catch (err) {
      log('Could not sync button geometry:', err);
    }
  }

  function getVisibleActionsContainer() {
    const selectors = [
      'ytd-watch-metadata #actions #top-level-buttons-computed',
      'ytd-watch-metadata #actions-inner #top-level-buttons-computed',
      'ytd-watch-metadata #top-level-buttons-computed',
      '#actions #top-level-buttons-computed',
      '#actions-inner #top-level-buttons-computed',
      '#top-level-buttons-computed'
    ];
    const candidates = document.querySelectorAll(selectors.join(','));

    // 1. Prioritize element that is actually rendered and visible in viewport
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el && (el.offsetParent !== null || el.getBoundingClientRect().height > 0)) {
        return el;
      }
    }

    // 2. Fallback: pick candidate inside active ytd-watch-metadata if early in DOM lifecycle
    for (let i = 0; i < candidates.length; i++) {
      const el = candidates[i];
      if (el.closest('ytd-watch-metadata:not([hidden])')) {
        return el;
      }
    }

    return candidates.length > 0 ? candidates[0] : null;
  }

  // 2. Watch Page Injection (/watch?v=...)
  function injectWatchPageButton() {
    if (window.location.pathname !== '/watch') return;

    const videoId = extractVideoIdFromUrl(window.location.href);
    if (!videoId) return;

    // Check if visible button is already injected (idempotent across SPA updates)
    const existingBtn = document.querySelector('.karascore-watch-btn[data-karascore-injected="true"]');
    if (existingBtn) {
      const isVisible =
        existingBtn.isConnected &&
        (existingBtn.offsetParent !== null || existingBtn.getBoundingClientRect().height > 0);
      if (isVisible) {
        if (existingBtn.dataset.videoId !== videoId) {
          existingBtn.dataset.videoId = videoId;
          log('Updated existing watch button videoId to:', videoId);
        }
        return;
      }
      // If detached or injected into a hidden legacy container, remove it so we re-inject in visible container
      existingBtn.remove();
      cleanupResizeObserver();
    }

    // 1. Select the Visible Action Container Only
    const actionsContainer = getVisibleActionsContainer();

    let targetParent = null;
    let referenceNode = null;
    let isFallback = false;

    if (actionsContainer) {
      targetParent = actionsContainer;
      // Tier 1: Look for segmented like/dislike cluster
      const voteCluster = actionsContainer.querySelector('segmented-like-dislike-button-view-model');
      if (voteCluster && voteCluster.parentNode === actionsContainer) {
        referenceNode = voteCluster.nextSibling;
      } else {
        // Tier 2: Look for first yt-button-view-model or first child
        const firstBtnViewModel = actionsContainer.querySelector('yt-button-view-model');
        if (firstBtnViewModel && firstBtnViewModel.parentNode === actionsContainer) {
          referenceNode = firstBtnViewModel;
        } else {
          referenceNode = actionsContainer.firstElementChild;
        }
      }
    } else {
      // Tier 3: Graceful Title Fallback (directly below ytd-watch-metadata #title)
      const titleContainer =
        document.querySelector('ytd-watch-metadata #title') ||
        document.querySelector('h1.ytd-watch-metadata') ||
        document.querySelector('#title');

      if (titleContainer && titleContainer.parentNode) {
        targetParent = titleContainer.parentNode;
        referenceNode = titleContainer.nextSibling;
        isFallback = true;
      }
    }

    if (!targetParent) {
      log('Watch page anchor target not found yet');
      return;
    }

    // Determine horizontal spacing based on parent flex gap
    let parentGap = 0;
    try {
      const parentStyle = window.getComputedStyle(targetParent);
      parentGap = parseFloat(parentStyle.gap || parentStyle.columnGap || '0') || 0;
    } catch {
      parentGap = 0;
    }

    const marginStyle = parentGap >= 6 ? '0px' : '0 8px';

    // Build the watch button directly (NO wrapper div to avoid Polymer shadow-DOM stripping)
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className =
      'karascore-watch-btn ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextMono ytSpecButtonShapeNextSizeM';
    btn.dataset.karascoreInjected = 'true';
    btn.dataset.videoId = videoId;
    if (isFallback) {
      btn.dataset.karascoreFallback = 'title';
    }
    btn.title = 'Mở bài hát này trên KaraScore để hát karaoke và chấm điểm trực tiếp';

    // Apply verified YouTube default geometry immediately
    btn.style.setProperty('height', '40px');
    btn.style.setProperty('border-radius', '20px');
    btn.style.setProperty('padding', '0 16px');
    btn.style.setProperty('font-size', '14px');
    btn.style.setProperty('font-weight', '500');
    btn.style.setProperty('line-height', '1');
    btn.style.setProperty('margin', marginStyle, 'important');

    btn.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
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
        document.querySelector('#title h1') ||
        document.querySelector('#title yt-formatted-string');
      const videoTitle = titleEl ? titleEl.textContent : document.title;

      launchKaraScore(currentVideoId, videoTitle);
    });

    // Insert directly into target parent
    if (referenceNode) {
      targetParent.insertBefore(btn, referenceNode);
      log('Inserted watch button before reference node in visible container');
    } else {
      targetParent.appendChild(btn);
      log('Appended watch button to visible container');
    }

    // Dynamic geometry sync with live native button
    const refBtn = targetParent.querySelector(
      'segmented-like-dislike-button-view-model button, yt-button-view-model button, button:not(.karascore-watch-btn)'
    );

    if (refBtn) {
      syncButtonGeometry(btn, refBtn);
      if (typeof ResizeObserver !== 'undefined') {
        cleanupResizeObserver();
        activeResizeObserver = new ResizeObserver(() => {
          syncButtonGeometry(btn, refBtn);
        });
        activeResizeObserver.observe(refBtn);
      }
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
    let badgeCount = 0;

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
        <svg viewBox="0 0 24 24" aria-hidden="true">
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
      badgeCount++;
    });

    if (badgeCount > 0) {
      log(`Injected ${badgeCount} card badges`);
    }
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
    log('YouTube SPA navigation finished:', window.location.href);
    cleanupResizeObserver();
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
