import React from 'react';
import type {
  PlayerState,
  ScoreSnapshot,
  ScoringMode,
  SmoothedPitchFrame,
  SongData,
} from '../types/karaoke';
import { midiToNoteName } from '../engines/noteUtils';

export interface PitchTrackProps {
  mode: ScoringMode;
  activeSong: SongData | null;
  interpolatedTimeMs: number;
  latencyOffsetMs: number;
  pitch: SmoothedPitchFrame;
  score: ScoreSnapshot;
  playerState: PlayerState;
}

// Vocal MIDI Range: A2 (45) ~ 110Hz to A5 (81) ~ 880Hz (36 semitones)
const MIN_MIDI = 45;
const MAX_MIDI = 81;
const MIDI_SPAN = MAX_MIDI - MIN_MIDI;

// Horizontal timeline window: 1.5s past to 4.5s upcoming (6s total)
const WINDOW_PAST_MS = 1500;
const WINDOW_FUTURE_MS = 4500;
const TOTAL_WINDOW_MS = WINDOW_PAST_MS + WINDOW_FUTURE_MS;
const PLAYHEAD_PCT = (WINDOW_PAST_MS / TOTAL_WINDOW_MS) * 100; // 25%

// Key musical reference lines for vocal grid
const REFERENCE_NOTES = [
  { midi: 81, label: 'A5' },
  { midi: 72, label: 'C5' },
  { midi: 67, label: 'G4' },
  { midi: 60, label: 'C4' }, // Middle C
  { midi: 55, label: 'G3' },
  { midi: 48, label: 'C3' },
  { midi: 45, label: 'A2' },
];

