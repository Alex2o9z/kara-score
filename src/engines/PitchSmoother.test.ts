import { beforeEach, describe, expect, it } from 'vitest';
import { PitchSmoother } from './PitchSmoother';

describe('PitchSmoother', () => {
  let smoother: PitchSmoother;

  beforeEach(() => {
    smoother = new PitchSmoother();
  });

  it('processes steady 440 Hz frames with isValid: true and noteName "A4"', () => {
    const raw = { hz: 440, clarity: 0.95, rms: 0.05 };
    const result = smoother.process(raw);

    expect(result.isValid).toBe(true);
    expect(result.midi).not.toBeNull();
    expect(result.midi ?? 0).toBeCloseTo(69, 2);
    expect(result.noteName).toBe('A4');
    expect(result.hz).not.toBeNull();
    expect(result.hz ?? 0).toBeCloseTo(440, 2);
  });

  describe('rejection gates', () => {
    it('rejects frames with RMS below minRms (silence/ambient noise)', () => {
      const lowRms = { hz: 440, clarity: 0.95, rms: 0.005 }; // < 0.015 default
      const result = smoother.process(lowRms);

      expect(result.isValid).toBe(false);
      expect(result.hz).toBeNull();
      expect(result.midi).toBeNull();
      expect(result.noteName).toBeNull();
    });

    it('rejects frames with clarity below minClarity (unclear sound)', () => {
      const lowClarity = { hz: 440, clarity: 0.7, rms: 0.05 }; // < 0.8 default
      const result = smoother.process(lowClarity);

      expect(result.isValid).toBe(false);
      expect(result.hz).toBeNull();
      expect(result.midi).toBeNull();
      expect(result.noteName).toBeNull();
    });

    it('rejects frequencies below 80 Hz (sub-vocal frequency)', () => {
      const subVocal = { hz: 70, clarity: 0.95, rms: 0.05 };
      const result = smoother.process(subVocal);

      expect(result.isValid).toBe(false);
      expect(result.hz).toBeNull();
      expect(result.midi).toBeNull();
      expect(result.noteName).toBeNull();
    });

    it('rejects frequencies above 1100 Hz (supra-vocal frequency)', () => {
      const supraVocal = { hz: 1200, clarity: 0.95, rms: 0.05 };
      const result = smoother.process(supraVocal);

      expect(result.isValid).toBe(false);
      expect(result.hz).toBeNull();
      expect(result.midi).toBeNull();
      expect(result.noteName).toBeNull();
    });

    it('rejects frames where hz is null (silence frame)', () => {
      const silence = { hz: null, clarity: 0, rms: 0 };
      const result = smoother.process(silence);

      expect(result.isValid).toBe(false);
      expect(result.hz).toBeNull();
      expect(result.midi).toBeNull();
      expect(result.noteName).toBeNull();
    });
  });

  it('suppresses single-frame octave-jump / glitch spikes using median filtering', () => {
    const valid440 = { hz: 440, clarity: 0.95, rms: 0.05 };
    const spike880 = { hz: 880, clarity: 0.95, rms: 0.05 }; // Octave jump spike (MIDI 81)

    // Feed 2 normal frames (MIDI 69)
    smoother.process(valid440);
    smoother.process(valid440);

    // Injected spike on frame 3
    const spikeResult = smoother.process(spike880);

    // Sliding window of [69, 69, 81] -> median is 69!
    expect(spikeResult.isValid).toBe(true);
    expect(spikeResult.midi ?? 0).toBeCloseTo(69, 2);
    expect(spikeResult.noteName).toBe('A4');
    expect(spikeResult.hz ?? 0).toBeCloseTo(440, 2);

    // Subsequent normal frames remain stable at 440 Hz
    const nextResult = smoother.process(valid440);
    expect(nextResult.noteName).toBe('A4');
  });

  it('clears rolling window on silence so a new note is not pulled toward the previous phrase', () => {
    const frameA4 = { hz: 440, clarity: 0.95, rms: 0.05 };
    const frameSilence = { hz: null, clarity: 0, rms: 0 };
    const frameC4 = { hz: 261.63, clarity: 0.95, rms: 0.05 };

    // Sing several A4 notes
    for (let i = 0; i < 5; i++) {
      smoother.process(frameA4);
    }

    // Silence between phrases (e.g. breath/rest)
    const silenceResult = smoother.process(frameSilence);
    expect(silenceResult.isValid).toBe(false);

    // First frame of new note C4: window was reset, so history only has [C4]
    const c4Result = smoother.process(frameC4);
    expect(c4Result.isValid).toBe(true);
    expect(c4Result.noteName).toBe('C4');
    expect(c4Result.midi ?? 0).toBeCloseTo(60, 1);
  });
});
