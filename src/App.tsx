import React, { useEffect, useRef, useState } from 'react';
import { DebugHUD } from './components/DebugHUD';
import { LatencyControl } from './components/LatencyControl';
import { PitchTrack } from './components/PitchTrack';
import { ResultModal } from './components/ResultModal';
import { useKaraokeSession } from './hooks/useKaraokeSession';
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

  // Derive ResultModal visibility: opens on ENDED (unless dismissed) or via manual trigger
  const isResultOpen =
    isManualResultOpen || (playerState === 'ENDED' && !hasDismissedEndedResult);

  const handleSelectCatalogSong = async (entry: SongCatalogEntry) => {
    try {
      setIsLoadingSong(true);
      setInputError(null);
      const songData = await loadSongChart(entry);
      loadVideo(entry.youtubeVideoId, songData);
      setCustomInput(entry.youtubeVideoId);
      setCustomSongTitle(entry.title);
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

    // Check if the user entered a video ID that exists in our catalog
    const matched = findSongInCatalog(catalog, videoId);
    if (matched) {
      void handleSelectCatalogSong(matched);
    } else {
      setCustomSongTitle(null);
      loadVideo(videoId, null);
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
        return 'text-amber-400 border-amber-500 bg-amber-950/40';
      case 'A':
        return 'text-emerald-400 border-emerald-500 bg-emerald-950/40';
      case 'B':
        return 'text-blue-400 border-blue-500 bg-blue-950/40';
      default:
        return 'text-zinc-400 border-zinc-600 bg-zinc-900/40';
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center p-4 md:p-8 font-sans">
      <div className="max-w-4xl w-full space-y-6">
        {/* App Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 border-b border-zinc-800 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
                KaraScore
              </h1>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                Phase 3B MVP
              </span>
            </div>
            <p className="text-zinc-400 text-xs md:text-sm mt-0.5">
              100% Client-Side YouTube Karaoke Pitch Scoring & Anti-Cheat Validation
            </p>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2.5 py-1 rounded-md font-medium border ${
                micStatus === 'running'
                  ? 'bg-emerald-950 text-emerald-300 border-emerald-700 animate-pulse'
                  : micStatus === 'starting'
                    ? 'bg-amber-950 text-amber-300 border-amber-700'
                    : micStatus === 'denied' || micStatus === 'error'
                      ? 'bg-rose-950 text-rose-300 border-rose-700'
                      : 'bg-zinc-900 text-zinc-400 border-zinc-800'
              }`}
            >
              🎤 Mic: {micStatus.toUpperCase()}
            </span>
            <span className="px-2.5 py-1 rounded-md font-medium border bg-zinc-900 text-zinc-300 border-zinc-800">
              ▶ {playerState}
            </span>
          </div>
        </header>

        {/* Video Player Container (Strictly ZERO overlays on top per YouTube policy) */}
        <div className="w-full aspect-video rounded-2xl overflow-hidden bg-black shadow-2xl border border-zinc-800">
          <div
            ref={attachPlayerContainer}
            className="w-full h-full"
            id="youtube-player"
          />
        </div>

        {/* Error Alerts & YouTube Embed Recovery UI */}
        {ytError && (
          <div className="p-4 rounded-xl bg-rose-950/70 border border-rose-800 text-rose-200 text-xs space-y-2.5">
            <div className="font-bold flex items-center gap-1.5 text-rose-300 text-sm">
              <span>⚠️ Lỗi trình phát YouTube (Mã {ytError.code})</span>
            </div>
            <p>{ytError.message}</p>
            {ytError.isEmbedBlocked && (
              <p className="text-rose-200 font-medium">
                Video này bị chủ sở hữu chặn phát ở chế độ nhúng (Embed Blocked). Bạn có thể mở tìm kiếm YouTube để chọn video karaoke khác cho phép nhúng, hoặc thử các bài hát có sẵn trong thư viện.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <a
                href="https://www.youtube.com/results?search_query=karaoke"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 rounded-lg bg-rose-900/90 hover:bg-rose-800 text-rose-100 font-semibold text-xs border border-rose-700 transition-colors inline-flex items-center gap-1"
              >
                <span>🔍 Tìm video karaoke khác trên YouTube ↗</span>
              </a>
              {catalog.length > 0 && (
                <button
                  type="button"
                  onClick={() => void handleSelectCatalogSong(catalog[0])}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs border border-zinc-600 transition-colors cursor-pointer"
                >
                  🎵 Thử bài mẫu: {catalog[0].title}
                </button>
              )}
            </div>
          </div>
        )}

        {micError && (
          <div className="p-3.5 rounded-xl bg-amber-950/60 border border-amber-800 text-amber-200 text-xs">
            <span className="font-bold text-amber-300">⚠️ Lỗi Micro:</span> {micError}
          </div>
        )}

        {inputError && (
          <div className="p-3 rounded-lg bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
            {inputError}
          </div>
        )}

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

        {/* Latency Offset Calibration Bar */}
        <LatencyControl
          latencyOffsetMs={latencyOffsetMs}
          setLatencyOffsetMs={setLatencyOffsetMs}
        />

        {/* Real-time Status Card (Strictly Below Video & PitchTrack) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/70 p-4 rounded-xl border border-zinc-800 text-center">
          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Chế độ chấm</div>
            <div className="font-bold text-sm text-cyan-400">
              {mode === 'exact' ? 'Tier 1: Exact Melody' : 'Tier 2: Vocal Performance'}
            </div>
            {mode === 'smart' ? (
              <div className="text-[10px] text-zinc-400">
                Độ ổn định, chuẩn bán âm &amp; độ phủ giọng
              </div>
            ) : activeSong ? (
              <div className="text-[10px] text-zinc-400 truncate max-w-full">
                {activeSong.title}
              </div>
            ) : customSongTitle ? (
              <div className="text-[10px] text-zinc-400 truncate max-w-full">
                {customSongTitle}
              </div>
            ) : null}
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Điểm số</div>
            <div className="text-2xl font-black text-emerald-400 flex items-center justify-center gap-1.5">
              <span>{score.score}</span>
              <span className={`text-xs px-1.5 py-0.2 rounded border font-bold ${getRatingColor(score.rating)}`}>
                {score.rating}
              </span>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Combo</div>
            <div className="text-lg font-bold text-amber-400">
              {score.combo} <span className="text-xs text-zinc-500 font-normal">(Max: {score.maxCombo})</span>
            </div>
          </div>

          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Cao độ nhận diện</div>
            <div className="font-mono text-sm font-bold text-zinc-200">
              {pitch.noteName ? (
                <span className="text-teal-300">
                  {pitch.noteName}
                  {score.centsDelta !== null && (
                    <span className="text-xs font-normal text-zinc-400 ml-1">
                      ({score.centsDelta >= 0 ? '+' : ''}{score.centsDelta.toFixed(0)}c)
                    </span>
                  )}
                </span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </div>
          </div>
        </div>

        {/* Action Controls Section */}
        <div className="bg-zinc-900/40 p-4 rounded-xl border border-zinc-800 space-y-4">
          {/* Song Library Selector (Tier 1 Cached Charts) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <span>📚 Thư viện bài hát (Tier 1 Exact Melody):</span>
              </span>
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
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[11px] font-medium border border-zinc-700 cursor-pointer transition-colors"
                >
                  📥 Nhập file .json
                </button>
                <a
                  href="https://www.youtube.com/results?search_query=karaoke"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-cyan-300 text-[11px] font-medium border border-zinc-700 transition-colors inline-flex items-center gap-1"
                >
                  🔍 Tìm trên YouTube ↗
                </a>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {catalog.map((entry) => {
                const isActive = activeSong?.songId === entry.songId;
                return (
                  <button
                    key={entry.songId}
                    type="button"
                    onClick={() => void handleSelectCatalogSong(entry)}
                    disabled={isLoadingSong}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5 border ${
                      isActive
                        ? 'bg-indigo-600 border-indigo-400 text-white shadow-sm shadow-indigo-900'
                        : 'bg-zinc-900 hover:bg-zinc-800 border-zinc-700 text-zinc-300'
                    }`}
                  >
                    <span>🎵 {entry.title}</span>
                    <span className="text-[10px] opacity-75 font-normal">({entry.artist})</span>
                  </button>
                );
              })}
              {catalog.length === 0 && (
                <span className="text-xs text-zinc-500 italic">Đang tải danh mục bài hát...</span>
              )}
            </div>
          </div>

          {/* Mic Controls & Score Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/60">
            <div className="flex items-center gap-2">
              {micStatus !== 'running' ? (
                <button
                  type="button"
                  onClick={startMic}
                  className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5 shadow-md shadow-emerald-950"
                >
                  🎤 Start Mic
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopMic}
                  className="px-3.5 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 active:bg-rose-700 text-white font-semibold text-xs transition-colors cursor-pointer flex items-center gap-1.5"
                >
                  🛑 Stop Mic
                </button>
              )}

              <button
                type="button"
                onClick={resetScore}
                className="px-3 py-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 font-medium text-xs transition-colors cursor-pointer border border-zinc-700"
              >
                Reset Score
              </button>

              <button
                type="button"
                onClick={() => setIsManualResultOpen(true)}
                className="px-3.5 py-2 rounded-lg bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm"
              >
                🏆 Xem kết quả
              </button>
            </div>
          </div>

          {/* Custom YouTube URL/ID Input (Tier 2 Vocal Performance Mode) */}
          <form onSubmit={handleLoadCustomUrl} className="flex gap-2">
            <input
              type="text"
              placeholder="Dán link YouTube hoặc Video ID (vd: dQw4w9WgXcQ)..."
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              className="flex-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 transition-colors"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              Load Video (Vocal Performance)
            </button>
          </form>

          {/* Quick Playback Helpers */}
          <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/60 text-xs">
            <span className="text-zinc-500 text-[11px]">Trình phát:</span>
            <button
              type="button"
              onClick={play}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer"
            >
              Phát (Play)
            </button>
            <button
              type="button"
              onClick={pause}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer"
            >
              Tạm dừng (Pause)
            </button>
            <button
              type="button"
              onClick={() => seekTo(0)}
              className="px-2.5 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs cursor-pointer"
            >
              Về đầu (0s)
            </button>
          </div>
        </div>
      </div>

      {/* Post-song Summary Modal */}
      <ResultModal
        isOpen={isResultOpen}
        onClose={handleCloseResult}
        onReplay={handleReplay}
        score={score}
        mode={mode}
        songTitle={activeSong?.title || customSongTitle || undefined}
      />

      {/* DEV-Only Telemetry Overlay HUD (Strictly hidden in production builds) */}
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
      />
    </div>
  );
}

export default App;
