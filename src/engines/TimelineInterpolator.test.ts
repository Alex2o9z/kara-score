import { beforeEach, describe, expect, it } from 'vitest';
import { TimelineInterpolator } from './TimelineInterpolator';

describe('TimelineInterpolator', () => {
  let interpolator: TimelineInterpolator;

  beforeEach(() => {
    interpolator = new TimelineInterpolator(150);
  });

  describe('smooth advancement during PLAYING', () => {
    it('advances smoothly at playbackRate = 1.0', () => {
      // Sync at video time 1.0s (1000ms), nowMs = 1000
      interpolator.syncFromPlayer(1.0, 'PLAYING', 1.0, 1000);

      expect(interpolator.getInterpolatedTimeMs(1000)).toBe(1000);
      expect(interpolator.getInterpolatedTimeMs(1250)).toBe(1250);
      expect(interpolator.getInterpolatedTimeMs(1500)).toBe(1500);
      expect(interpolator.getInterpolatedTimeMs(2000)).toBe(2000);
    });

    it('advances proportionally at playbackRate = 1.25', () => {
      // Sync at video time 2.0s (2000ms), nowMs = 2000, rate = 1.25
      interpolator.syncFromPlayer(2.0, 'PLAYING', 1.25, 2000);

      expect(interpolator.getInterpolatedTimeMs(2000)).toBe(2000);
      // 400ms elapsed * 1.25 = 500ms video time -> 2500ms
      expect(interpolator.getInterpolatedTimeMs(2400)).toBe(2500);
      // 800ms elapsed * 1.25 = 1000ms video time -> 3000ms
      expect(interpolator.getInterpolatedTimeMs(2800)).toBe(3000);
    });
  });

  describe('freezes cleanly in non-PLAYING states', () => {
    it('freezes during PAUSED without drifting forward', () => {
      interpolator.syncFromPlayer(5.0, 'PAUSED', 1.0, 1000);

      expect(interpolator.getInterpolatedTimeMs(1000)).toBe(5000);
      expect(interpolator.getInterpolatedTimeMs(2000)).toBe(5000);
      expect(interpolator.getInterpolatedTimeMs(10000)).toBe(5000);
    });

    it('freezes during BUFFERING, UNSTARTED, and ENDED', () => {
      // UNSTARTED
      expect(interpolator.getInterpolatedTimeMs(5000)).toBe(0);

      // BUFFERING
      interpolator.syncFromPlayer(3.5, 'BUFFERING', 1.0, 1000);
      expect(interpolator.getInterpolatedTimeMs(3000)).toBe(3500);

      // ENDED
      interpolator.syncFromPlayer(60.0, 'ENDED', 1.0, 4000);
      expect(interpolator.getInterpolatedTimeMs(8000)).toBe(60000);
    });
  });

  describe('pause and resume lifecycle', () => {
    it('resumes playback smoothly from paused position', () => {
      // 1. Play from 0 to 2000ms
      interpolator.syncFromPlayer(0, 'PLAYING', 1.0, 1000);
      expect(interpolator.getInterpolatedTimeMs(3000)).toBe(2000);

      // 2. Pause at 2.0s at nowMs = 3000
      interpolator.syncFromPlayer(2.0, 'PAUSED', 1.0, 3000);
      expect(interpolator.getInterpolatedTimeMs(8000)).toBe(2000);

      // 3. Resume at nowMs = 8000
      interpolator.syncFromPlayer(2.0, 'PLAYING', 1.0, 8000);
      expect(interpolator.getInterpolatedTimeMs(8000)).toBe(2000);
      expect(interpolator.getInterpolatedTimeMs(9000)).toBe(3000);
    });
  });

  describe('seek and drift handling', () => {
    it('snaps immediately to new position on large forward seek (> 150ms)', () => {
      interpolator.syncFromPlayer(1.0, 'PLAYING', 1.0, 1000);
      expect(interpolator.getInterpolatedTimeMs(1200)).toBe(1200);

      // User seeks to 15.0s (15000ms) at nowMs = 1200
      interpolator.syncFromPlayer(15.0, 'PLAYING', 1.0, 1200);
      expect(interpolator.getInterpolatedTimeMs(1200)).toBe(15000);
      expect(interpolator.getInterpolatedTimeMs(1700)).toBe(15500);
    });

    it('snaps immediately to new position on backward seek', () => {
      interpolator.syncFromPlayer(10.0, 'PLAYING', 1.0, 1000);
      expect(interpolator.getInterpolatedTimeMs(2000)).toBe(11000);

      // User seeks back to 3.0s (3000ms) at nowMs = 2000
      interpolator.syncFromPlayer(3.0, 'PLAYING', 1.0, 2000);
      expect(interpolator.getInterpolatedTimeMs(2000)).toBe(3000);
      expect(interpolator.getInterpolatedTimeMs(2500)).toBe(3500);
    });

    it('maintains smooth interpolation without snap jitter when clock drift is within 150ms', () => {
      interpolator.syncFromPlayer(1.0, 'PLAYING', 1.0, 1000);
      // At nowMs = 1200, interpolated is 1200ms
      // Player reports 1.23s (1230ms), drift = 30ms <= 150ms threshold
      interpolator.syncFromPlayer(1.23, 'PLAYING', 1.0, 1200);

      // Anchor is preserved, so no sudden 30ms jump
      expect(interpolator.getInterpolatedTimeMs(1200)).toBe(1200);
    });

    it('resets completely to initial unstarted state on reset()', () => {
      interpolator.syncFromPlayer(10.0, 'PLAYING', 1.5, 5000);
      interpolator.reset();

      expect(interpolator.getState()).toBe('UNSTARTED');
      expect(interpolator.getPlaybackRate()).toBe(1);
      expect(interpolator.getInterpolatedTimeMs(10000)).toBe(0);
    });
  });
});
