import { describe, expect, it } from 'vitest';
import { PitchDetector } from './PitchDetector';

function generateSineWave(
  freq: number,
  sampleRate: number,
  length: number,
  amplitude = 0.5
): Float32Array {
  const buffer = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    buffer[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return buffer;
}

describe('PitchDetector', () => {
  const sampleRate = 44100;
  const detector = new PitchDetector();

  it('detects 440 Hz (A4) within ±2 Hz with high clarity and expected RMS', () => {
    const buffer = generateSineWave(440, sampleRate, 2048, 0.5);
    const result = detector.detect(buffer, sampleRate);

    expect(result.hz).not.toBeNull();
    expect(Math.abs((result.hz ?? 0) - 440)).toBeLessThanOrEqual(2);
    expect(result.clarity).toBeGreaterThan(0.9);

    // RMS of pure sine wave with amplitude A is A / sqrt(2) ≈ 0.5 / 1.41421356 ≈ 0.35355
    const expectedRms = 0.5 / Math.sqrt(2);
    expect(result.rms).toBeCloseTo(expectedRms, 2);
  });

  it('detects 261.63 Hz (C4) within ±2 Hz with high clarity', () => {
    const buffer = generateSineWave(261.63, sampleRate, 2048, 0.5);
    const result = detector.detect(buffer, sampleRate);

    expect(result.hz).not.toBeNull();
    expect(Math.abs((result.hz ?? 0) - 261.63)).toBeLessThanOrEqual(2);
    expect(result.clarity).toBeGreaterThan(0.9);
  });

  it('handles pure silence (all-zero buffer)', () => {
    const silenceBuffer = new Float32Array(2048);
    const result = detector.detect(silenceBuffer, sampleRate);

    expect(result.rms).toBe(0);
    // Pitchy returns [0, 0] on silence, which our detector maps to hz: null and clarity: 0
    expect(result.hz).toBeNull();
    expect(result.clarity).toBe(0);
  });

  it('handles empty or zero-length buffer safely', () => {
    const emptyBuffer = new Float32Array(0);
    const result = detector.detect(emptyBuffer, sampleRate);

    expect(result).toEqual({ hz: null, clarity: 0, rms: 0 });
  });

  it('supports dynamic buffer length changes safely without throwing', () => {
    // Start with 2048 buffer
    const buf2048 = generateSineWave(440, sampleRate, 2048, 0.5);
    const res1 = detector.detect(buf2048, sampleRate);
    expect(res1.hz).not.toBeNull();
    expect(Math.abs((res1.hz ?? 0) - 440)).toBeLessThanOrEqual(2);

    // Switch to 1024 buffer
    const buf1024 = generateSineWave(440, sampleRate, 1024, 0.5);
    const res2 = detector.detect(buf1024, sampleRate);
    expect(res2.hz).not.toBeNull();
    expect(Math.abs((res2.hz ?? 0) - 440)).toBeLessThanOrEqual(2);

    // Switch to 4096 buffer at 261.63 Hz
    const buf4096 = generateSineWave(261.63, sampleRate, 4096, 0.5);
    const res3 = detector.detect(buf4096, sampleRate);
    expect(res3.hz).not.toBeNull();
    expect(Math.abs((res3.hz ?? 0) - 261.63)).toBeLessThanOrEqual(2);
  });
});
