import { describe, expect, it, beforeEach } from 'vitest';
import {
  applyJudgePresentation,
  calculateRating,
  DEFAULT_SETTINGS,
  FUN_REMARKS,
  getJudgeLabel,
  loadPartySettings,
  NEUTRAL_REMARKS,
  savePartySettings,
  SETTINGS_STORAGE_KEY,
  type KaraScoreSettings,
} from './partySettings';

describe('partySettings & JudgePresentation', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('calculateRating', () => {
    it('returns S for score >= 90', () => {
      expect(calculateRating(90)).toBe('S');
      expect(calculateRating(100)).toBe('S');
    });

    it('returns A for 80 <= score < 90', () => {
      expect(calculateRating(80)).toBe('A');
      expect(calculateRating(89)).toBe('A');
    });

    it('returns B for 70 <= score < 80', () => {
      expect(calculateRating(70)).toBe('B');
      expect(calculateRating(79)).toBe('B');
    });

    it('returns C for score < 70', () => {
      expect(calculateRating(69)).toBe('C');
      expect(calculateRating(0)).toBe('C');
    });
  });

  describe('getJudgeLabel', () => {
    it('returns appropriate labels for each judge mode', () => {
      expect(getJudgeLabel('standard')).toBe('Chuẩn xác');
      expect(getJudgeLabel('lenient')).toBe('Giám khảo Dễ tính (+8%)');
      expect(getJudgeLabel('strict')).toBe('Giám khảo Khó tính (-10%)');
      expect(getJudgeLabel('fun')).toBe('Giám khảo Hài hước');
    });
  });

  describe('applyJudgePresentation', () => {
    it('handles standard mode with 1:1 score mapping', () => {
      const settings: KaraScoreSettings = {
        ...DEFAULT_SETTINGS,
        judgeMode: 'standard',
        enableFunRemarks: false,
      };

      const result = applyJudgePresentation(85, settings);
      expect(result.displayScore).toBe(85);
      expect(result.displayRating).toBe('A');
      expect(result.judgeLabel).toBe('Chuẩn xác');
      expect(result.remark).toBe(NEUTRAL_REMARKS.A);
    });

    it('handles lenient mode with +8% boost capped at 100', () => {
      const settings: KaraScoreSettings = {
        ...DEFAULT_SETTINGS,
        judgeMode: 'lenient',
        enableFunRemarks: false,
      };

      // 50 * 1.08 = 54
      const res50 = applyJudgePresentation(50, settings);
      expect(res50.displayScore).toBe(54);
      expect(res50.judgeLabel).toBe('Giám khảo Dễ tính (+8%)');

      // 95 * 1.08 = 102.6 -> clamped to 100
      const res95 = applyJudgePresentation(95, settings);
      expect(res95.displayScore).toBe(100);
      expect(res95.displayRating).toBe('S');
    });

    it('handles strict mode with -10% precision penalty clamped at 0', () => {
      const settings: KaraScoreSettings = {
        ...DEFAULT_SETTINGS,
        judgeMode: 'strict',
        enableFunRemarks: false,
      };

      // 80 * 0.9 = 72
      const res80 = applyJudgePresentation(80, settings);
      expect(res80.displayScore).toBe(72);
      expect(res80.displayRating).toBe('B');
      expect(res80.judgeLabel).toBe('Giám khảo Khó tính (-10%)');

      // 5 * 0.9 = 4.5 -> 5; 0 * 0.9 = 0
      const res0 = applyJudgePresentation(0, settings);
      expect(res0.displayScore).toBe(0);
      expect(res0.displayRating).toBe('C');
    });

    it('handles fun mode with standard score presentation', () => {
      const settings: KaraScoreSettings = {
        ...DEFAULT_SETTINGS,
        judgeMode: 'fun',
        enableFunRemarks: false,
      };

      const res = applyJudgePresentation(78, settings);
      expect(res.displayScore).toBe(78);
      expect(res.displayRating).toBe('B');
      expect(res.judgeLabel).toBe('Giám khảo Hài hước');
    });

    it('clamps raw scores outside [0, 100] bounds', () => {
      const settings = { ...DEFAULT_SETTINGS, enableFunRemarks: false };

      const negative = applyJudgePresentation(-20, settings);
      expect(negative.displayScore).toBe(0);

      const overflow = applyJudgePresentation(150, settings);
      expect(overflow.displayScore).toBe(100);
    });

    it('provides deterministic fun remarks when seed is supplied', () => {
      const settings: KaraScoreSettings = {
        ...DEFAULT_SETTINGS,
        judgeMode: 'fun',
        enableFunRemarks: true,
      };

      const sPool = FUN_REMARKS.S;
      const res0 = applyJudgePresentation(95, settings, { seed: 0 });
      expect(res0.remark).toBe(sPool[0]);

      const res1 = applyJudgePresentation(95, settings, { seed: 1 });
      expect(res1.remark).toBe(sPool[1]);

      const resWrap = applyJudgePresentation(95, settings, { seed: sPool.length + 2 });
      expect(resWrap.remark).toBe(sPool[2]);
    });

    it('provides neutral remarks when enableFunRemarks is false', () => {
      const settings: KaraScoreSettings = {
        ...DEFAULT_SETTINGS,
        enableFunRemarks: false,
      };

      const resS = applyJudgePresentation(92, settings);
      expect(resS.remark).toBe(NEUTRAL_REMARKS.S);

      const resC = applyJudgePresentation(45, settings);
      expect(resC.remark).toBe(NEUTRAL_REMARKS.C);
    });
  });

  describe('loadPartySettings & savePartySettings', () => {
    it('returns default settings when storage is empty', () => {
      const loaded = loadPartySettings();
      expect(loaded).toEqual(DEFAULT_SETTINGS);
    });

    it('saves and reloads custom settings safely', () => {
      const custom: KaraScoreSettings = {
        judgeMode: 'lenient',
        enableFunRemarks: false,
        autoMicOnPlay: false,
        showDebugHud: true,
      };

      savePartySettings(custom);
      const reloaded = loadPartySettings();
      expect(reloaded).toEqual(custom);
    });

    it('gracefully handles malformed JSON in localStorage', () => {
      localStorage.setItem(SETTINGS_STORAGE_KEY, 'invalid-json{[');
      const loaded = loadPartySettings();
      expect(loaded).toEqual(DEFAULT_SETTINGS);
    });

    it('validates and falls back for unknown judgeMode string', () => {
      localStorage.setItem(
        SETTINGS_STORAGE_KEY,
        JSON.stringify({ judgeMode: 'unknown_mode', enableFunRemarks: false })
      );
      const loaded = loadPartySettings();
      expect(loaded.judgeMode).toBe('standard');
      expect(loaded.enableFunRemarks).toBe(false);
    });
  });
});
