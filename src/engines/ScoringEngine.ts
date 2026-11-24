import type {
  NoteEvent,
  PlayerState,
  ScoreRating,
  ScoreSnapshot,
  ScoringMode,
  SmartVocalBreakdown,
  SmoothedPitchFrame,
  SongData,
} from '../types/karaoke';
import { getCentsDiff, getNearestSemitoneCentsDiff } from './noteUtils';

function computeRating(score: number): ScoreRating {
  if (score >= 90) return 'S';
  if (score >= 75) return 'A';
  if (score >= 60) return 'B';
  return 'C';
}

export class ScoringEngine {
  private mode: ScoringMode = 'smart';
  private song?: SongData;

  // Global & shared accumulators
  private activeTicks = 0;
  private validVocalTicks = 0;
  private combo = 0;
  private maxCombo = 0;

  // Breakdown accumulators
  private inTuneScoreSum = 0;
  private prevMidi: number | null = null;
  private stabilityClaritySum = 0;
  private noteTickCounts = new Map<number, number>();

  // Tier 1 Exact Melody accumulators
  private exactNoteTicks = 0;
  private exactWeightedHits = 0;

  // Latest snapshot cache
  private latestSnapshot: ScoreSnapshot;

  constructor(mode: ScoringMode = 'smart', song?: SongData) {
    this.mode = mode;
    this.song = song;
    this.latestSnapshot = this.createInitialSnapshot();
  }

  private createInitialSnapshot(): ScoreSnapshot {
    return {
      mode: this.mode,
      score: 0,
      accuracyPct: 0,
      combo: 0,
      maxCombo: 0,
      targetMidi: null,
      centsDelta: null,
      activeTicks: 0,
      validVocalTicks: 0,
      breakdown: {
        inTuneAccuracy: 0,
        stabilityClarity: 0,
        activeVocalCoverage: 0,
        melodicVariety: 0,
      },
      rating: 'C',
    };
  }

  public configure(mode: ScoringMode, song?: SongData): void {
    this.mode = mode;
    this.song = song;
    this.reset();
  }

  public reset(): void {
    this.activeTicks = 0;
    this.validVocalTicks = 0;
    this.combo = 0;
    this.maxCombo = 0;

    this.inTuneScoreSum = 0;
    this.prevMidi = null;
    this.stabilityClaritySum = 0;
    this.noteTickCounts.clear();

    this.exactNoteTicks = 0;
    this.exactWeightedHits = 0;

    this.latestSnapshot = this.createInitialSnapshot();
  }

  public getSnapshot(): ScoreSnapshot {
    return {
      ...this.latestSnapshot,
      breakdown: { ...this.latestSnapshot.breakdown },
    };
  }

  public tick(input: {
    interpolatedTimeMs: number;
    latencyOffsetMs: number;
    playerState: PlayerState;
    pitch: SmoothedPitchFrame;
    tickDurationMs?: number;
  }): ScoreSnapshot {
    const { playerState, pitch } = input;

    // Hard Playback Gate: If not PLAYING, do NOT mutate accumulators or combo; return current snapshot with centsDelta: null
    if (playerState !== 'PLAYING') {
      return {
        ...this.latestSnapshot,
        breakdown: { ...this.latestSnapshot.breakdown },
        centsDelta: null,
      };
    }

    this.activeTicks++;

    // Shared vocal breakdown accumulators (computed in BOTH modes)
    if (pitch.isValid && pitch.midi !== null) {
      this.validVocalTicks++;

      // 1. In-Tune Accuracy (nearest-semitone deviation)
      const absNearestCents = Math.abs(getNearestSemitoneCentsDiff(pitch.midi));
      if (absNearestCents <= 25) {
        this.inTuneScoreSum += 100;
      } else if (absNearestCents <= 50) {
        this.inTuneScoreSum += 50;
      }

      // 2. Stability & Clarity (frame-to-frame F0 continuity + pitch clarity, no hard 150ms cutoff)
      const clarityScore = Math.min(100, Math.max(0, pitch.clarity * 100));
      let continuityScore = 100;

      if (this.prevMidi !== null) {
        const deltaCents = Math.abs(getCentsDiff(pitch.midi, this.prevMidi));
        // Within 35 cents: perfect continuity (100). Smooth linear decay to 0 at 100 cents.
        continuityScore = Math.max(0, Math.min(100, (1 - Math.max(0, deltaCents - 35) / 65) * 100));
      }

      const tickStabilityScore = 0.5 * clarityScore + 0.5 * continuityScore;
      this.stabilityClaritySum += tickStabilityScore;
      this.prevMidi = pitch.midi;

      // 3. Melodic Variety tracking
      const roundedMidi = Math.round(pitch.midi);
      this.noteTickCounts.set(roundedMidi, (this.noteTickCounts.get(roundedMidi) ?? 0) + 1);
    } else {
      // Silence or unvoiced break resets continuity anchor
      this.prevMidi = null;
    }

    // Compute breakdown metrics
    const inTuneAccuracy =
      this.validVocalTicks === 0
        ? 0
        : Math.round((this.inTuneScoreSum / this.validVocalTicks) * 10) / 10;

    const stabilityClarity =
      this.validVocalTicks === 0
        ? 0
        : Math.round((this.stabilityClaritySum / this.validVocalTicks) * 10) / 10;

    // Active vocal coverage normalized against a 40% active singing benchmark
    const rawVocalRatio = this.activeTicks > 0 ? this.validVocalTicks / this.activeTicks : 0;
    let activeVocalCoverage = 0;
    if (this.activeTicks > 0 && this.validVocalTicks > 0) {
      activeVocalCoverage = Math.min(100, (rawVocalRatio / 0.40) * 100);
      activeVocalCoverage = Math.round(activeVocalCoverage * 10) / 10;
    }

    let distinctNotes = 0;
    for (const count of this.noteTickCounts.values()) {
      if (count >= 3) {
        distinctNotes++;
      }
    }
    let melodicVariety = 0;
    if (distinctNotes > 1) {
      melodicVariety = Math.min(100, ((distinctNotes - 1) / (8 - 1)) * 100);
      melodicVariety = Math.round(melodicVariety * 10) / 10;
    }

    const breakdown: SmartVocalBreakdown = {
      inTuneAccuracy,
      stabilityClarity,
      activeVocalCoverage,
      melodicVariety,
    };

    // Branch into isolated evaluation helpers
    if (this.mode === 'exact' && this.song) {
      return this.computeExactSnapshot(input, breakdown);
    }

    return this.computeSmartVocalSnapshot(pitch, breakdown);
  }

