import React, { useState } from 'react';
import { DebugHUD } from './components/DebugHUD';
import { useKaraokeSession } from './hooks/useKaraokeSession';
import { extractYouTubeVideoId } from './services/youtubeUrlParser';
import type { SongData } from './types/karaoke';

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
    play,
    pause,
    seekTo,
  } = useKaraokeSession();

  const [customInput, setCustomInput] = useState<string>('');
  const [inputError, setInputError] = useState<string | null>(null);
  const [isLoadingSample, setIsLoadingSample] = useState<boolean>(false);

  const handleLoadSampleSong = async () => {
    try {
      setIsLoadingSample(true);
      setInputError(null);
      const res = await fetch('/songs/sample-song.json');
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const songData: SongData = await res.json();
      loadVideo(songData.youtubeVideoId, songData);
      setCustomInput(songData.youtubeVideoId);
    } catch (err) {
      setInputError(`Không tải được bài hát mẫu: ${(err as Error).message}`);
    } finally {
      setIsLoadingSample(false);
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
    loadVideo(videoId, null);
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
                Walking Skeleton v1
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

        {/* Error Alerts */}
        {ytError && (
          <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-200 text-xs space-y-1">
            <div className="font-bold flex items-center gap-1.5 text-rose-300">
              <span>⚠️ Lỗi trình phát YouTube (Mã {ytError.code})</span>
            </div>
            <p>{ytError.message}</p>
            {ytError.isEmbedBlocked && (
              <p className="text-rose-300 font-semibold mt-1">
                Gợi ý: Hãy thử dán một video YouTube karaoke khác cho phép nhúng (ví dụ: các video karaoke phổ biến).
              </p>
            )}
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

        {/* Real-time Status Card (Strictly Below Video) */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-zinc-900/70 p-4 rounded-xl border border-zinc-800 text-center">
          <div className="space-y-0.5">
            <div className="text-[11px] text-zinc-500 uppercase tracking-wider font-semibold">Chế độ chấm</div>
            <div className="font-bold text-sm text-cyan-400">
              {mode === 'exact' ? 'Tier 1: Exact Melody' : 'Tier 2: Smart Vocal'}
            </div>
            {activeSong && (
              <div className="text-[10px] text-zinc-400 truncate max-w-full">
                {activeSong.title}
              </div>
            )}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Song Pickers */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleLoadSampleSong}
                disabled={isLoadingSample}
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs transition-colors cursor-pointer disabled:opacity-50"
              >
                {isLoadingSample ? 'Đang tải...' : '🎵 Load Sample Chart (Tier 1 Exact)'}
              </button>
            </div>

            {/* Mic Controls */}
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
            </div>
          </div>

          {/* Custom YouTube URL/ID Input (Tier 2 Smart Mode) */}
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
              Load Video (Smart Mode)
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
        activeSongTitle={activeSong?.title}
      />
    </div>
  );
}

export default App;
