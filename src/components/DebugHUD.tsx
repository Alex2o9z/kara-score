import React, { useState } from 'react';
import type { AudioPermissionState } from '../engines/AudioEngine';
import type { PlayerState, ScoreSnapshot, SmoothedPitchFrame } from '../types/karaoke';
import type { YouTubePlayerError } from '../services/YouTubePlayerAdapter';

export interface DebugHUDProps {
  micStatus: AudioPermissionState;
  micError: string | null;
  sampleRate: number;
  pitch: SmoothedPitchFrame;
  playerState: PlayerState;
  rawVideoTimeSec: number;
  interpolatedTimeMs: number;
  latencyOffsetMs: number;
  ytError: YouTubePlayerError | null;
  score: ScoreSnapshot;
  activeSongTitle?: string | null;
}

export const DebugHUD: React.FC<DebugHUDProps> = (props) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(true);

  // Guardrail Rule 8: Strictly render NOTHING in production builds
  if (!import.meta.env.DEV) {
    return null;
  }

  const handleExportDiagnostics = () => {
    const diagnosticsData = {
      timestamp: new Date().toISOString(),
      app: 'KaraScore',
      version: 'MVP v1',
      environment: 'development',
      audio: {
        micStatus: props.micStatus,
        micError: props.micError,
        sampleRate: props.sampleRate,
        rms: Number(props.pitch.rms.toFixed(5)),
        clarity: Number(props.pitch.clarity.toFixed(4)),
        hz: props.pitch.hz !== null ? Number(props.pitch.hz.toFixed(2)) : null,
        midi: props.pitch.midi !== null ? Number(props.pitch.midi.toFixed(2)) : null,
        noteName: props.pitch.noteName,
        isValid: props.pitch.isValid,
      },
      timeline: {
        playerState: props.playerState,
        rawVideoTimeSec: Number(props.rawVideoTimeSec.toFixed(3)),
        interpolatedTimeMs: Math.round(props.interpolatedTimeMs),
        latencyOffsetMs: props.latencyOffsetMs,
        ytError: props.ytError,
        activeSongTitle: props.activeSongTitle ?? null,
      },
      scoring: {
        mode: props.score.mode,
        score: props.score.score,
        rating: props.score.rating,
        accuracyPct: props.score.accuracyPct,
        combo: props.score.combo,
        maxCombo: props.score.maxCombo,
        targetMidi: props.score.targetMidi,
        centsDelta: props.score.centsDelta !== null ? Number(props.score.centsDelta.toFixed(1)) : null,
        activeTicks: props.score.activeTicks,
        validVocalTicks: props.score.validVocalTicks,
        breakdown: props.score.breakdown,
      },
    };

    const jsonString = JSON.stringify(diagnosticsData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `karascore-diagnostics-${Date.now()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PLAYING':
      case 'running':
        return 'bg-emerald-900/80 text-emerald-300 border-emerald-700';
      case 'BUFFERING':
      case 'starting':
        return 'bg-amber-900/80 text-amber-300 border-amber-700';
      case 'denied':
      case 'error':
        return 'bg-rose-900/80 text-rose-300 border-rose-700';
      default:
        return 'bg-zinc-800 text-zinc-400 border-zinc-700';
    }
  };

  return (
    <div className="fixed top-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] font-mono text-xs rounded-xl shadow-2xl border border-zinc-800 bg-zinc-950/90 backdrop-blur-md text-zinc-200 overflow-hidden select-none">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-zinc-900/80 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="font-bold tracking-wider text-zinc-100">DEV TELEMETRY HUD</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors text-[10px]"
          >
            {isExpanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3 max-h-[80vh] overflow-y-auto">
          {/* Group 1: Audio & Pitch */}
          <section className="bg-zinc-900/50 rounded-lg p-2.5 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 font-semibold border-b border-zinc-800 pb-1">
              <span>1. AUDIO & PITCH</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] border ${getStatusBadge(props.micStatus)}`}>
                {props.micStatus.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-zinc-300">
              <div>
                <span className="text-zinc-500">Sample Rate:</span> {props.sampleRate} Hz
              </div>
              <div>
                <span className="text-zinc-500">RMS:</span> {props.pitch.rms.toFixed(4)}
              </div>
              <div>
                <span className="text-zinc-500">Clarity:</span> {props.pitch.clarity.toFixed(3)}
              </div>
              <div>
                <span className="text-zinc-500">Valid:</span>{' '}
                <span className={props.pitch.isValid ? 'text-emerald-400 font-bold' : 'text-zinc-500'}>
                  {props.pitch.isValid ? 'TRUE' : 'FALSE'}
                </span>
              </div>
              <div>
                <span className="text-zinc-500">Frequency:</span>{' '}
                {props.pitch.hz !== null ? `${props.pitch.hz.toFixed(1)} Hz` : '—'}
              </div>
              <div>
                <span className="text-zinc-500">Note:</span>{' '}
                <span className="text-amber-400 font-bold">
                  {props.pitch.noteName ? `${props.pitch.noteName} (${props.pitch.midi?.toFixed(1)})` : '—'}
                </span>
              </div>
            </div>
            {props.micError && (
              <div className="text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/60 break-words">
                {props.micError}
              </div>
            )}
          </section>

          {/* Group 2: Timeline & Player */}
          <section className="bg-zinc-900/50 rounded-lg p-2.5 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 font-semibold border-b border-zinc-800 pb-1">
              <span>2. TIMELINE & PLAYER</span>
              <span className={`px-1.5 py-0.2 rounded text-[10px] border ${getStatusBadge(props.playerState)}`}>
                {props.playerState}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-zinc-300">
              <div>
                <span className="text-zinc-500">Raw YT Time:</span> {props.rawVideoTimeSec.toFixed(2)}s
              </div>
              <div>
                <span className="text-zinc-500">Interpolated:</span> {Math.round(props.interpolatedTimeMs)} ms
              </div>
              <div className="col-span-2">
                <span className="text-zinc-500">Latency Offset:</span> {props.latencyOffsetMs >= 0 ? `+${props.latencyOffsetMs}` : props.latencyOffsetMs} ms
              </div>
            </div>
            {props.ytError && (
              <div className="text-[10px] text-rose-400 bg-rose-950/40 p-1.5 rounded border border-rose-900/60 break-words">
                [Code {props.ytError.code}] {props.ytError.message}
              </div>
            )}
          </section>

          {/* Group 3: Scoring & Smart Vocal Breakdown */}
          <section className="bg-zinc-900/50 rounded-lg p-2.5 border border-zinc-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-zinc-400 font-semibold border-b border-zinc-800 pb-1">
              <span>3. SCORING & SMART VOCAL</span>
              <span className="px-1.5 py-0.2 rounded text-[10px] bg-indigo-950/80 text-indigo-300 border border-indigo-800">
                {props.score.mode.toUpperCase()}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-zinc-300">
              <div>
                <span className="text-zinc-500">Score:</span>{' '}
                <span className="text-emerald-400 font-bold text-sm">{props.score.score}</span>{' '}
                <span className="text-zinc-500 text-[10px]">({props.score.rating} Tier)</span>
              </div>
              <div>
                <span className="text-zinc-500">Accuracy:</span> {props.score.accuracyPct}%
              </div>
              <div>
                <span className="text-zinc-500">Combo:</span> {props.score.combo}{' '}
                <span className="text-zinc-500 text-[10px]">(Max: {props.score.maxCombo})</span>
              </div>
              <div>
                <span className="text-zinc-500">Cents Delta:</span>{' '}
                {props.score.centsDelta !== null
                  ? `${props.score.centsDelta >= 0 ? '+' : ''}${props.score.centsDelta.toFixed(1)}c`
                  : '—'}
              </div>
              <div className="col-span-2 text-[10px] text-zinc-500 border-t border-zinc-800/50 pt-1">
                Ticks: Active {props.score.activeTicks} | Vocal {props.score.validVocalTicks}
              </div>
            </div>

            {/* 4 Smart Vocal Metrics Breakdown */}
            <div className="pt-1.5 space-y-1 border-t border-zinc-800">
              <span className="text-[10px] font-semibold text-zinc-400">4 SMART VOCAL METRICS:</span>
              <div className="space-y-1 text-[11px]">
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">1. In-Tune Accuracy (40%):</span>
                  <span className="text-zinc-200 font-semibold">{props.score.breakdown.inTuneAccuracy}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">2. Stability & Clarity (25%):</span>
                  <span className="text-zinc-200 font-semibold">{props.score.breakdown.stabilityClarity}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">3. Active Coverage (20%):</span>
                  <span className="text-zinc-200 font-semibold">{props.score.breakdown.activeVocalCoverage}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-zinc-400">4. Melodic Variety (15%):</span>
                  <span className="text-zinc-200 font-semibold">{props.score.breakdown.melodicVariety}%</span>
                </div>
              </div>
            </div>
          </section>

          {/* Action button: Export Diagnostics */}
          <button
            type="button"
            onClick={handleExportDiagnostics}
            className="w-full py-2 px-3 rounded-lg bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-100 font-semibold flex items-center justify-center gap-2 border border-zinc-700 transition-colors cursor-pointer text-xs shadow"
          >
            <svg
              className="w-4 h-4 text-emerald-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export Diagnostics JSON
          </button>
        </div>
      )}
    </div>
  );
};