  /**
   * Tier 1: Exact Melody Snapshot Computation (reference song chart)
   */
  private computeExactSnapshot(
    input: {
      interpolatedTimeMs: number;
      latencyOffsetMs: number;
      pitch: SmoothedPitchFrame;
    },
    breakdown: SmartVocalBreakdown
  ): ScoreSnapshot {
    const { interpolatedTimeMs, latencyOffsetMs, pitch } = input;
    const song = this.song!;
    const effectiveTimeMs = interpolatedTimeMs - latencyOffsetMs - song.offsetMs;

    const activeNote: NoteEvent | undefined = song.notes.find(
      (n) => effectiveTimeMs >= n.startMs && effectiveTimeMs < n.endMs
    );

    let targetMidi: number | null = null;
    let centsDelta: number | null = null;

    if (activeNote) {
      targetMidi = activeNote.midiNote;
      this.exactNoteTicks++;

      if (pitch.isValid && pitch.midi !== null) {
        centsDelta = getCentsDiff(pitch.midi, activeNote.midiNote);
        const absCents = Math.abs(centsDelta);
        if (absCents <= 25) {
          this.exactWeightedHits += 1.0;
          this.combo++;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        } else if (absCents <= 50) {
          this.exactWeightedHits += 0.5;
          this.combo++;
          if (this.combo > this.maxCombo) this.maxCombo = this.combo;
        } else {
          // > 50 cents off-pitch
          this.combo = 0;
        }
      } else {
        // Silence during active note
        this.combo = 0;
      }
    }

    const rawExactScore =
      this.exactNoteTicks === 0
        ? 0
        : (this.exactWeightedHits / this.exactNoteTicks) * 100;
    const score = Math.round(rawExactScore * 10) / 10;
    const accuracyPct = score;
    const rating = computeRating(score);

    this.latestSnapshot = {
      mode: 'exact',
      score,
      accuracyPct,
      combo: this.combo,
      maxCombo: this.maxCombo,
      targetMidi,
      centsDelta,
      activeTicks: this.activeTicks,
      validVocalTicks: this.validVocalTicks,
      breakdown,
      rating,
    };

    return this.latestSnapshot;
  }

  /**
   * Tier 2: Vocal Performance Snapshot Computation (no reference chart)
   * Evaluates pitch stability, semitone precision, and vocal participation.
   * Gated by a continuous coverage factor: Math.min(1, Math.pow(rawVocalRatio / 0.40, 1.2)).
   */
  private computeSmartVocalSnapshot(
    pitch: SmoothedPitchFrame,
    breakdown: SmartVocalBreakdown
  ): ScoreSnapshot {
    let targetMidi: number | null = null;
    let centsDelta: number | null = null;

    if (pitch.isValid && pitch.midi !== null) {
      targetMidi = Math.round(pitch.midi);
      centsDelta = getNearestSemitoneCentsDiff(pitch.midi);
      const absNearestCents = Math.abs(centsDelta);

      if (absNearestCents <= 25) {
        this.combo++;
        if (this.combo > this.maxCombo) {
          this.maxCombo = this.combo;
        }
      } else if (absNearestCents > 50) {
        this.combo = 0;
      }
    }

    let score = 0;
    if (this.validVocalTicks > 0 && this.activeTicks > 0) {
      const rawVocalRatio = this.validVocalTicks / this.activeTicks;
      const coverageFactor = Math.min(1, Math.pow(rawVocalRatio / 0.40, 1.2));

      const baseVocalScore =
        0.4 * breakdown.inTuneAccuracy +
        0.25 * breakdown.stabilityClarity +
        0.2 * breakdown.activeVocalCoverage +
        0.15 * breakdown.melodicVariety;

      score = Math.round(baseVocalScore * coverageFactor);
    }

    const accuracyPct = Math.round(breakdown.inTuneAccuracy);
    const rating = computeRating(score);

    this.latestSnapshot = {
      mode: 'smart',
      score,
      accuracyPct,
      combo: this.combo,
      maxCombo: this.maxCombo,
      targetMidi,
      centsDelta,
      activeTicks: this.activeTicks,
      validVocalTicks: this.validVocalTicks,
      breakdown,
      rating,
    };

    return this.latestSnapshot;
  }
}
