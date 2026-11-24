import React, { useEffect, useRef, useState } from 'react';
import { DebugHUD } from './components/DebugHUD';
import { LatencyControl } from './components/LatencyControl';
import { PitchTrack } from './components/PitchTrack';
import { ResultModal } from './components/ResultModal';
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
    pause,
    seekTo,
  } = useKaraokeSession();

  const [catalog, setCatalog] = useState<SongCatalogEntry[]>([]);
  const [customInput, setCustomInput] = useState<string>('');
  const [customSongTitle, setCustomSongTitle] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const [isLoadingSong, setIsLoadingSong] = useState<boolean>(false);
  const [isManualResultOpen, setIsManualResultOpen] = useState<boolean>(false);
  const [hasDismissedEndedResult, setHasDismissedEndedResult] = useState<boolean>(false);

  // Party & App Settings
  const [settings, setSettings] = useState<KaraScoreSettings>(() => loadPartySettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // UX state flags
  const [isSongDrawerOpen, setIsSongDrawerOpen] = useState<boolean>(false);
  const [isLatencyOpen, setIsLatencyOpen] = useState<boolean>(false);
  const [showHeadphoneTip, setShowHeadphoneTip] = useState<boolean>(() => {
    try {
      return localStorage.getItem('karascore_headphone_tip_dismissed') !== 'true';
    } catch {
      return true;
    }
  });

  const handleUpdateSettings = (updater: Partial<KaraScoreSettings>) => {
    setSettings((prev) => {
      const updated = { ...prev, ...updater };
      savePartySettings(updated);
      return updated;
    });
  };

  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  // Auto-attempt startMic() when player transitions to PLAYING if mic is idle and autoMicOnPlay is enabled
  useEffect(() => {
    if (playerState === 'PLAYING' && micStatus === 'idle' && settings.autoMicOnPlay) {
      if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
        navigator.permissions
          .query({ name: 'microphone' as PermissionName })
          .then((res) => {
            if (res.state === 'granted') {
              void startMic();
            }
          })
          .catch(() => {
            // Safe fallback if permission query not supported
          });
      }
    }
  }, [playerState, micStatus, startMic, settings.autoMicOnPlay]);

  // Derive ResultModal visibility: opens on ENDED (unless dismissed) or via manual trigger
  const isResultOpen =
    isManualResultOpen || (playerState === 'ENDED' && !hasDismissedEndedResult);

  const handleDismissHeadphoneTip = () => {
    setShowHeadphoneTip(false);
    try {
      localStorage.setItem('karascore_headphone_tip_dismissed', 'true');
    } catch {
      // Safe fallback
    }
  };

  const handleSelectCatalogSong = async (entry: SongCatalogEntry) => {
    try {
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
    setHasDismissedEndedResult(false);
    setIsManualResultOpen(false);
    resetScore();
    seekTo(0);
    play();
  };

  const handleCloseResult = () => {
    setIsManualResultOpen(false);
    if (playerState === 'ENDED') {
      setHasDismissedEndedResult(true);
    }
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
  const isMidSongPaused = playerState === 'PAUSED' && score.activeTicks > 0;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-3 sm:p-6 font-sans overflow-x-hidden selection:bg-emerald-500 selection:text-white">
      <div className="max-w-4xl w-full space-y-3 sm:space-y-4">
        {/* Stage-First Header */}
        <header className="flex items-center justify-between gap-2 border-b border-zinc-800 pb-3">
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
            {/* Settings button */}
            <button
              type="button"
              onClick={() => setIsSettingsOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold border bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700 transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px]"
              title="Cài đặt Party & Chế độ Giám khảo"
            >
              <span>⚙️</span>
              <span className="hidden sm:inline">Cài đặt</span>
            </button>

            {/* Song library drawer toggle */}
            <button
              type="button"
              onClick={() => setIsSongDrawerOpen((prev) => !prev)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all cursor-pointer flex items-center gap-1.5 min-h-[38px] ${
                isSongDrawerOpen
                  ? 'bg-zinc-800 text-white border-zinc-600'
                  : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border-zinc-700'
              }`}
            >
              <span>📚 Chọn bài</span>
              <span className="text-[10px] text-zinc-400">{isSongDrawerOpen ? '▲' : '▼'}</span>
            </button>

            {/* Mic status badge */}
            <span
              className={`px-2.5 py-1.5 rounded-lg font-semibold text-xs border flex items-center gap-1.5 min-h-[38px] ${
                micStatus === 'running'
                  ? 'bg-emerald-950/80 text-emerald-300 border-emerald-600 animate-pulse'
                  : micStatus === 'starting'
                    ? 'bg-amber-950/80 text-amber-300 border-amber-600'
                    : micStatus === 'denied' || micStatus === 'error'
                      ? 'bg-rose-950/80 text-rose-300 border-rose-600'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              <span>🎤</span>
              <span className="hidden sm:inline">Mic: {micStatus.toUpperCase()}</span>
            </span>
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

        {/* Headphone Recommendation Tip Banner (Dismissible) */}
        {showHeadphoneTip && (
          <div className="flex items-center justify-between gap-2 px-3.5 py-2 rounded-xl bg-indigo-950/60 border border-indigo-800/80 text-indigo-200 text-xs animate-in fade-in duration-200">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 text-base">🎧</span>
              <span className="truncate sm:whitespace-normal">
                <strong>Gợi ý:</strong> Hãy đeo tai nghe khi hát để tránh âm thanh từ loa vọng vào micro và chấm điểm chuẩn xác nhất!
              </span>
            </div>
            <button
              type="button"
              onClick={handleDismissHeadphoneTip}
              className="text-indigo-400 hover:text-indigo-200 px-2 py-1 rounded text-xs font-bold cursor-pointer shrink-0"
              title="Đã hiểu, đóng thông báo"
            >
              ✕
            </button>
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

        {/* Video Player Container (Strictly ZERO overlays on top per YouTube policy) */}
        <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-zinc-800">
          <div
            ref={attachPlayerContainer}
            className="w-full h-full"
            id="youtube-player"
          />
        </div>

        {/* Pitch Track Visualizer (Strictly positioned BELOW the YouTube Player) */}
        <PitchTrack
          mode={mode}
          activeSong={activeSong}
          interpolatedTimeMs={interpolatedTimeMs}
          latencyOffsetMs={latencyOffsetMs}
          pitch={pitch}
          score={score}
          playerState={playerState}
        />

        {/* Main Stage Unified Score & Control Dock */}
        <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800 p-3 sm:p-4 shadow-xl space-y-3.5">
          {/* Top Row: Real-time Telemetry Metrics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            {/* Score Card */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-0.5">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">Điểm số</span>
              <div className="text-2xl sm:text-3xl font-black text-emerald-400 flex items-center justify-center gap-1.5">
                <span>{score.score}</span>
                <span className={`text-[11px] px-1.5 py-0.2 rounded border font-bold ${getRatingColor(score.rating)}`}>
                  {score.rating}
                </span>
              </div>
            </div>

            {/* Combo Card */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-0.5">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">Combo</span>
              <div className="text-xl sm:text-2xl font-black text-amber-400">
                {score.combo} <span className="text-[10px] text-zinc-400 font-normal">(Max: {score.maxCombo})</span>
              </div>
            </div>

            {/* Detected Note Card */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-0.5">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">Cao độ nhận diện</span>
              <div className="font-mono text-sm sm:text-base font-bold text-zinc-200">
                {pitch.noteName ? (
                  <span className="text-teal-300">
                    {pitch.noteName}
                    {score.centsDelta !== null && (
                      <span className="text-[10px] font-normal text-zinc-400 ml-1">
                        ({score.centsDelta >= 0 ? '+' : ''}{score.centsDelta.toFixed(0)}c)
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </div>
            </div>

            {/* Mode Card */}
            <div className="p-2 sm:p-2.5 rounded-xl bg-zinc-950/60 border border-zinc-800/80 space-y-0.5">
              <span className="text-[10px] text-zinc-400 uppercase font-bold tracking-wider block">Chế độ chấm</span>
              <div className="font-bold text-xs sm:text-sm text-cyan-400 truncate">
                {mode === 'exact' ? 'Tier 1: Exact' : 'Tier 2: Vocal'}
              </div>
              <div className="text-[10px] text-zinc-400 truncate">
                {mode === 'exact' ? (activeSong?.title || 'Phổ nốt') : 'Đo ổn định & độ phủ'}
              </div>
            </div>
          </div>

          {/* Bottom Row: Smart Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-zinc-800/80">
            {/* Primary Mic Activation CTA */}
            <div className="flex items-center gap-2 flex-1 sm:flex-initial min-w-[160px]">
              {micStatus !== 'running' ? (
                <button
                  type="button"
                  onClick={startMic}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-98 text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/80 min-h-[42px] animate-pulse"
                >
                  <span className="text-base">🎤</span>
                  <span>Bật Micro để chấm điểm</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopMic}
                  className="w-full sm:w-auto px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 active:scale-98 text-white font-bold text-xs transition-all cursor-pointer flex items-center justify-center gap-2 min-h-[42px]"
                >
                  <span>🛑 Dừng Micro</span>
                </button>
              )}
            </div>

            {/* Secondary Stage Controls */}
            <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
              {/* Mid-song Pause Scoring Highlight or Standard Result */}
              {isMidSongPaused ? (
                <button
                  type="button"
                  onClick={() => setIsManualResultOpen(true)}
                  className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-white font-black text-xs transition-all cursor-pointer shadow-lg shadow-amber-950/80 border border-amber-300 min-h-[42px] animate-bounce"
                >
                  🏆 Chấm điểm ngay lúc này
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsManualResultOpen(true)}
                  className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-700 transition-colors cursor-pointer min-h-[40px]"
                >
                  🏆 Xem kết quả
                </button>
              )}

              {/* Latency Calibration Toggle */}
              <button
                type="button"
                onClick={() => setIsLatencyOpen((prev) => !prev)}
                className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer min-h-[40px] flex items-center gap-1.5 ${
                  isLatencyOpen
                    ? 'bg-cyan-950 text-cyan-300 border-cyan-700'
                    : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border-zinc-700'
                }`}
              >
                <span>⏱️ Độ trễ:</span>
                <span className="font-mono font-bold">
                  {latencyOffsetMs > 0 ? `+${latencyOffsetMs}` : latencyOffsetMs}ms
                </span>
              </button>

              {/* Score Reset */}
              <button
                type="button"
                onClick={resetScore}
                className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 font-medium text-xs transition-colors cursor-pointer border border-zinc-700 min-h-[40px]"
                title="Đặt lại toàn bộ điểm số"
              >
                🔄 Đặt lại
              </button>
            </div>
          </div>

          {/* Collapsible Latency Slider Panel */}
          {isLatencyOpen && (
            <div className="pt-2 border-t border-zinc-800 animate-in fade-in duration-150">
              <LatencyControl
                latencyOffsetMs={latencyOffsetMs}
                setLatencyOffsetMs={setLatencyOffsetMs}
                onClose={() => setIsLatencyOpen(false)}
              />
            </div>
          )}
        </div>

        {/* Minimalist Playback Control Helper */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-zinc-900/40 border border-zinc-800/80 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-zinc-500 text-[11px] hidden sm:inline">Trình phát:</span>
            <button
              type="button"
              onClick={play}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer min-h-[36px]"
            >
              ▶ Phát
            </button>
            <button
              type="button"
              onClick={pause}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer min-h-[36px]"
            >
              ⏸ Tạm dừng
            </button>
            <button
              type="button"
              onClick={() => seekTo(0)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer min-h-[36px]"
            >
              ⏮ Về đầu (0s)
            </button>
          </div>

          <div className="text-[11px] text-zinc-500 font-mono">
            {rawVideoTimeSec > 0 ? `${Math.floor(rawVideoTimeSec / 60)}:${String(Math.floor(rawVideoTimeSec % 60)).padStart(2, '0')}` : '0:00'}
          </div>
        </div>
      </div>

      {/* Party & Chấm Điểm Settings Modal */}
      {isSettingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
        >
          <div className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-5 text-zinc-100 space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚙️</span>
                <h3 className="text-base font-bold text-white">Cài Đặt Party &amp; Chấm Điểm</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="text-zinc-400 hover:text-white px-2.5 py-1 rounded-lg bg-zinc-800 text-xs font-semibold cursor-pointer"
              >
                Đóng ✕
              </button>
            </div>

            {/* 1. Judge Mode */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-300 uppercase tracking-wider block">
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
                <span className="text-xs font-semibold text-zinc-200 block">Hiện Debug HUD</span>
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

            {/* Close footer button */}
            <div className="pt-2">
              <button
                type="button"
                onClick={() => setIsSettingsOpen(false)}
                className="w-full py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold transition-colors cursor-pointer"
              >
                Đóng cài đặt
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Post-song Summary Modal */}
      <ResultModal
        isOpen={isResultOpen}
        onClose={handleCloseResult}
        onReplay={handleReplay}
        score={score}
        mode={mode}
        songTitle={activeSong?.title || customSongTitle || undefined}
        settings={settings}
      />

      {/* Telemetry Overlay HUD (Accessible via DEV, Settings toggle, or ?debug=1) */}
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
    </div>
  );
}

export default App;
