/**
 * SfxEngine: Zero-asset Web Audio Synthesizer for KaraScore game-show reveals.
 * Synthesizes dynamic countdown ticks and rank stamp celebrations in pure Web Audio.
 */

class SfxEngineService {
  private ctx: AudioContext | null = null;
  private isMutedState: boolean = false;
  private activeOscillators: Set<AudioScheduledSourceNode> = new Set();

  constructor() {
    try {
      this.isMutedState = localStorage.getItem('karascore.sfxMuted') === 'true';
    } catch {
      this.isMutedState = false;
    }
  }

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  public isMuted(): boolean {
    return this.isMutedState;
  }

  public setMuted(muted: boolean): void {
    this.isMutedState = muted;
    try {
      localStorage.setItem('karascore.sfxMuted', String(muted));
    } catch {
      // ignore storage access errors
    }
    if (muted) {
      this.stopAll();
    }
  }

  public toggleMuted(): boolean {
    const next = !this.isMutedState;
    this.setMuted(next);
    return next;
  }

  public stopAll(): void {
    for (const osc of this.activeOscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // already stopped
      }
    }
    this.activeOscillators.clear();
  }

  /**
   * Crisp ascending pitch tick (420Hz -> 880Hz) played during score count-up increments
   */
  public playCountTick(progress: number): void {
    if (this.isMutedState) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const clampedProgress = Math.max(0, Math.min(1, progress));
      const freq = 420 + clampedProgress * 460; // 420Hz to 880Hz
      const now = ctx.currentTime;

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.12, now + 0.003);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

      osc.connect(gain);
      gain.connect(ctx.destination);

      this.activeOscillators.add(osc);
      osc.onended = () => {
        this.activeOscillators.delete(osc);
        gain.disconnect();
      };

      osc.start(now);
      osc.stop(now + 0.04);
    } catch {
      // safe fallback on browser audio interruption
    }
  }

  /**
   * Punchy low-end stamp thud followed immediately by tier-specific celebration audio
   */
  public playRankStamp(rating: 'S' | 'A' | 'B' | 'C'): void {
    if (this.isMutedState) return;
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;

      // 1. Punchy low-end stamp thud (pitch drop 160Hz -> 45Hz)
      const thudOsc = ctx.createOscillator();
      const thudGain = ctx.createGain();
      thudOsc.type = 'sine';
      thudOsc.frequency.setValueAtTime(160, now);
      thudOsc.frequency.exponentialRampToValueAtTime(45, now + 0.09);

      thudGain.gain.setValueAtTime(0.35, now);
      thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      thudOsc.connect(thudGain);
      thudGain.connect(ctx.destination);

      this.activeOscillators.add(thudOsc);
      thudOsc.onended = () => {
        this.activeOscillators.delete(thudOsc);
        thudGain.disconnect();
      };
      thudOsc.start(now);
      thudOsc.stop(now + 0.13);

      // 2. Tier-specific celebration fanfare / chimes (starts at now + 0.06)
      const celebrationStart = now + 0.06;

      switch (rating) {
        case 'S': {
          // Triumphant 4-note major-9th synth fanfare + high shimmer chime
          // Notes: C5 (523.25), E5 (659.25), G5 (783.99), D6 (1174.66)
          const notes = [523.25, 659.25, 783.99, 1174.66];
          notes.forEach((f, idx) => {
            const noteStart = celebrationStart + idx * 0.08;
            const noteOsc = ctx.createOscillator();
            const noteGain = ctx.createGain();
            noteOsc.type = 'triangle';
            noteOsc.frequency.setValueAtTime(f, noteStart);

            noteGain.gain.setValueAtTime(0, noteStart);
            noteGain.gain.linearRampToValueAtTime(0.2, noteStart + 0.02);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.45);

            noteOsc.connect(noteGain);
            noteGain.connect(ctx.destination);

            this.activeOscillators.add(noteOsc);
            noteOsc.onended = () => {
              this.activeOscillators.delete(noteOsc);
              noteGain.disconnect();
            };
            noteOsc.start(noteStart);
            noteOsc.stop(noteStart + 0.5);
          });

          // High shimmer chime
          const shimmerStart = celebrationStart + 0.35;
          const shimmerFreqs = [2093.0, 2637.0, 3135.96]; // C7, E7, G7
          shimmerFreqs.forEach((f, idx) => {
            const shOsc = ctx.createOscillator();
            const shGain = ctx.createGain();
            shOsc.type = 'sine';
            shOsc.frequency.setValueAtTime(f, shimmerStart + idx * 0.04);
            shGain.gain.setValueAtTime(0.08, shimmerStart + idx * 0.04);
            shGain.gain.exponentialRampToValueAtTime(0.0001, shimmerStart + idx * 0.04 + 0.6);

            shOsc.connect(shGain);
            shGain.connect(ctx.destination);
            this.activeOscillators.add(shOsc);
            shOsc.onended = () => {
              this.activeOscillators.delete(shOsc);
              shGain.disconnect();
            };
            shOsc.start(shimmerStart + idx * 0.04);
            shOsc.stop(shimmerStart + idx * 0.04 + 0.65);
          });
          break;
        }

        case 'A': {
          // Bright 3-note uplifting major triad chime: E5, G#5, B5
          const notes = [659.25, 830.61, 987.77];
          notes.forEach((f, idx) => {
            const noteStart = celebrationStart + idx * 0.09;
            const noteOsc = ctx.createOscillator();
            const noteGain = ctx.createGain();
            noteOsc.type = 'sine';
            noteOsc.frequency.setValueAtTime(f, noteStart);

            noteGain.gain.setValueAtTime(0, noteStart);
            noteGain.gain.linearRampToValueAtTime(0.18, noteStart + 0.015);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.5);

            noteOsc.connect(noteGain);
            noteGain.connect(ctx.destination);

            this.activeOscillators.add(noteOsc);
            noteOsc.onended = () => {
              this.activeOscillators.delete(noteOsc);
              noteGain.disconnect();
            };
            noteOsc.start(noteStart);
            noteOsc.stop(noteStart + 0.55);
          });
          break;
        }

        case 'B': {
          // Warm 2-note positive chime: G4 -> C5
          const notes = [392.0, 523.25];
          notes.forEach((f, idx) => {
            const noteStart = celebrationStart + idx * 0.12;
            const noteOsc = ctx.createOscillator();
            const noteGain = ctx.createGain();
            noteOsc.type = 'triangle';
            noteOsc.frequency.setValueAtTime(f, noteStart);

            noteGain.gain.setValueAtTime(0, noteStart);
            noteGain.gain.linearRampToValueAtTime(0.16, noteStart + 0.02);
            noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.4);

            noteOsc.connect(noteGain);
            noteGain.connect(ctx.destination);

            this.activeOscillators.add(noteOsc);
            noteOsc.onended = () => {
              this.activeOscillators.delete(noteOsc);
              noteGain.disconnect();
            };
            noteOsc.start(noteStart);
            noteOsc.stop(noteStart + 0.45);
          });
          break;
        }

        case 'C': {
          // Lighthearted playful pitch-slide (comedic boing / gentle slide up & down)
          const slideOsc = ctx.createOscillator();
          const slideGain = ctx.createGain();
          slideOsc.type = 'sine';
          slideOsc.frequency.setValueAtTime(260, celebrationStart);
          slideOsc.frequency.exponentialRampToValueAtTime(440, celebrationStart + 0.12);
          slideOsc.frequency.exponentialRampToValueAtTime(220, celebrationStart + 0.35);

          slideGain.gain.setValueAtTime(0, celebrationStart);
          slideGain.gain.linearRampToValueAtTime(0.15, celebrationStart + 0.02);
          slideGain.gain.exponentialRampToValueAtTime(0.0001, celebrationStart + 0.4);

          slideOsc.connect(slideGain);
          slideGain.connect(ctx.destination);

          this.activeOscillators.add(slideOsc);
          slideOsc.onended = () => {
            this.activeOscillators.delete(slideOsc);
            slideGain.disconnect();
          };
          slideOsc.start(celebrationStart);
          slideOsc.stop(celebrationStart + 0.45);
          break;
        }
      }
    } catch {
      // safe fallback on browser audio interruption
    }
  }
}

export const sfxEngine = new SfxEngineService();