export const PitchTrack: React.FC<PitchTrackProps> = ({
  mode,
  activeSong,
  interpolatedTimeMs,
  latencyOffsetMs,
  pitch,
  score,
  playerState,
}) => {
  // Timeline synchronization for Tier 1 Exact Melody
  const effectiveTimeMs = activeSong
    ? interpolatedTimeMs - latencyOffsetMs - activeSong.offsetMs
    : interpolatedTimeMs - latencyOffsetMs;

  // Filter notes visible within [-1500ms, +4500ms]
  const visibleNotes =
    mode === 'exact' && activeSong
      ? activeSong.notes.filter(
          (n) =>
            n.endMs >= effectiveTimeMs - WINDOW_PAST_MS &&
            n.startMs <= effectiveTimeMs + WINDOW_FUTURE_MS
        )
      : [];

  // Singer cursor vertical position (clamped to MIDI lane range)
  const isVocalActive = pitch.isValid && pitch.midi !== null;
  const clampedSingerMidi = isVocalActive
    ? Math.max(MIN_MIDI, Math.min(MAX_MIDI, pitch.midi as number))
    : null;
  const singerYPct =
    clampedSingerMidi !== null
      ? ((MAX_MIDI - clampedSingerMidi) / MIDI_SPAN) * 100
      : null;

  // Tuning accuracy evaluation for visual styling
  const centsDelta = score.centsDelta;
  const absCents = centsDelta !== null ? Math.abs(centsDelta) : null;
  const isPerfect = isVocalActive && absCents !== null && absCents <= 25;
  const isInTune = isVocalActive && absCents !== null && absCents <= 50;

  // Cursor color styling based on pitch match
  let cursorColorClass = 'bg-zinc-400 border-zinc-200 shadow-zinc-500/50';
  let cursorGlowClass = '';
  if (isVocalActive) {
    if (isPerfect) {
      cursorColorClass = 'bg-emerald-400 border-white shadow-emerald-400';
      cursorGlowClass = 'ring-4 ring-emerald-400/40 shadow-[0_0_16px_rgba(52,211,153,0.9)]';
    } else if (isInTune) {
      cursorColorClass = 'bg-amber-400 border-amber-100 shadow-amber-400';
      cursorGlowClass = 'ring-4 ring-amber-400/30 shadow-[0_0_12px_rgba(251,191,36,0.8)]';
    } else {
      cursorColorClass = 'bg-rose-400 border-rose-200 shadow-rose-400';
      cursorGlowClass = 'shadow-[0_0_8px_rgba(244,63,94,0.6)]';
    }
  }

  // Tier 2 Target Semitone Lane calculation
  const targetMidi =
    score.targetMidi ?? (isVocalActive && pitch.midi ? Math.round(pitch.midi) : null);
  const targetYPct =
    targetMidi !== null && targetMidi >= MIN_MIDI && targetMidi <= MAX_MIDI
      ? ((MAX_MIDI - targetMidi) / MIDI_SPAN) * 100
      : null;

  return (
    <div className="w-full space-y-2 select-none">
      {/* Live Vocal HUD Bar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-3 px-2.5 sm:px-3 py-1.5 rounded-lg bg-zinc-900/90 border border-zinc-800 text-xs">
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          <span className="text-zinc-500 font-semibold uppercase text-[10px] tracking-wider shrink-0">
            {mode === 'exact' ? '🎯 Tier 1: Exact Melody' : '✨ Tier 2: Vocal Performance'}
          </span>
          <div className="flex items-center gap-1 font-mono">
            <span className="text-zinc-400 text-[10px] sm:text-[11px]">Nốt:</span>
            <span className="font-bold text-zinc-100 min-w-7 text-[11px] sm:text-xs">
              {pitch.noteName ? (
                <span className={isPerfect ? 'text-emerald-400' : isInTune ? 'text-amber-400' : 'text-cyan-300'}>
                  {pitch.noteName}
                </span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </span>
          </div>

          <div className="hidden md:flex items-center gap-1 font-mono">
            <span className="text-zinc-400 text-[11px]">Hz:</span>
            <span className="text-zinc-300 min-w-14 text-xs">
              {pitch.hz ? `${pitch.hz.toFixed(1)} Hz` : '—'}
            </span>
          </div>

          <div className="flex items-center gap-1 font-mono">
            <span className="text-zinc-400 text-[10px] sm:text-[11px]">Độ lệch:</span>
            <span className="min-w-10 text-[11px] sm:text-xs">
              {centsDelta !== null ? (
                <span
                  className={`font-semibold ${
                    isPerfect
                      ? 'text-emerald-400'
                      : isInTune
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                >
                  {centsDelta >= 0 ? '+' : ''}
                  {centsDelta.toFixed(0)}c
                </span>
              ) : (
                <span className="text-zinc-600">—</span>
              )}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0 ml-auto">
          <div className="flex items-center gap-1">
            <span className="text-[10px] uppercase font-semibold text-zinc-500">Combo</span>
            <span
              className={`font-black text-xs sm:text-sm px-1.5 sm:px-2 py-0.5 rounded font-mono ${
                score.combo > 0
                  ? 'bg-amber-950/70 text-amber-400 border border-amber-800'
                  : 'bg-zinc-800 text-zinc-500'
              }`}
            >
              {score.combo}
            </span>
          </div>
          {playerState !== 'PLAYING' && (
            <span className="text-[10px] text-zinc-500 hidden sm:inline">
              (Tạm dừng)
            </span>
          )}
        </div>
      </div>

      {/* Main Pitch Track Lane (Strictly GPU-composited CSS transforms, ZERO canvas redraw) */}
      <div className="relative w-full h-36 sm:h-48 bg-gradient-to-b from-zinc-950 via-zinc-900 to-zinc-950 rounded-xl border border-zinc-800 overflow-hidden shadow-inner">
        {/* Horizontal Pitch Reference Grid Lines */}
        {REFERENCE_NOTES.map(({ midi, label }) => {
          const yPct = ((MAX_MIDI - midi) / MIDI_SPAN) * 100;
          const isOctaveC = label.startsWith('C');
          return (
            <div
              key={midi}
              className="absolute left-0 right-0 pointer-events-none flex items-center"
              style={{
                top: `${yPct}%`,
                transform: 'translate3d(0, -50%, 0)',
              }}
            >
              <div
                className={`w-full border-b ${
                  isOctaveC
                    ? 'border-zinc-700/60'
                    : 'border-zinc-800/40 border-dashed'
                }`}
              />
              <span
                className={`absolute left-1.5 text-[9px] font-mono select-none px-1 rounded ${
                  isOctaveC
                    ? 'text-zinc-400 bg-zinc-900/80 font-bold'
                    : 'text-zinc-600 bg-zinc-950/60'
                }`}
              >
                {label}
              </span>
            </div>
          );
        })}

        {/* Tier 2 Smart Vocal Mode: Active Semitone Target Ribbon */}
        {mode === 'smart' && targetYPct !== null && (
          <div
            className={`absolute left-0 right-0 h-6 -translate-y-1/2 pointer-events-none transition-colors duration-150 border-y ${
              isPerfect
                ? 'bg-emerald-500/20 border-emerald-400/80 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : isInTune
                  ? 'bg-amber-500/20 border-amber-400/80 shadow-[0_0_12px_rgba(245,158,11,0.25)]'
                  : isVocalActive
                    ? 'bg-rose-500/15 border-rose-500/50'
                    : 'bg-zinc-800/25 border-zinc-700/40'
            }`}
            style={{
              top: `${targetYPct}%`,
              transform: 'translate3d(0, -50%, 0)',
            }}
          >
            <div className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-mono font-semibold text-zinc-400/80">
              {targetMidi !== null ? midiToNoteName(targetMidi) : ''}
            </div>
          </div>
        )}

        {/* Tier 1 Exact Melody Mode: Target Note Bars */}
        {mode === 'exact' &&
          visibleNotes.map((note, idx) => {
            const dtStart = note.startMs - effectiveTimeMs;
            const dtEnd = note.endMs - effectiveTimeMs;
            const durationMs = note.endMs - note.startMs;

            const leftPct = PLAYHEAD_PCT + (dtStart / TOTAL_WINDOW_MS) * 100;
            const widthPct = Math.max(0.6, (durationMs / TOTAL_WINDOW_MS) * 100);
            const clampedMidi = Math.max(MIN_MIDI, Math.min(MAX_MIDI, note.midiNote));
            const topPct = ((MAX_MIDI - clampedMidi) / MIDI_SPAN) * 100;

            const isNoteActive = dtStart <= 0 && dtEnd > 0;
            const isNoteHit = isNoteActive && isVocalActive && isInTune;
            const isNotePerfect = isNoteActive && isVocalActive && isPerfect;

            let noteStyleClasses =
              'bg-indigo-600/70 border-indigo-400/60 shadow-[0_0_6px_rgba(99,102,241,0.4)]';
            if (isNotePerfect) {
              noteStyleClasses =
                'bg-emerald-400 border-white shadow-[0_0_16px_rgba(52,211,153,0.95)] animate-pulse';
            } else if (isNoteHit) {
              noteStyleClasses =
                'bg-amber-400 border-amber-100 shadow-[0_0_12px_rgba(251,191,36,0.9)]';
            } else if (isNoteActive) {
              noteStyleClasses =
                'bg-cyan-500/80 border-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.6)]';
            }

            return (
              <div
                key={`${note.startMs}-${note.midiNote}-${idx}`}
                className={`absolute h-3.5 rounded-full border text-[9px] font-mono font-bold flex items-center px-1 text-white overflow-hidden pointer-events-none transition-transform duration-75 ${noteStyleClasses}`}
                style={{
                  top: `${topPct}%`,
                  left: `${leftPct}%`,
                  width: `${widthPct}%`,
                  transform: 'translate3d(0, -50%, 0)',
                }}
              >
                <span className="truncate drop-shadow">{midiToNoteName(note.midiNote)}</span>
              </div>
            );
          })}

        {/* Fixed "Now" Playhead Line (25% from left) */}
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-gradient-to-b from-cyan-400 via-teal-300 to-emerald-400 pointer-events-none shadow-[0_0_8px_rgba(45,212,191,0.8)] z-10"
          style={{
            left: `${PLAYHEAD_PCT}%`,
            transform: 'translate3d(-50%, 0, 0)',
          }}
        >
          <div className="absolute top-1 -left-2.5 px-1 py-0.2 rounded bg-cyan-900/90 border border-cyan-400 text-[8px] font-bold text-cyan-200 uppercase tracking-tighter">
            NOW
          </div>
        </div>

        {/* Singer Live Vocal Pitch Cursor (GPU CSS transform) */}
        {singerYPct !== null && (
          <div
            className="absolute pointer-events-none z-20 transition-transform duration-75 ease-out"
            style={{
              left: `${PLAYHEAD_PCT}%`,
              top: `${singerYPct}%`,
              transform: 'translate3d(-50%, -50%, 0)',
            }}
          >
            {/* Pulsing Aura */}
            <div
              className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${cursorColorClass} ${cursorGlowClass}`}
            >
              <div className="w-1.5 h-1.5 rounded-full bg-white" />
            </div>

            {/* Vocal Note Tag Callout */}
            <div className="absolute left-6 top-1/2 -translate-y-1/2 whitespace-nowrap px-1.5 py-0.5 rounded bg-zinc-900/95 border border-zinc-700 text-[10px] font-mono font-bold text-zinc-100 shadow-md">
              <span>{pitch.noteName ?? ''}</span>
              {centsDelta !== null && (
                <span
                  className={`ml-1 text-[9px] ${
                    isPerfect
                      ? 'text-emerald-400'
                      : isInTune
                        ? 'text-amber-400'
                        : 'text-rose-400'
                  }`}
                >
                  ({centsDelta >= 0 ? '+' : ''}
                  {centsDelta.toFixed(0)}c)
                </span>
              )}
            </div>
          </div>
        )}

        {/* Empty / Silent Hint when Singer is not detected */}
        {!isVocalActive && (
          <div className="absolute bottom-2 right-3 text-[10px] text-zinc-500 font-mono flex items-center gap-1.5 pointer-events-none">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-zinc-600 animate-ping" />
            Đang lắng nghe giọng hát...
          </div>
        )}
      </div>
    </div>
  );
};
