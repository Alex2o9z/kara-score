import type { PlayerState } from '../types/karaoke';

export class TimelineInterpolator {
  private anchorVideoTimeMs = 0;
  private anchorPerfNowMs = 0;
  private playbackRate = 1;
  private state: PlayerState = 'UNSTARTED';
  private readonly driftThresholdMs: number;

  constructor(driftThresholdMs = 150) {
    this.driftThresholdMs = driftThresholdMs;
  }

  public reset(): void {
    this.anchorVideoTimeMs = 0;
    this.anchorPerfNowMs = 0;
    this.playbackRate = 1;
    this.state = 'UNSTARTED';
  }

  public syncFromPlayer(
    rawVideoTimeSec: number,
    state: PlayerState,
    playbackRate: number,
    nowMs: number
  ): void {
    const rawVideoTimeMs = Math.max(0, rawVideoTimeSec * 1000);
    const stateChanged = this.state !== state;
    const rateChanged = this.playbackRate !== playbackRate;
    const currentInterpolatedMs = this.getInterpolatedTimeMs(nowMs);
    const drift = Math.abs(rawVideoTimeMs - currentInterpolatedMs);

    if (stateChanged || rateChanged || drift > this.driftThresholdMs || state !== 'PLAYING') {
      this.anchorVideoTimeMs = rawVideoTimeMs;
      this.anchorPerfNowMs = nowMs;
      this.state = state;
      this.playbackRate = playbackRate > 0 ? playbackRate : 1;
    }
  }

  public getInterpolatedTimeMs(nowMs: number): number {
    if (this.state !== 'PLAYING') {
      return Math.max(0, this.anchorVideoTimeMs);
    }

    const elapsed = Math.max(0, nowMs - this.anchorPerfNowMs);
    return Math.max(0, this.anchorVideoTimeMs + elapsed * this.playbackRate);
  }

  public getState(): PlayerState {
    return this.state;
  }

  public getPlaybackRate(): number {
    return this.playbackRate;
  }
}
