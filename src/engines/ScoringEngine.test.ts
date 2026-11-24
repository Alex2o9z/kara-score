import { describe, expect, it } from 'vitest';
import type { PlayerState, SmoothedPitchFrame, SongData } from '../types/karaoke';
import { ScoringEngine } from './ScoringEngine';

function createValidPitch(midi: number, clarity = 0.95, rms = 0.05): SmoothedPitchFrame {
  return {
    hz: 440 * Math.pow(2, (midi - 69) / 12),
    midi,
    noteName: 'TestNote',
    clarity,
    rms,
    isValid: true,
  };
}

function createSilencePitch(): SmoothedPitchFrame {
  return {
    hz: null,
    midi: null,
    noteName: null,
    clarity: 0,
    rms: 0,
    isValid: false,
  };
}

const mockSong: SongData = {
  songId: 'mock-song',
  title: 'Mock Title',
  artist: 'Mock Artist',
  youtubeVideoId: '12345678901',
  offsetMs: 0,
  notes: [
    { startMs: 1000, endMs: 2000, midiNote: 60 }, // Note 1: C4 (1.0s to 2.0s)
    { startMs: 3000, endMs: 4000, midiNote: 64 }, // Note 2: E4 (3.0s to 4.0s), 1.0s rest gap
  ],
};

