import { PitchDetector as PitchyDetector } from 'pitchy';
import type { RawPitchFrame } from '../types/karaoke';

export class PitchDetector {
  private detector: PitchyDetector<Float32Array> | null = null;
  private currentBufferLength = 0;

  public detect(samples: Float32Array, sampleRate: number): RawPitchFrame {
    if (!samples || samples.length === 0) {
      return { hz: null, clarity: 0, rms: 0 };
    }

    let sumSquares = 0;
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i];
      sumSquares += s * s;
    }
    const rms = Math.sqrt(sumSquares / samples.length);

    if (!this.detector || this.currentBufferLength !== samples.length) {
      this.detector = PitchyDetector.forFloat32Array(samples.length);
      this.currentBufferLength = samples.length;
    }

    const [rawHz, rawClarity] = this.detector.findPitch(samples, sampleRate);

    const hz = Number.isFinite(rawHz) && rawHz > 0 ? rawHz : null;
    const clarity = Number.isFinite(rawClarity) && rawClarity > 0 ? rawClarity : 0;
    const safeRms = Number.isFinite(rms) && rms > 0 ? rms : 0;

    return {
      hz,
      clarity,
      rms: safeRms,
    };
  }
}
