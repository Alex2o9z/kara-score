import type { RawPitchFrame, SmoothedPitchFrame } from '../types/karaoke';
import { hzToMidi, midiToHz, midiToNoteName } from './noteUtils';

export interface PitchSmootherOptions {
  minRms?: number;
  minClarity?: number;
  minHz?: number;
  maxHz?: number;
  windowSize?: number;
}

export class PitchSmoother {
  private readonly minRms: number;
  private readonly minClarity: number;
  private readonly minHz: number;
  private readonly maxHz: number;
  private readonly windowSize: number;
  private historyWindow: number[] = [];

  constructor(options: PitchSmootherOptions = {}) {
    this.minRms = options.minRms ?? 0.015;
    this.minClarity = options.minClarity ?? 0.8;
    this.minHz = options.minHz ?? 80;
    this.maxHz = options.maxHz ?? 1100;
    this.windowSize = Math.max(1, options.windowSize ?? 5);
  }

  public reset(): void {
    this.historyWindow = [];
  }

  public process(raw: RawPitchFrame): SmoothedPitchFrame {
    if (
      raw.hz === null ||
      !Number.isFinite(raw.hz) ||
      raw.hz < this.minHz ||
      raw.hz > this.maxHz ||
      !Number.isFinite(raw.rms) ||
      raw.rms < this.minRms ||
      !Number.isFinite(raw.clarity) ||
      raw.clarity < this.minClarity
    ) {
      this.reset();
      return {
        hz: null,
        midi: null,
        noteName: null,
        clarity: Number.isFinite(raw.clarity) ? raw.clarity : 0,
        rms: Number.isFinite(raw.rms) ? raw.rms : 0,
        isValid: false,
      };
    }

    const currentMidi = hzToMidi(raw.hz);
    this.historyWindow.push(currentMidi);
    if (this.historyWindow.length > this.windowSize) {
      this.historyWindow.shift();
    }

    const sorted = [...this.historyWindow].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const medianMidi =
      sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;

    const smoothedHz = midiToHz(medianMidi);
    const noteName = midiToNoteName(medianMidi);

    return {
      hz: smoothedHz,
      midi: medianMidi,
      noteName,
      clarity: raw.clarity,
      rms: raw.rms,
      isValid: true,
    };
  }
}
