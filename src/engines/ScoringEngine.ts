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
  private sustainedRefMidi: number | null = null;
  private sustainedTicks = 0;
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
    this.sustainedRefMidi = null;
    this.sustainedTicks = 0;
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
    const { interpolatedTimeMs, latencyOffsetMs, playerState, pitch } = input;
    const tickDurationMs = input.tickDurationMs ?? 50;

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

      // 2. Stability & Clarity
      if (this.sustainedRefMidi === null) {
        this.sustainedRefMidi = pitch.midi;
        this.sustainedTicks = 1;
      } else {
        const diffFromRef = Math.abs(getCentsDiff(pitch.midi, this.sustainedRefMidi));
        if (diffFromRef <= 35) {
          this.sustainedTicks++;
        } else {
          this.sustainedRefMidi = pitch.midi;
          this.sustainedTicks = 1;
        }
      }

      const sustainedDurationMs = this.sustainedTicks * tickDurationMs;
      let tickStabilityScore: number;
      if (sustainedDurationMs >= 200) {
        tickStabilityScore = 100;
      } else {
        const stabilityFactor = (sustainedDurationMs / 200) * 100;
        const clarityScore = Math.min(100, Math.max(0, pitch.clarity * 100));
        tickStabilityScore = 0.5 * clarityScore + 0.5 * stabilityFactor;
      }
      this.stabilityClaritySum += tickStabilityScore;

      // 3. Melodic Variety
      const roundedMidi = Math.round(pitch.midi);
      this.noteTickCounts.set(roundedMidi, (this.noteTickCounts.get(roundedMidi) ?? 0) + 1);
    } else {
      // Silence or invalid pitch breaks sustained note
      this.sustainedRefMidi = null;
      this.sustainedTicks = 0;
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

    let activeVocalCoverage = 0;
    if (this.activeTicks > 0 && this.validVocalTicks > 0) {
      activeVocalCoverage = Math.min(100, ((this.validVocalTicks / this.activeTicks) / 0.45) * 100);
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

    // Mode-specific calculations
    if (this.mode === 'exact' && this.song) {
      const effectiveTimeMs = interpolatedTimeMs - latencyOffsetMs - this.song.offsetMs;
      const activeNote: NoteEvent | undefined = this.song.notes.find(
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
            // > 50 cents miss
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

    // Tier 2: Smart Vocal Score
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
    if (this.validVocalTicks > 0) {
      score = Math.round(
        0.4 * inTuneAccuracy +
          0.25 * stabilityClarity +
          0.2 * activeVocalCoverage +
          0.15 * melodicVariety
      );
    }

    const accuracyPct = Math.round(inTuneAccuracy);
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
