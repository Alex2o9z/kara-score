import { describe, expect, it } from 'vitest';
import {
  getCentsDiff,
  getNearestSemitoneCentsDiff,
  hzToMidi,
  midiToHz,
  midiToNoteName,
} from './noteUtils';

describe('noteUtils', () => {
  describe('hzToMidi & midiToHz conversions', () => {
    it('converts 440 Hz exactly to MIDI 69 (A4)', () => {
      expect(hzToMidi(440)).toBeCloseTo(69, 5);
      expect(midiToHz(69)).toBeCloseTo(440, 5);
    });

    it('converts 261.625565 Hz close to MIDI 60 (C4)', () => {
      expect(hzToMidi(261.625565)).toBeCloseTo(60, 4);
      expect(midiToHz(60)).toBeCloseTo(261.625565, 4);
    });

    it('handles octave relationships correctly', () => {
      // A3 (220 Hz) -> 57, A5 (880 Hz) -> 81
      expect(hzToMidi(220)).toBeCloseTo(57, 5);
      expect(hzToMidi(880)).toBeCloseTo(81, 5);
      expect(midiToHz(57)).toBeCloseTo(220, 5);
      expect(midiToHz(81)).toBeCloseTo(880, 5);
    });

    it('returns safe fallback for non-positive or non-finite inputs', () => {
      expect(hzToMidi(0)).toBe(0);
      expect(hzToMidi(-100)).toBe(0);
      expect(hzToMidi(Number.NaN)).toBe(0);
      expect(hzToMidi(Number.POSITIVE_INFINITY)).toBe(0);

      expect(midiToHz(Number.NaN)).toBe(0);
      expect(midiToHz(Number.POSITIVE_INFINITY)).toBe(0);
    });
  });

  describe('midiToNoteName', () => {
    it('formats exact MIDI note numbers correctly', () => {
      expect(midiToNoteName(69)).toBe('A4');
      expect(midiToNoteName(60)).toBe('C4');
      expect(midiToNoteName(61)).toBe('C#4');
      expect(midiToNoteName(21)).toBe('A0');
      expect(midiToNoteName(108)).toBe('C8');
    });

    it('handles rounding behavior near semitone boundaries', () => {
      // 59.6 should round to 60 -> C4
      expect(midiToNoteName(59.6)).toBe('C4');
      // 60.4 should round to 60 -> C4
      expect(midiToNoteName(60.4)).toBe('C4');
      // 60.5 should round to 61 -> C#4
      expect(midiToNoteName(60.5)).toBe('C#4');
      // 68.9 should round to 69 -> A4
      expect(midiToNoteName(68.9)).toBe('A4');
    });

    it('returns empty string for non-finite MIDI numbers', () => {
      expect(midiToNoteName(Number.NaN)).toBe('');
      expect(midiToNoteName(Number.POSITIVE_INFINITY)).toBe('');
    });
  });

  describe('getCentsDiff', () => {
    it('returns 0 for exact match', () => {
      expect(getCentsDiff(60, 60)).toBe(0);
      expect(getCentsDiff(69, 69)).toBe(0);
    });

    it('returns +100 for +1 semitone deviation', () => {
      expect(getCentsDiff(61, 60)).toBe(100);
      expect(getCentsDiff(70, 69)).toBe(100);
    });

    it('returns -25 for -0.25 semitone deviation', () => {
      expect(getCentsDiff(59.75, 60)).toBeCloseTo(-25, 5);
      expect(getCentsDiff(68.75, 69)).toBeCloseTo(-25, 5);
    });
  });

  describe('getNearestSemitoneCentsDiff', () => {
    it('returns signed deviation within [-50, +50] cents', () => {
      expect(getNearestSemitoneCentsDiff(60.0)).toBe(0);
      expect(getNearestSemitoneCentsDiff(60.2)).toBeCloseTo(20, 5);
      expect(getNearestSemitoneCentsDiff(59.8)).toBeCloseTo(-20, 5);
      expect(getNearestSemitoneCentsDiff(60.49)).toBeCloseTo(49, 5);
      expect(getNearestSemitoneCentsDiff(60.5)).toBe(-50); // Math.round(60.5) = 61 -> (60.5 - 61) * 100 = -50
    });
  });
});