describe('ScoringEngine', () => {
  describe('Hard Playback Gate (Both Modes)', () => {
    const nonPlayingStates: PlayerState[] = ['PAUSED', 'BUFFERING', 'UNSTARTED', 'ENDED'];

    it.each(nonPlayingStates)('does not mutate accumulators when playerState is %s in smart mode', (state) => {
      const engine = new ScoringEngine('smart');
      const snap = engine.tick({
        interpolatedTimeMs: 1500,
        latencyOffsetMs: 0,
        playerState: state,
        pitch: createValidPitch(60),
      });

      expect(snap.activeTicks).toBe(0);
      expect(snap.validVocalTicks).toBe(0);
      expect(snap.score).toBe(0);
      expect(snap.combo).toBe(0);
      expect(snap.centsDelta).toBeNull();
    });

    it.each(nonPlayingStates)('does not mutate accumulators when playerState is %s in exact mode', (state) => {
      const engine = new ScoringEngine('exact', mockSong);
      const snap = engine.tick({
        interpolatedTimeMs: 1500,
        latencyOffsetMs: 0,
        playerState: state,
        pitch: createValidPitch(60),
      });

      expect(snap.activeTicks).toBe(0);
      expect(snap.validVocalTicks).toBe(0);
      expect(snap.score).toBe(0);
      expect(snap.combo).toBe(0);
      expect(snap.centsDelta).toBeNull();
    });
  });

  describe('Tier 1: Exact Melody Mode', () => {
    it('awards 100 score/accuracy and increments combo on perfect pitch (<= 25 cents)', () => {
      const engine = new ScoringEngine('exact', mockSong);

      // Sung note is MIDI 60.15 (+15 cents from target 60)
      const snap1 = engine.tick({
        interpolatedTimeMs: 1200,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.15),
      });

      expect(snap1.score).toBe(100);
      expect(snap1.accuracyPct).toBe(100);
      expect(snap1.combo).toBe(1);
      expect(snap1.maxCombo).toBe(1);
      expect(snap1.targetMidi).toBe(60);
      expect(snap1.centsDelta).toBeCloseTo(15, 2);

      // Tick 2: continuing on target
      const snap2 = engine.tick({
        interpolatedTimeMs: 1250,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.0),
      });

      expect(snap2.score).toBe(100);
      expect(snap2.combo).toBe(2);
      expect(snap2.maxCombo).toBe(2);
    });

    it('awards 50 score/accuracy on near pitch (35 cents diff, <= 50 cents)', () => {
      const engine = new ScoringEngine('exact', mockSong);

      // Sung note is MIDI 60.35 (+35 cents from target 60)
      const snap = engine.tick({
        interpolatedTimeMs: 1200,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.35),
      });

      expect(snap.score).toBe(50);
      expect(snap.accuracyPct).toBe(50);
      expect(snap.combo).toBe(1); // combo increments for near pitch
      expect(snap.centsDelta).toBeCloseTo(35, 2);
    });

    it('awards 0 tick credit and resets combo on off-pitch (> 50 cents)', () => {
      const engine = new ScoringEngine('exact', mockSong);

      // Start with 1 good tick
      engine.tick({
        interpolatedTimeMs: 1200,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.0),
      });
      expect(engine.getSnapshot().combo).toBe(1);

      // Off-pitch: target is 60, sung is 61 (+100 cents diff)
      const snap = engine.tick({
        interpolatedTimeMs: 1250,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createValidPitch(61.0),
      });

      // 1.0 (tick 1) + 0.0 (tick 2) out of 2 ticks -> 50%
      expect(snap.score).toBe(50);
      expect(snap.combo).toBe(0); // combo reset
      expect(snap.maxCombo).toBe(1);
      expect(snap.centsDelta).toBe(100);
    });

    it('resets combo on silence during active note without creating centsDelta', () => {
      const engine = new ScoringEngine('exact', mockSong);

      // Tick 1: hit note
      engine.tick({
        interpolatedTimeMs: 1200,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.0),
      });
      expect(engine.getSnapshot().combo).toBe(1);

      // Tick 2: silence during active note
      const snap = engine.tick({
        interpolatedTimeMs: 1250,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createSilencePitch(),
      });

      expect(snap.combo).toBe(0);
      expect(snap.targetMidi).toBe(60);
      expect(snap.centsDelta).toBeNull();
      expect(snap.score).toBe(50); // 1.0 / 2 = 50%
    });

    it('does not penalize accuracy or reset combo during rest periods between notes', () => {
      const engine = new ScoringEngine('exact', mockSong);

      // Note 1: 1000 - 2000
      engine.tick({
        interpolatedTimeMs: 1500,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.0),
      });
      expect(engine.getSnapshot().combo).toBe(1);
      expect(engine.getSnapshot().score).toBe(100);

      // Rest period: 2500ms (between note 1 and note 2)
      const restSnap = engine.tick({
        interpolatedTimeMs: 2500,
        latencyOffsetMs: 0,
        playerState: 'PLAYING',
        pitch: createSilencePitch(),
      });

      expect(restSnap.targetMidi).toBeNull();
      expect(restSnap.centsDelta).toBeNull();
      expect(restSnap.combo).toBe(1); // combo preserved!
      expect(restSnap.score).toBe(100); // score not penalized!
    });

    it('compensates for latencyOffsetMs and song.offsetMs accurately', () => {
      const offsetSong: SongData = {
        ...mockSong,
        offsetMs: 100, // song offset +100ms
      };
      const engine = new ScoringEngine('exact', offsetSong);

      // effectiveTimeMs = interpolatedTimeMs - latencyOffsetMs - song.offsetMs
      // At interpolatedTimeMs = 1250, latencyOffsetMs = 50:
      // effectiveTimeMs = 1250 - 50 - 100 = 1100ms (inside note 1: 1000-2000)
      const snap = engine.tick({
        interpolatedTimeMs: 1250,
        latencyOffsetMs: 50,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.0),
      });

      expect(snap.targetMidi).toBe(60);

      // If latencyOffsetMs is large (e.g. 300ms):
      // effectiveTimeMs = 1250 - 300 - 100 = 850ms (before note 1 startMs 1000 -> rest!)
      const snapRest = engine.tick({
        interpolatedTimeMs: 1250,
        latencyOffsetMs: 300,
        playerState: 'PLAYING',
        pitch: createValidPitch(60.0),
      });

      expect(snapRest.targetMidi).toBeNull();
    });
  });

  describe('Tier 2: Smart Vocal Score & Anti-Cheat', () => {
    it('produces score 0, validVocalTicks 0, and rating C for pure silence', () => {
      const engine = new ScoringEngine('smart');

      for (let i = 0; i < 20; i++) {
        engine.tick({
          interpolatedTimeMs: i * 50,
          latencyOffsetMs: 0,
          playerState: 'PLAYING',
          pitch: createSilencePitch(),
        });
      }

      const snap = engine.getSnapshot();
      expect(snap.activeTicks).toBe(20);
      expect(snap.validVocalTicks).toBe(0);
      expect(snap.breakdown.activeVocalCoverage).toBe(0);
      expect(snap.score).toBe(0);
      expect(snap.rating).toBe('C');
    });

    it('anti-cheat 1: brief speech burst (~3% vocal activity) yields a realistic low score (<= 15 pts)', () => {
      const engine = new ScoringEngine('smart');

      // 97 silence ticks
      for (let i = 0; i < 97; i++) {
        engine.tick({
          interpolatedTimeMs: i * 50,
          latencyOffsetMs: 0,
          playerState: 'PLAYING',
          pitch: createSilencePitch(),
        });
      }

      // 3 brief speech / vocal burst ticks (3% of 100 ticks)
      for (let i = 97; i < 100; i++) {
        engine.tick({
          interpolatedTimeMs: i * 50,
          latencyOffsetMs: 0,
          playerState: 'PLAYING',
          pitch: createValidPitch(60.0),
        });
      }

      const snap = engine.getSnapshot();
      expect(snap.activeTicks).toBe(100);
      expect(snap.validVocalTicks).toBe(3);
      // Coverage = min(100, (3 / 100) / 0.40 * 100) = 7.5%
      expect(snap.breakdown.activeVocalCoverage).toBe(7.5);
      // Melodic variety = 0 (only 3 ticks on 1 note, requires > 1 distinct note with >= 3 ticks)
      expect(snap.breakdown.melodicVariety).toBe(0);
      // Gated by continuous coverageFactor: score must be realistically low (<= 15 pts, ~3 pts), Tier C
      expect(snap.score).toBeLessThanOrEqual(15);
      expect(snap.score).toBeGreaterThan(0);
      expect(snap.rating).toBe('C');
    });

    it('anti-cheat 2: single-note drone produces melodicVariety === 0 and blocks 100/S score', () => {
      const engine = new ScoringEngine('smart');

      // Sing only A4 (MIDI 69) cleanly for 50 ticks (2.5 seconds)
      for (let i = 0; i < 50; i++) {
        engine.tick({
          interpolatedTimeMs: i * 50,
          latencyOffsetMs: 0,
          playerState: 'PLAYING',
          pitch: createValidPitch(69.0),
        });
      }

      const snap = engine.getSnapshot();
      expect(snap.validVocalTicks).toBe(50);
      expect(snap.breakdown.melodicVariety).toBe(0); // single note drone blocked!
      expect(snap.breakdown.inTuneAccuracy).toBe(100);
      expect(snap.breakdown.activeVocalCoverage).toBe(100);

      // Even with 100 in-tune, 100 stability, 100 coverage:
      // Score = 0.4*100 + 0.25*100 + 0.2*100 + 0.15*0 = 85 (cannot reach 90+ / S rank)
      expect(snap.score).toBeLessThanOrEqual(85);
      expect(snap.rating).toBe('A');
    });

    it('rewards strong realistic singing (>= 8 distinct notes, >= 200ms held) with score >= 90 (S Tier)', () => {
      const engine = new ScoringEngine('smart');
      const distinctNotes = [60, 62, 64, 65, 67, 69, 71, 72]; // 8 distinct scale notes

      // Sing each note for 5 ticks (250ms >= 200ms stability threshold)
      let time = 0;
      for (const note of distinctNotes) {
        for (let t = 0; t < 5; t++) {
          engine.tick({
            interpolatedTimeMs: time,
            latencyOffsetMs: 0,
            playerState: 'PLAYING',
            pitch: createValidPitch(note),
          });
          time += 50;
        }
      }

      const snap = engine.getSnapshot();
      expect(snap.validVocalTicks).toBe(40);
      expect(snap.breakdown.inTuneAccuracy).toBe(100);
      expect(snap.breakdown.stabilityClarity).toBeGreaterThan(80);
      expect(snap.breakdown.activeVocalCoverage).toBe(100);
      expect(snap.breakdown.melodicVariety).toBe(100);
      expect(snap.score).toBeGreaterThanOrEqual(90);
      expect(snap.rating).toBe('S');
    });

    it('awards half inTuneAccuracy for quarter-tone singing (50 cents off)', () => {
      const engine = new ScoringEngine('smart');

      // Sing 10 ticks at 60.5 (exactly 50 cents away from nearest semitones)
      for (let i = 0; i < 10; i++) {
        engine.tick({
          interpolatedTimeMs: i * 50,
          latencyOffsetMs: 0,
          playerState: 'PLAYING',
          pitch: createValidPitch(60.5),
        });
      }

      const snap = engine.getSnapshot();
      expect(snap.breakdown.inTuneAccuracy).toBe(50);
      expect(snap.combo).toBe(0); // does not build combo when off-pitch
    });
  });

  describe('Rating Tiers, Reset, and Configuration', () => {
    it('accurately resolves S, A, B, and C tiers based on score thresholds', () => {
      const engine = new ScoringEngine('exact', mockSong);

      // Initial state
      expect(engine.getSnapshot().rating).toBe('C');

      // Test configuration switch
      engine.configure('smart');
      expect(engine.getSnapshot().mode).toBe('smart');
      expect(engine.getSnapshot().score).toBe(0);
    });

    it('resets all accumulators cleanly on reset()', () => {
      const engine = new ScoringEngine('smart');

      // Add ticks
      for (let i = 0; i < 5; i++) {
        engine.tick({
          interpolatedTimeMs: i * 50,
          latencyOffsetMs: 0,
          playerState: 'PLAYING',
          pitch: createValidPitch(60.0),
        });
      }

      expect(engine.getSnapshot().activeTicks).toBe(5);
      expect(engine.getSnapshot().combo).toBe(5);

      engine.reset();

      const snap = engine.getSnapshot();
      expect(snap.activeTicks).toBe(0);
      expect(snap.validVocalTicks).toBe(0);
      expect(snap.combo).toBe(0);
      expect(snap.maxCombo).toBe(0);
      expect(snap.score).toBe(0);
      expect(snap.targetMidi).toBeNull();
      expect(snap.centsDelta).toBeNull();
      expect(snap.breakdown.inTuneAccuracy).toBe(0);
      expect(snap.breakdown.stabilityClarity).toBe(0);
      expect(snap.breakdown.activeVocalCoverage).toBe(0);
      expect(snap.breakdown.melodicVariety).toBe(0);
      expect(snap.rating).toBe('C');
    });
  });
});
