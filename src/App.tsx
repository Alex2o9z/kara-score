import React, { useCallback, useEffect, useRef, useState } from 'react';
import { DebugHUD } from './components/DebugHUD';
import { LatencyControl } from './components/LatencyControl';
import { PitchTrack } from './components/PitchTrack';
import { ResultModal } from './components/ResultModal';
import { YouTubePlayer } from './components/YouTubePlayer';
import { useKaraokeSession } from './hooks/useKaraokeSession';
import {
  type JudgeMode,
  type KaraScoreSettings,
  loadPartySettings,
  savePartySettings,
} from './services/partySettings';
import {
  fetchSongCatalog,
  findSongInCatalog,
  loadSongChart,
  parseCustomSongJson,
  parseLaunchParams,
  type SongCatalogEntry,
} from './services/songCatalog';
import { extractYouTubeVideoId } from './services/youtubeUrlParser';

export function App() {
  const {
    playerState,
    mode,
    activeSong,
    micStatus,
    micError,
    micInterrupted,
    ytError,
    pitch,
    score,
    rawVideoTimeSec,
    sampleRate,
    interpolatedTimeMs,
    latencyOffsetMs,
    attachPlayerContainer,
    loadVideo,
    startMic,
    stopMic,
    resetScore,
    setLatencyOffsetMs,
    play,
    seekTo,
  } = useKaraokeSession();

  const [catalog, setCatalog] = useState<SongCatalogEntry[]>([]);
  const [customInput, setCustomInput] = useState<string>('');
  const [customSongTitle, setCustomSongTitle] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [isLoadingSong, setIsLoadingSong] = useState<boolean>(false);
  const [isResultModalOpen, setIsResultModalOpen] = useState<boolean>(false);
  const autoResultShownRef = useRef<boolean>(false);
  const hasEverPlayedRef = useRef<boolean>(false);

  // Party & App Settings
  const [settings, setSettings] = useState<KaraScoreSettings>(() => loadPartySettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [showBookmarkletHint, setShowBookmarkletHint] = useState<boolean>(false);
  const [isCopiedExtensions, setIsCopiedExtensions] = useState<boolean>(false);

  // UX state flags
  const [isSongDrawerOpen, setIsSongDrawerOpen] = useState<boolean>(false);
  const [isLatencyOpen, setIsLatencyOpen] = useState<boolean>(false);
  const [showPitchTrack, setShowPitchTrack] = useState<boolean>(false);
  const [showLiveScoreHud, setShowLiveScoreHud] = useState<boolean>(false);
  const [userMicOverride, setUserMicOverride] = useState<boolean>(false);
  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState<boolean>(false);

  const handleUpdateSettings = (updater: Partial<KaraScoreSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...updater };
      savePartySettings(updated);
      return updated;
    });
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isControlsDimmed, setIsControlsDimmed] = useState<boolean>(false);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync fullscreen state
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  // Auto-dim controls in fullscreen after 3s of mouse/keyboard inactivity during playback
  useEffect(() => {
    if (!isFullscreen || playerState !== 'PLAYING') {
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
      return;
    }

    idleTimerRef.current = setTimeout(() => {
      setIsControlsDimmed(true);
    }, 3000);

    const handleActivity = () => {
      setIsControlsDimmed(false);
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(() => {
        setIsControlsDimmed(true);
      }, 3000);
    };

    window.addEventListener('mousemove', handleActivity);
    window.addEventListener('keydown', handleActivity);

    return () => {
      window.removeEventListener('mousemove', handleActivity);
      window.removeEventListener('keydown', handleActivity);
      if (idleTimerRef.current !== null) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }
    };
  }, [isFullscreen, playerState]);

  // Auto-open ResultModal once when video finishes after active singing
  useEffect(() => {
    if (playerState === 'PLAYING') {
      hasEverPlayedRef.current = true;
    } else if (playerState === 'ENDED') {
      if (hasEverPlayedRef.current && !autoResultShownRef.current) {
        autoResultShownRef.current = true;
        setIsResultModalOpen(true);
      }
    }
  }, [playerState]);

  const isAnyOverlayOpen = isToolsMenuOpen || isLatencyOpen || isResultModalOpen;
  const isEffectiveDimmed = isFullscreen && playerState === 'PLAYING' && isControlsDimmed && !isAnyOverlayOpen;

  const isDebugUrl =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('debug') === '1';
  const shouldShowDebugHud = Boolean(isDebugUrl || settings.showDebugHud);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        if (stageRef.current?.requestFullscreen) {
          await stageRef.current.requestFullscreen();
        }
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen();
        }
      }
    } catch (err) {
      console.warn('Lỗi bật/tắt toàn màn hình:', err);
    }
  };

  const handleToggleMic = useCallback(async () => {
    if (micStatus === 'running' || micStatus === 'starting') {
      setUserMicOverride(true);
      stopMic();
    } else {
      setUserMicOverride(false);
      await startMic();
    }
  }, [micStatus, startMic, stopMic]);

  const getMicStatusText = () => {
    if (userMicOverride) {
      return '🔇 Mic: Đã tắt';
    }
    if (micStatus === 'running') {
      return '🎙️ Mic: Tự động (Đang thu)';
    }
    if (micStatus === 'starting') {
      return '🎙️ Mic: Đang kết nối...';
    }
    if (micStatus === 'denied' || micStatus === 'error') {
      return '⚠️ Mic: Bị chặn';
    }
    return '🎙️ Mic: Chờ nhạc phát';
  };

  // Keyboard shortcut M to toggle microphone (ignoring input/textarea focus)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        const target = e.target as HTMLElement | null;
        const tagName = target?.tagName;
        if (tagName === 'INPUT' || tagName === 'TEXTAREA' || target?.isContentEditable) {
          return;
        }
        e.preventDefault();
        void handleToggleMic();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleToggleMic]);

  // Restore hardware latency calibration from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('karascore_latency_offset_ms');
      if (saved !== null) {
        const parsed = parseInt(saved, 10);
        if (!Number.isNaN(parsed) && parsed >= -300 && parsed <= 300) {
          setLatencyOffsetMs(parsed);
        }
      }
    } catch {
      // Safe fallback
    }
  }, [setLatencyOffsetMs]);

  // Load song catalog and handle URL query parameters (?v=&title=) on mount
  useEffect(() => {
    let isMounted = true;

    const initCatalogAndRouting = async () => {
      try {
        const catalogData = await fetchSongCatalog();
        if (!isMounted) return;
        setCatalog(catalogData);

        // Read launch params from URL query
        const { videoId, title } = parseLaunchParams(window.location.search);
        if (title) {
          setCustomSongTitle(title);
        }

        if (videoId) {
          setCustomInput(videoId);
          const matchedEntry = findSongInCatalog(catalogData, videoId);
          if (matchedEntry) {
            // Tier 1 Exact Melody (catalog hit)
            const chart = await loadSongChart(matchedEntry);
            if (isMounted) {
              loadVideo(matchedEntry.youtubeVideoId, chart);
              setCustomSongTitle(matchedEntry.title);
            }
          } else {
            // Tier 2 Vocal Performance fallback (catalog miss)
            if (isMounted) {
              loadVideo(videoId, null);
            }
          }
        }
      } catch (err) {
        if (isMounted) {
          console.error('Lỗi khởi tạo thư viện bài hát:', err);
        }
      }
    };

    void initCatalogAndRouting();

    return () => {
      isMounted = false;
    };
  }, [loadVideo]);

  // Auto-Mic Sync with YouTube Playback (starts on PLAYING, pauses on PAUSED/ENDED unless overridden)
  useEffect(() => {
    if (userMicOverride) {
      return;
    }

    if (playerState === 'PLAYING') {
      if (micStatus === 'idle') {
        void startMic();
      }
    } else if (playerState === 'PAUSED' || playerState === 'ENDED') {
      if (micStatus === 'running' || micStatus === 'starting') {
        stopMic();
      }
    }
  }, [playerState, userMicOverride, micStatus, startMic, stopMic]);

  // 1-tap clipboard paste helper
  const handlePasteClipboard = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const text = await navigator.clipboard.readText();
        const trimmed = text.trim();
        const videoId = extractYouTubeVideoId(trimmed);
        if (videoId) {
          setCustomInput(videoId);
          setInputError(null);
          const matched = findSongInCatalog(catalog, videoId);
          if (matched) {
            const chart = await loadSongChart(matched);
            loadVideo(matched.youtubeVideoId, chart);
            setCustomSongTitle(matched.title);
          } else {
            loadVideo(videoId, null);
            setCustomSongTitle(null);
          }
          setIsSongDrawerOpen(false);
          return;
        }
      }
      setIsSongDrawerOpen(true);
    } catch {
      setIsSongDrawerOpen(true);
    }
  };





  const handleSelectCatalogSong = async (entry: SongCatalogEntry) => {
    try {
      autoResultShownRef.current = false;
      hasEverPlayedRef.current = false;
      setIsResultModalOpen(false);
      setUserMicOverride(false);
      setIsLoadingSong(true);
      setInputError(null);
      const songData = await loadSongChart(entry);
      loadVideo(entry.youtubeVideoId, songData);
      setCustomInput(entry.youtubeVideoId);
      setCustomSongTitle(entry.title);
      setIsSongDrawerOpen(false); // auto collapse drawer to focus on stage
    } catch (err) {
      setInputError(`Không tải được bài hát "${entry.title}": ${(err as Error).message}`);
    } finally {
      setIsLoadingSong(false);
    }
  };

  const handleLoadCustomUrl = (e?: React.FormEvent) => {
    e?.preventDefault();
    const videoId = extractYouTubeVideoId(customInput);
    if (!videoId) {
      setInputError('Vui lòng nhập URL hoặc ID video YouTube hợp lệ (11 ký tự).');
      return;
    }
    setInputError(null);
    autoResultShownRef.current = false;
    hasEverPlayedRef.current = false;
    setIsResultModalOpen(false);
    setUserMicOverride(false);

    const matched = findSongInCatalog(catalog, videoId);
    if (matched) {
      void handleSelectCatalogSong(matched);
    } else {
      setCustomSongTitle(null);
      loadVideo(videoId, null);
      setIsSongDrawerOpen(false);
    }
  };

  const handleImportChart = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const rawJson = event.target?.result as string;
        const imported = parseCustomSongJson(rawJson);
        autoResultShownRef.current = false;
        hasEverPlayedRef.current = false;
        setIsResultModalOpen(false);
        setUserMicOverride(false);
        loadVideo(imported.youtubeVideoId, imported);
        setCustomInput(imported.youtubeVideoId);
        setCustomSongTitle(imported.title);
        setInputError(null);
        setIsSongDrawerOpen(false);
      } catch (err) {
        setInputError(`Lỗi file phổ nốt: ${(err as Error).message}`);
      }
    };
    reader.onerror = () => {
      setInputError('Không thể đọc file JSON đã chọn.');
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleReplay = () => {
    autoResultShownRef.current = false;
    hasEverPlayedRef.current = false;
    setIsResultModalOpen(false);
    setUserMicOverride(false);
    resetScore();
    seekTo(0);
    play();
  };

  const handleCloseResult = () => {
    setIsResultModalOpen(false);
  };

  const getRatingColor = (rating: string) => {
    switch (rating) {
      case 'S':
        return 'text-amber-400 border-amber-500 bg-amber-950/50 shadow-[0_0_10px_rgba(251,191,36,0.2)]';
      case 'A':
        return 'text-emerald-400 border-emerald-500 bg-emerald-950/50';
      case 'B':
        return 'text-blue-400 border-blue-500 bg-blue-950/50';
      default:
        return 'text-zinc-400 border-zinc-700 bg-zinc-900/50';
    }
  };

  const activeDisplayTitle = activeSong?.title || customSongTitle || (customInput ? `Video: ${customInput}` : 'Chưa chọn bài');

  return (
    <div className="min-h-dvh min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-2 sm:p-4 lg:p-2 lg:h-dvh lg:overflow-hidden font-sans overflow-x-hidden selection:bg-emerald-500 selection:text-white">
      <div className="max-w-6xl w-full flex-1 flex flex-col items-center min-h-0 space-y-2 lg:space-y-1">
        {/* Compact 40px Stage-First Header */}
        <header className="w-full h-10 flex items-center justify-between gap-2 border-b border-zinc-800 pb-1 shrink-0">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <h1 className="text-xl sm:text-2xl font-black tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent shrink-0">
              KaraScore
            </h1>

            {/* Active song pill in header (click opens drawer) */}
            <button
              type="button"
              onClick={() => setIsSongDrawerOpen((prev) => !prev)}
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-900 hover:bg-zinc-800 text-zinc-300 text-xs border border-zinc-700/80 transition-colors cursor-pointer truncate max-w-xs"
              title="Nhấp để đổi bài hát"
            >
              <span className="truncate font-medium">{activeDisplayTitle}</span>
              <span className="text-[10px] text-zinc-500 shrink-0">▼</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Mobile-only 1-tap Clipboard Paste & Search Shortcuts */}
            <button
              type="button"
              onClick={() => void handlePasteClipboard()}
              className="sm:hidden px-2 py-1 rounded-lg text-xs font-semibold border bg-zinc-900 hover:bg-zinc-800 text-cyan-300 border-zinc-700 transition-all cursor-pointer flex items-center gap-1 h-8"
              title="Dán link bài hát YouTube từ bộ nhớ tạm"
            >
              <span>📋</span>
              <span className="text-[11px]">Dán link</span>
            </button>
            <a
              href="https://www.youtube.com/results?search_query=karaoke"
              target="_blank"
              rel="noopener noreferrer"
              className="sm:hidden px-2 py-1 rounded-lg text-xs font-semibold border bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700 transition-all flex items-center gap-1 h-8"
              title="Tìm kiếm karaoke trên YouTube"
            >
              <span>🔍</span>
            </a>

            {/* Song library drawer toggle */}
            <button
              type="button"
              onClick={() => setIsSongDrawerOpen((prev) => !prev)}
              className={`px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 h-8 ${
                isSongDrawerOpen
                  ? 'bg-zinc-800 text-white border-zinc-600'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700'
              }`}
            >
              <span>📚 Chọn bài</span>
              <span className="text-[10px] text-zinc-400">{isSongDrawerOpen ? '▲' : '▼'}</span>
            </button>

            {/* Settings button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-2.5 sm:px-3 py-1 rounded-lg text-xs font-semibold border bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700 transition-all cursor-pointer flex items-center gap-1.5 h-8"
              title="Cài đặt Party & Chế độ Giám khảo"
            >
              <span>⚙️</span>
              <span className="hidden sm:inline">Cài đặt</span>
            </button>

            {/* Single KaraScore Fullscreen toggle */}
            <button
              type="button"
              onClick={() => void handleToggleFullscreen()}
              className="px-2.5 sm:px-3.5 py-1 rounded-xl text-xs font-bold border bg-gradient-to-r from-emerald-600/30 to-teal-600/30 hover:from-emerald-600/50 hover:to-teal-600/50 text-emerald-300 border-emerald-500/40 transition-all cursor-pointer flex items-center gap-1.5 h-8 shadow-sm active:scale-95"
              title="Bật chế độ Hát Toàn Màn Hình KaraScore"
            >
              <span>{isFullscreen ? '⛷' : '⛶'}</span>
              <span className="hidden sm:inline">{isFullscreen ? 'Thu nhỏ' : 'Hát Toàn Màn Hình'}</span>
            </button>
          </div>
        </header>

        {/* Collapsible Song Library & Search Drawer */}
        {isSongDrawerOpen && (
          <div className="p-4 rounded-2xl bg-zinc-900/95 border border-zinc-700 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
                🎵 Chọn bài hát hoặc dán link YouTube
              </span>
              <button
                type="button"
                onClick={() => setIsSongDrawerOpen(false)}
                className="text-zinc-400 hover:text-zinc-200 text-xs px-2 py-1 rounded bg-zinc-800 cursor-pointer"
              >
                Đóng ✕
              </button>
            </div>

            {/* Cached Tier 1 Song Charts */}
            <div className="space-y-2">
              <span className="text-[11px] text-zinc-400 font-semibold block">
                Thư viện mẫu có sẵn (Tier 1: Exact Melody):
              </span>
              <div className="flex flex-wrap gap-2">
                {catalog.map((entry) => {
                  const isActive = activeSong?.songId === entry.songId;
                  return (
                    <button
                      key={entry.songId}
                      type="button"
                      onClick={() => void handleSelectCatalogSong(entry)}
                      disabled={isLoadingSong}
                      className={`px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer flex items-center gap-1.5 border min-h-[40px] ${
                        isActive
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-md shadow-indigo-950'
                          : 'bg-zinc-950 hover:bg-zinc-800 border-zinc-800 text-zinc-300'
                      }`}
                    >
                      <span>🎵 {entry.title}</span>
                      <span className="text-[10px] text-zinc-400">({entry.artist})</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom YouTube URL/ID Input */}
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <span className="text-[11px] text-zinc-400 font-semibold block">
                Hoặc dán bất kỳ bài hát karaoke YouTube nào (Tier 2: Vocal Performance):
              </span>
              <form onSubmit={handleLoadCustomUrl} className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  placeholder="Dán link YouTube hoặc Video ID (vd: dQw4w9WgXcQ)..."
                  value={customInput}
                  onChange={(e) => setCustomInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors min-h-[40px]"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap min-h-[40px]"
                >
                  Tải video
                </button>
              </form>
            </div>

            {/* Secondary actions: .json import and YouTube search shortcut */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/80 text-xs">
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".json"
                  onChange={handleImportChart}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-zinc-300 text-[11px] font-medium border border-zinc-800 cursor-pointer transition-colors min-h-[38px]"
                >
                  📥 Nhập file phổ nốt (.json)
                </button>
              </div>

              <a
                href="https://www.youtube.com/results?search_query=karaoke"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-lg bg-zinc-950 hover:bg-zinc-800 text-cyan-300 text-[11px] font-semibold border border-zinc-800 transition-colors inline-flex items-center gap-1 min-h-[38px]"
              >
                <span>🔍 Tìm karaoke trên YouTube ↗</span>
              </a>
            </div>
          </div>
        )}



        {/* Actionable Error Recovery Alerts */}
        {ytError && (
          <div className="p-4 rounded-2xl bg-rose-950/80 border border-rose-800 text-rose-200 text-xs space-y-2.5 shadow-xl">
            <div className="font-bold flex items-center gap-1.5 text-rose-300 text-sm">
              <span>⚠️ Trình phát YouTube báo lỗi (Mã {ytError.code})</span>
            </div>
            <p>{ytError.message}</p>
            {ytError.isEmbedBlocked && (
              <p className="text-rose-200 font-medium leading-relaxed">
                Video này bị chủ sở hữu chặn phát ở chế độ nhúng (Embed Blocked). Bạn có thể mở xem trực tiếp trên YouTube, tìm bài hát karaoke khác, hoặc chọn bài hát có sẵn trong thư viện.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {customInput && (
                <a
                  href={`https://www.youtube.com/watch?v=${customInput}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-3.5 py-2 rounded-lg bg-rose-900 hover:bg-rose-800 text-rose-100 font-semibold text-xs border border-rose-700 transition-colors inline-flex items-center gap-1 min-h-[38px]"
                >
                  <span>📺 Mở video trên YouTube ↗</span>
                </a>
              )}
              <a
                href="https://www.youtube.com/results?search_query=karaoke"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-zinc-200 font-semibold text-xs border border-zinc-700 transition-colors inline-flex items-center gap-1 min-h-[38px]"
              >
                <span>🔍 Tìm bài khác trên YouTube ↗</span>
              </a>
              {catalog.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSelectCatalogSong(catalog[0])}
                  className="px-3.5 py-2 rounded-lg bg-indigo-900/80 hover:bg-indigo-800 text-indigo-200 font-semibold text-xs border border-indigo-700 transition-colors cursor-pointer min-h-[38px]"
                >
                  🎵 Thử bài mẫu: {catalog[0].title}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Microphone Error & Permission Recovery Alert */}
        {(micError || micStatus === 'denied') && (
          <div className="p-4 rounded-2xl bg-amber-950/80 border border-amber-800 text-amber-200 text-xs space-y-2.5 shadow-xl">
            <div className="font-bold flex items-center gap-1.5 text-amber-300 text-sm">
              <span>⚠️ Không thể truy cập Micro</span>
            </div>
            <p className="leading-relaxed">
              Trình duyệt chưa được cấp quyền micro: {micError || 'Quyền micro bị từ chối'}.
              Hãy nhấp vào biểu tượng <strong>ổ khóa 🔒</strong> trên thanh địa chỉ trình duyệt, chọn <strong>&quot;Cho phép Micro (Allow)&quot;</strong> rồi bấm nút thử lại bên dưới.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={startMic}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-md min-h-[38px] flex items-center gap-1.5"
              >
                <span>🔄 Thử bật lại Micro</span>
              </button>
            </div>
          </div>
        )}

        {inputError && (
          <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
            {inputError}
          </div>
        )}

        {/* Interrupted Microphone Notice Banner */}
        {micInterrupted && (
          <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-amber-950/80 border border-amber-800 text-amber-200 text-xs animate-in fade-in duration-200 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-base shrink-0">⚠️</span>
              <span>Micro tạm ngắt khi rời ứng dụng — Chạm để bật lại</span>
            </div>
            <button
              type="button"
              onClick={startMic}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white font-bold text-xs shrink-0 cursor-pointer shadow transition-all"
            >
              🎤 Bật lại Micro
            </button>
          </div>
        )}

        {/* Karaoke Stage Container (Supports Fullscreen & Desktop Zero-Scroll) */}
        <div
          ref={stageRef}
          className={
            isFullscreen
              ? 'w-full h-full bg-black relative overflow-hidden select-none'
              : 'w-full flex-1 min-h-0 flex flex-col items-center justify-between gap-2 max-lg:landscape:grid max-lg:landscape:grid-cols-[1.35fr_1fr] max-lg:landscape:items-start max-lg:landscape:gap-3'
          }
        >
          {/* 1. Fullscreen Top-Right KTV Glass HUD Cluster (top-3 right-4 z-30) - Zero top-left obstruction */}
          {isFullscreen && (
            <div
              className={`absolute top-3 right-4 z-30 flex items-center gap-2 pointer-events-none transition-opacity duration-300 ${
                isEffectiveDimmed ? 'opacity-35 hover:opacity-100' : 'opacity-100'
              }`}
            >
              <div className="pointer-events-auto flex items-center gap-2 px-3 py-1.5 rounded-full backdrop-blur-md bg-slate-950/75 border border-white/15 shadow-2xl text-xs">
                {/* Optional Live Score Pill */}
                {showLiveScoreHud && (
                  <div className="flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-zinc-900/80 border border-zinc-700/60 font-mono">
                    <span className="text-[10px] text-zinc-400 uppercase font-semibold">Điểm:</span>
                    <span className="text-sm font-black text-emerald-400">{score.score}</span>
                    <span
                      className={`text-[9px] px-1 py-0.2 rounded border font-extrabold ${getRatingColor(
                        score.rating
                      )}`}
                    >
                      {score.rating}
                    </span>
                    {score.combo > 0 && (
                      <span className="text-[10px] text-amber-400 font-bold ml-1">x{score.combo}</span>
                    )}
                  </div>
                )}

                {/* Primary [🏆 Chốt điểm] */}
                <button
                  type="button"
                  onClick={() => setIsResultModalOpen(true)}
                  className="px-3 py-1 rounded-full bg-gradient-to-r from-amber-500/30 to-emerald-500/30 hover:from-amber-500/50 hover:to-emerald-500/50 border border-emerald-500/50 text-emerald-200 font-bold text-xs transition-all cursor-pointer flex items-center gap-1 shadow-sm active:scale-95"
                  title="Xem bảng chấm điểm"
                >
                  <span>🏆</span>
                  <span>Chốt điểm</span>
                </button>

                {/* Compact [⋯] Popover Menu */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setIsToolsMenuOpen((prev) => !prev)}
                    className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-sm transition-all cursor-pointer border ${
                      isToolsMenuOpen
                        ? 'bg-zinc-700 text-white border-zinc-500 shadow-sm'
                        : 'bg-zinc-800/80 hover:bg-zinc-700/80 text-zinc-300 border-zinc-700/60'
                    }`}
                    title="Menu công cụ & cài đặt"
                  >
                    ⋯
                  </button>

                  {isToolsMenuOpen && (
                    <div className="absolute right-0 top-9 z-50 w-60 p-2 rounded-2xl bg-zinc-950/95 border border-zinc-700/80 shadow-2xl backdrop-blur-md space-y-1 text-xs animate-in fade-in zoom-in-95 duration-100">
                      {/* [🎙️ Mic (M)] */}
                      <button
                        type="button"
                        onClick={() => void handleToggleMic()}
                        className="w-full px-3 py-2 rounded-xl hover:bg-zinc-800/80 text-left flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span>{micStatus === 'running' ? '🎙️' : '🔇'}</span>
                          <span>Microphone</span>
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            micStatus === 'running'
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {micStatus === 'running' ? 'Bật (M)' : 'Tắt (M)'}
                        </span>
                      </button>

                      {/* [〰 Sóng âm] */}
                      <button
                        type="button"
                        onClick={() => setShowPitchTrack((prev) => !prev)}
                        className="w-full px-3 py-2 rounded-xl hover:bg-zinc-800/80 text-left flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span>〰</span>
                          <span>Dải sóng âm nốt</span>
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            showPitchTrack
                              ? 'bg-cyan-950 text-cyan-300 border border-cyan-700'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {showPitchTrack ? 'Hiện' : 'Ẩn'}
                        </span>
                      </button>

                      {/* [🎯 Điểm trực tiếp] */}
                      <button
                        type="button"
                        onClick={() => setShowLiveScoreHud((prev) => !prev)}
                        className="w-full px-3 py-2 rounded-xl hover:bg-zinc-800/80 text-left flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span>🎯</span>
                          <span>Điểm trực tiếp</span>
                        </span>
                        <span
                          className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                            showLiveScoreHud
                              ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                              : 'bg-zinc-800 text-zinc-400'
                          }`}
                        >
                          {showLiveScoreHud ? 'Hiện' : 'Ẩn'}
                        </span>
                      </button>

                      {/* [⏱ Độ trễ] */}
                      <button
                        type="button"
                        onClick={() => {
                          setIsLatencyOpen((prev) => !prev);
                          setIsToolsMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-zinc-800/80 text-left flex items-center justify-between transition-colors cursor-pointer"
                      >
                        <span className="flex items-center gap-2">
                          <span>⏱️</span>
                          <span>Hiệu chỉnh độ trễ</span>
                        </span>
                        <span className="text-[10px] font-mono text-zinc-400">
                          {latencyOffsetMs > 0 ? `+${latencyOffsetMs}` : latencyOffsetMs}ms
                        </span>
                      </button>

                      {/* [↻ Hát lại] */}
                      <button
                        type="button"
                        onClick={() => {
                          handleReplay();
                          setIsToolsMenuOpen(false);
                        }}
                        className="w-full px-3 py-2 rounded-xl hover:bg-zinc-800/80 text-left flex items-center gap-2 transition-colors cursor-pointer border-t border-zinc-800/80 pt-2"
                      >
                        <span>↻</span>
                        <span>Hát lại từ đầu</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* [⛷ Thoát toàn màn hình] */}
                <button
                  type="button"
                  onClick={() => void handleToggleFullscreen()}
                  className="px-2.5 py-1 rounded-full bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 font-semibold text-xs border border-zinc-700/60 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
                  title="Thoát chế độ toàn màn hình"
                >
                  <span>⛷</span>
                  <span className="hidden sm:inline">Thoát</span>
                </button>
              </div>
            </div>
          )}

          {/* YouTube Player Container */}
          <YouTubePlayer
            attachPlayerContainer={attachPlayerContainer}
            isFullscreen={isFullscreen}
          />

          {/* 2. Floating Pitch Ribbon (bottom-[60px] inset-x-6 z-20 - only if opt-in showPitchTrack) */}
          {isFullscreen && showPitchTrack && (
            <div className="absolute bottom-[60px] inset-x-6 z-20 pointer-events-none transition-all duration-300">
              <PitchTrack
                mode={mode}
                activeSong={activeSong}
                interpolatedTimeMs={interpolatedTimeMs}
                latencyOffsetMs={latencyOffsetMs}
                pitch={pitch}
                score={score}
                playerState={playerState}
                variant="floating"
              />
            </div>
          )}

          {/* Fullscreen Latency Popover inside stageRef */}
          {isFullscreen && isLatencyOpen && (
            <div className="absolute top-14 right-4 z-40 w-80 max-w-[90vw] p-3 rounded-2xl bg-zinc-900/95 border border-zinc-700 shadow-2xl backdrop-blur-md animate-in fade-in duration-150 pointer-events-auto">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-zinc-800">
                <span className="text-xs font-bold text-zinc-200">⏱️ Hiệu chỉnh độ trễ âm thanh</span>
                <button
                  type="button"
                  onClick={() => setIsLatencyOpen(false)}
                  className="text-zinc-400 hover:text-white text-xs px-1.5 py-0.5 rounded bg-zinc-800 cursor-pointer"
                >
                  ✕
                </button>
              </div>
              <LatencyControl
                latencyOffsetMs={latencyOffsetMs}
                setLatencyOffsetMs={setLatencyOffsetMs}
                onClose={() => setIsLatencyOpen(false)}
              />
            </div>
          )}

          {/* Windowed Desktop Mode: Unified Control Strip Directly Underneath */}
          {!isFullscreen && (
            <div className="w-full max-w-6xl mx-auto rounded-2xl bg-zinc-900/90 border border-zinc-800 p-2 sm:p-3 shadow-xl shrink-0">
              <div className="flex flex-col lg:grid lg:grid-cols-[auto_1fr_auto] gap-2 lg:gap-4 items-center w-full">
                {/* Left Column: [🎙️ Mic Status (M)] + compact [⏱ Độ trễ] trigger */}
                <div className="flex flex-row lg:flex-col gap-1.5 w-full lg:w-44 shrink-0 justify-between lg:justify-center">
                  <button
                    type="button"
                    onClick={() => void handleToggleMic()}
                    className={`flex-1 lg:w-full px-2.5 py-1.5 rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-sm active:scale-95 min-h-[36px] border ${
                      userMicOverride
                        ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-400 border-zinc-700'
                        : micStatus === 'running'
                          ? 'bg-emerald-950/90 text-emerald-300 border-emerald-600 shadow-emerald-950/50'
                          : micStatus === 'starting'
                            ? 'bg-amber-950/90 text-amber-300 border-amber-600'
                            : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-700'
                    }`}
                    title="Bật/Tắt Micro (Phím tắt: M)"
                  >
                    <span>{getMicStatusText()}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setIsLatencyOpen((prev) => !prev)}
                    className={`flex-1 lg:w-full px-2.5 py-1 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer flex items-center justify-center gap-1 min-h-[30px] ${
                      isLatencyOpen
                        ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                        : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                    }`}
                    title="Hiệu chỉnh độ trễ âm thanh"
                  >
                    <span>⏱️ Độ trễ:</span>
                    <span className="font-mono font-bold">
                      {latencyOffsetMs > 0 ? `+${latencyOffsetMs}` : latencyOffsetMs}ms
                    </span>
                  </button>
                </div>

                {/* Center Column: PitchTrack (if showPitchTrack) OR Clean Stage Banner + Toggles */}
                <div className="min-w-0 flex-1 w-full space-y-1.5">
                  {showPitchTrack ? (
                    <PitchTrack
                      mode={mode}
                      activeSong={activeSong}
                      interpolatedTimeMs={interpolatedTimeMs}
                      latencyOffsetMs={latencyOffsetMs}
                      pitch={pitch}
                      score={score}
                      playerState={playerState}
                      variant="docked"
                    />
                  ) : (
                    <div className="flex items-center justify-center py-2 px-3 rounded-xl bg-zinc-950/60 border border-zinc-800/80 text-xs text-zinc-400 gap-2">
                      <span>🎵</span>
                      <span className="font-medium truncate">
                        Sân khấu sạch • Chấm điểm âm thầm cho đến khi chốt điểm
                      </span>
                    </div>
                  )}

                  {/* Clean Stage Display Toggles Bar */}
                  <div className="flex items-center justify-center gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => setShowPitchTrack((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                        showPitchTrack
                          ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700'
                          : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                      }`}
                      title="Bật/Tắt dải nốt sóng âm trên sân khấu"
                    >
                      <span>〰</span>
                      <span>{showPitchTrack ? 'Ẩn sóng âm' : 'Hiện sóng âm'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowLiveScoreHud((prev) => !prev)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer flex items-center gap-1 ${
                        showLiveScoreHud
                          ? 'bg-emerald-950/80 text-emerald-300 border-emerald-700'
                          : 'bg-zinc-950 hover:bg-zinc-800 text-zinc-400 border-zinc-800'
                      }`}
                      title="Bật/Tắt hiển thị điểm số trực tiếp khi đang hát"
                    >
                      <span>🎯</span>
                      <span>{showLiveScoreHud ? 'Ẩn điểm trực tiếp' : 'Hiện điểm trực tiếp'}</span>
                    </button>
                  </div>
                </div>

                {/* Right Column: Live Điểm (if opt-in) + [🏆 Chốt điểm] + [↻ Hát lại] */}
                <div className="flex flex-row lg:flex-col items-center justify-between lg:justify-center gap-1.5 w-full lg:w-40 shrink-0">
                  {showLiveScoreHud ? (
                    <div className="flex items-center justify-center gap-2">
                      <span className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Điểm:</span>
                      <span className="text-2xl font-black text-emerald-400 tracking-tight leading-none">
                        {score.score}
                      </span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded border font-extrabold leading-none ${getRatingColor(
                          score.rating
                        )}`}
                      >
                        {score.rating}
                      </span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-zinc-500 font-semibold flex items-center gap-1">
                      <span>🎯</span>
                      <span>Điểm số đang ẩn</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 w-auto lg:w-full">
                    <button
                      type="button"
                      onClick={() => setIsResultModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/20 to-emerald-500/20 hover:from-amber-500/30 hover:to-emerald-500/30 border border-emerald-500/40 text-emerald-300 font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm active:scale-95 whitespace-nowrap min-h-[30px] flex-1"
                      title="Xem bảng chấm điểm chi tiết"
                    >
                      <span>🏆 Chốt điểm</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleReplay}
                      className="px-2.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-95 text-zinc-200 font-semibold text-xs border border-zinc-700 transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm whitespace-nowrap min-h-[30px]"
                      title="Hát lại từ đầu"
                    >
                      <span>↻</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Latency Control Popover / Panel inside Stage */}
              {isLatencyOpen && (
                <div className="pt-2 mt-2 border-t border-zinc-800 animate-in fade-in duration-150">
                  <LatencyControl
                    latencyOffsetMs={latencyOffsetMs}
                    setLatencyOffsetMs={setLatencyOffsetMs}
                    onClose={() => setIsLatencyOpen(false)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Post-song Summary Modal - INSIDE stageRef so Fullscreen top layer displays it cleanly */}
          <ResultModal
            isOpen={isResultModalOpen}
            onClose={handleCloseResult}
            onReplay={handleReplay}
            onSelectSong={() => setIsSongDrawerOpen(true)}
            score={score}
            mode={mode}
            songTitle={activeDisplayTitle !== 'Chưa chọn bài' ? activeDisplayTitle : undefined}
            settings={settings}
          />
        </div>
      </div>

      {/* Party, Chấm Điểm & Browser Extension Settings Modal */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-4xl max-h-[88vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-5 text-zinc-100 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <h3 className="text-base font-bold text-white">Cài Đặt &amp; Mở Rộng</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800 text-xs font-semibold cursor-pointer"
              >
                Đóng ✕
              </button>
            </div>

            {/* Responsive 2-Column Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column: Chấm Điểm & Micro */}
              <div className="space-y-4">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Thiết lập chấm điểm &amp; Micro
                </h4>

                {/* 1. Judge Mode */}
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-zinc-300 block">
                    Chế độ Giám khảo (Judge Mode)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {[
                      { id: 'standard', title: 'Chuẩn xác', desc: 'Điểm gốc 100%' },
                      { id: 'lenient', title: 'Dễ tính (+8%)', desc: 'Động viên tiệc tùng' },
                      { id: 'strict', title: 'Khó tính (-10%)', desc: 'Thử thách kỹ thuật' },
                      { id: 'fun', title: 'Hài hước', desc: 'Nhận xét dí dỏm' },
                    ].map((item) => {
                      const isSelected = settings.judgeMode === item.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => handleUpdateSettings({ judgeMode: item.id as JudgeMode })}
                          className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-950/70 border-purple-500 text-purple-200 shadow-[0_0_12px_rgba(168,85,247,0.2)]'
                              : 'bg-zinc-950 hover:bg-zinc-800/80 border-zinc-800 text-zinc-300'
                          }`}
                        >
                          <div className="text-xs font-bold flex items-center justify-between">
                            <span>{item.title}</span>
                            {isSelected && <span className="text-purple-400 text-xs">✓</span>}
                          </div>
                          <div className="text-[11px] text-zinc-400">{item.desc}</div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 2. Fun Remarks Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-zinc-200 block">Lời nhận xét hài hước</span>
                    <span className="text-[11px] text-zinc-400 block">
                      Hiển thị lời bình dí dỏm vui nhộn theo từng thứ hạng S/A/B/C
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateSettings({ enableFunRemarks: !settings.enableFunRemarks })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.enableFunRemarks ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        settings.enableFunRemarks ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 3. Auto-Mic on Play */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-zinc-200 block">Tự động bật Micro khi phát nhạc</span>
                    <span className="text-[11px] text-zinc-400 block">
                      Tự động ghi âm khi bấm Play nếu đã được cấp quyền micro
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateSettings({ autoMicOnPlay: !settings.autoMicOnPlay })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.autoMicOnPlay ? 'bg-emerald-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        settings.autoMicOnPlay ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* 4. Show Debug HUD Toggle */}
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950/80 border border-zinc-800">
                  <div className="space-y-0.5 pr-2">
                    <span className="text-xs font-semibold text-zinc-200 block">Chế độ nhà phát triển (Dev Telemetry)</span>
                    <span className="text-[11px] text-zinc-400 block">
                      Bảng thông số kỹ thuật âm thanh &amp; độ trễ trực tiếp (hoặc dùng ?debug=1)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUpdateSettings({ showDebugHud: !settings.showDebugHud })}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      settings.showDebugHud ? 'bg-indigo-600' : 'bg-zinc-700'
                    }`}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        settings.showDebugHud ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Compact Headphone tip notice inside Settings */}
                <div className="flex items-start gap-2.5 p-3 rounded-xl bg-indigo-950/60 border border-indigo-800/80 text-indigo-200 text-xs">
                  <span className="text-base shrink-0">🎧</span>
                  <div className="space-y-0.5 leading-relaxed">
                    <span className="font-bold text-white block">Gợi ý tai nghe:</span>
                    <span>Hãy đeo tai nghe khi hát để tránh âm thanh từ loa vọng ngược vào micro, giúp hệ thống chấm điểm chuẩn xác nhất.</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Mở nhạc nhanh từ YouTube */}
              <div className="space-y-4 md:border-l md:border-zinc-800 md:pl-6">
                <h4 className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Mở nhạc nhanh từ YouTube
                </h4>

                {/* Card 1: Bookmarklet Quick Link */}
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                    <span>⚡</span>
                    <span>Cách 1: Nút Dấu Trang Siêu Tốc (Không cần cài đặt)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Kéo nút bên dưới thả vào thanh <strong>Dấu trang (Bookmarks Bar)</strong> của trình duyệt (nhấn <code className="px-1 py-0.5 rounded bg-zinc-800 text-zinc-200 font-mono">Ctrl + Shift + B</code> để hiện thanh dấu trang). Khi đang xem bài karaoke trên YouTube, chỉ cần nhấp dấu trang này để chuyển sang KaraScore ngay lập tức.
                  </p>

                  <div className="pt-1 flex flex-col items-start gap-2">
                    <a
                      ref={(el) => {
                        if (el) {
                          const origin = typeof window !== 'undefined' ? window.location.origin : '';
                          const bookmarkletHref = `javascript:(function(){var h=window.location.hostname;if(!h.includes('youtube.com')&&!h.includes('youtu.be')){alert('Hãy mở một video karaoke trên YouTube trước rồi bấm dấu trang này nhé!');return;}var id='';var u=new URL(window.location.href);if(h.includes('youtu.be')){id=u.pathname.slice(1).split('?')[0];}else if(u.pathname.includes('/shorts/')){id=u.pathname.split('/shorts/')[1].split('?')[0];}else{id=u.searchParams.get('v')||'';}if(!id){alert('Không tìm thấy ID video YouTube. Hãy mở video bạn muốn hát nhé!');return;}var t=document.title.replace(/ - YouTube$/,'').trim();window.location.href='${origin}/?v='+encodeURIComponent(id)+'&title='+encodeURIComponent(t);})();`;
                          el.setAttribute('href', bookmarkletHref);
                        }
                      }}
                      onClick={(e) => {
                        e.preventDefault();
                        setShowBookmarkletHint(true);
                        setTimeout(() => setShowBookmarkletHint(false), 3000);
                      }}
                      title="Kéo nút này vào thanh Dấu trang (Bookmarks Bar) của trình duyệt"
                      className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-black text-xs shadow-md transition-all cursor-grab active:cursor-grabbing select-none"
                    >
                      <span>🎤</span>
                      <span>Hát trên KaraScore</span>
                    </a>

                    {showBookmarkletHint && (
                      <div className="w-full p-2.5 rounded-lg bg-amber-950/70 border border-amber-600 text-amber-200 text-xs animate-in fade-in duration-150">
                        💡 Hãy kéo thả nút này lên thanh <strong>Dấu trang (Ctrl + Shift + B)</strong> trên trình duyệt để sử dụng khi xem YouTube nhé!
                      </div>
                    )}
                  </div>
                </div>

                {/* Card 2: Chrome Extension Download & Instructions */}
                <div className="p-3.5 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-purple-300">
                    <span>🧩</span>
                    <span>Cách 2: Chrome Extension (Nút ngay dưới video YouTube)</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    Tiện ích mở rộng giúp thêm nút &quot;Hát trên KaraScore&quot; hiển thị cố định ngay dưới khung phát video của YouTube.
                  </p>

                  <div className="flex flex-wrap items-center gap-2 pt-0.5">
                    <a
                      href="/downloads/karascore-extension-v1.0.0.zip"
                      download="karascore-extension-v1.0.0.zip"
                      className="px-3.5 py-2 rounded-xl bg-purple-900/70 hover:bg-purple-800 border border-purple-500/50 text-purple-200 font-bold text-xs inline-flex items-center gap-1.5 transition-colors shadow-sm"
                    >
                      <span>📦</span>
                      <span>Tải Extension v1.0.0 (.zip)</span>
                    </a>

                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText('chrome://extensions');
                          setIsCopiedExtensions(true);
                          setTimeout(() => setIsCopiedExtensions(false), 2000);
                        } catch (err) {
                          console.warn('Clipboard copy error:', err);
                        }
                      }}
                      className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <span>{isCopiedExtensions ? '✓ Đã copy!' : '📋 Copy chrome://extensions'}</span>
                    </button>
                  </div>

                  <div className="space-y-1.5 pt-1 text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-800/80">
                    <div className="font-semibold text-zinc-300 text-xs">Cài đặt trong 3 bước:</div>
                    <ol className="list-decimal list-inside space-y-1 pl-1">
                      <li>Giải nén file <code className="text-zinc-300">.zip</code> vừa tải về máy tính.</li>
                      <li>Dán đường dẫn vừa copy vào tab mới trình duyệt và bật <strong className="text-zinc-200">Developer mode</strong> (góc trên bên phải).</li>
                      <li>Chọn <strong className="text-zinc-200">Load unpacked</strong> rồi trỏ tới thư mục vừa giải nén.</li>
                    </ol>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer with Version label and Close button */}
            <div className="flex items-center justify-between border-t border-zinc-800 pt-3">
              <div className="text-[10px] text-zinc-500 font-mono tracking-wider">
                KaraScore v1.0.0
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="px-5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Đóng cài đặt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Telemetry Overlay HUD (Accessible via Dev Telemetry toggle in Settings or ?debug=1) */}
      {shouldShowDebugHud && (
        <DebugHUD
          micStatus={micStatus}
          micError={micError}
          sampleRate={sampleRate}
          pitch={pitch}
          playerState={playerState}
          rawVideoTimeSec={rawVideoTimeSec}
          interpolatedTimeMs={interpolatedTimeMs}
          latencyOffsetMs={latencyOffsetMs}
          ytError={ytError}
          score={score}
          activeSongTitle={activeSong?.title || customSongTitle || undefined}
          showDebugHud={settings.showDebugHud}
          judgeMode={settings.judgeMode}
        />
      )}
    </div>
  );
}

export default App;
