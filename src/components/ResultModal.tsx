import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  applyJudgePresentation,
  type KaraScoreSettings,
} from '../services/partySettings';
import { sfxEngine } from '../services/SfxEngine';
import type { ScoreRating, ScoreSnapshot, ScoringMode } from '../types/karaoke';

export interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplay: () => void;
  onSelectSong?: () => void;
  score: ScoreSnapshot;
  mode: ScoringMode;
  songTitle?: string;
  settings?: KaraScoreSettings;
}

function getRatingBadgeDetails(rating: ScoreRating) {
  switch (rating) {
    case 'S':
      return {
        label: 'Hạng S — Xuất Sắc!',
        sub: 'Mastery: Giọng hát cực kỳ chuẩn xác và ổn định!',
        badgeClass:
          'text-amber-300 border-amber-400 bg-amber-950/90 shadow-[0_0_40px_rgba(251,191,36,0.6)]',
      };
    case 'A':
      return {
        label: 'Hạng A — Rất Tốt',
        sub: 'Great Performance: Kỹ thuật bắt nhịp và cao độ rất chuẩn!',
        badgeClass:
          'text-emerald-300 border-emerald-400 bg-emerald-950/90 shadow-[0_0_35px_rgba(52,211,153,0.5)]',
      };
    case 'B':
      return {
        label: 'Hạng B — Đạt Chuẩn',
        sub: 'Solid Effort: Duy trì nhịp tốt, cần thêm độ ổn định.',
        badgeClass:
          'text-blue-300 border-blue-400 bg-blue-950/90 shadow-[0_0_30px_rgba(96,165,250,0.45)]',
      };
    case 'C':
    default:
      return {
        label: 'Hạng C — Cần Luyện Thêm',
        sub: 'Practice More: Hãy tự tin hát to, rõ ràng và bắt đúng nhịp nhé!',
        badgeClass:
          'text-zinc-300 border-zinc-600 bg-zinc-900/95 shadow-md',
      };
  }
}

const GAUGE_RADIUS = 104;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS; // ~653.45

export const ResultModal: React.FC<ResultModalProps> = ({
  isOpen,
  onClose,
  onReplay,
  onSelectSong,
  score,
  mode,
  songTitle,
  settings,
}) => {
  const [remarkSeed, setRemarkSeed] = useState<number>(0);
  const [isDetailsOpen, setIsDetailsOpen] = useState<boolean>(false);
  const [animScore, setAnimScore] = useState<number>(0);
  const [gaugeProgress, setGaugeProgress] = useState<number>(0);
  const [revealStage, setRevealStage] = useState<1 | 2 | 3>(1);
  const [isMuted, setIsMuted] = useState<boolean>(() => sfxEngine.isMuted());

  const animationFrameRef = useRef<number | null>(null);
  const lastTickTimeRef = useRef<number>(0);
  const stage2FlippedRef = useRef<number>(0);

  const presentation = settings
    ? applyJudgePresentation(score.score, settings, { seed: remarkSeed })
    : {
        displayScore: score.score,
        displayRating: score.rating,
        judgeLabel: 'Chuẩn xác',
        remark: getRatingBadgeDetails(score.rating).sub,
      };

  const ratingDetails = getRatingBadgeDetails(presentation.displayRating);
  const { breakdown } = score;
  const isLenientOrStrict = settings && (settings.judgeMode === 'lenient' || settings.judgeMode === 'strict');

  // Traditional 3-Stage Karaoke Roulette Reveal (~1300ms)
  const startRevealChoreography = useCallback((targetScore: number, rating: ScoreRating) => {
    if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    sfxEngine.stopAll();

    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    lastTickTimeRef.current = 0;
    stage2FlippedRef.current = 0;
    let startTime: number | null = null;
    const duration = 1300;

    const step = (timestamp: number) => {
      if (prefersReduced) {
        setAnimScore(targetScore);
        setGaugeProgress(targetScore);
        setRevealStage(3);
        sfxEngine.playRankStamp(rating);
        return;
      }

      if (startTime === null) {
        startTime = timestamp;
        setRevealStage(1);
        setAnimScore(Math.floor(Math.random() * 90) + 10);
        setGaugeProgress(20);
      }

      const elapsed = timestamp - startTime;

      if (elapsed < 900) {
        // Stage 1 (0 – 900ms): Rapid Random Roulette
        if (timestamp - lastTickTimeRef.current >= 45) {
          lastTickTimeRef.current = timestamp;
          const randomVal = Math.floor(Math.random() * 90) + 10;
          setAnimScore(randomVal);
          const pulse = (elapsed / 900) * 85;
          setGaugeProgress(Math.min(95, pulse));
          sfxEngine.playCountTick(elapsed / duration);
        }
        animationFrameRef.current = requestAnimationFrame(step);
      } else if (elapsed < duration) {
        // Stage 2 (900 – 1300ms): Suspense Deceleration (110ms -> 180ms -> 240ms)
        if (stage2FlippedRef.current === 0 && elapsed >= 900) {
          stage2FlippedRef.current = 1;
          const offset = Math.random() > 0.5 ? 8 : -8;
          const candidate = Math.max(10, Math.min(99, targetScore + offset));
          setAnimScore(candidate);
          setGaugeProgress(candidate);
          sfxEngine.playCountTick(0.75);
        } else if (stage2FlippedRef.current === 1 && elapsed >= 1010) {
          stage2FlippedRef.current = 2;
          const offset = Math.random() > 0.5 ? 4 : -4;
          const candidate = Math.max(10, Math.min(99, targetScore + offset));
          setAnimScore(candidate);
          setGaugeProgress(candidate);
          sfxEngine.playCountTick(0.85);
        } else if (stage2FlippedRef.current === 2 && elapsed >= 1190) {
          stage2FlippedRef.current = 3;
          const offset = Math.random() > 0.5 ? 1 : -1;
          const candidate = Math.max(10, Math.min(99, targetScore + offset));
          setAnimScore(candidate);
          setGaugeProgress(candidate);
          sfxEngine.playCountTick(0.95);
        }
        animationFrameRef.current = requestAnimationFrame(step);
      } else {
        // Stage 3 (1300ms): Final Lock & Rank Slam
        setAnimScore(targetScore);
        setGaugeProgress(targetScore);
        setRevealStage(3);
        sfxEngine.playRankStamp(rating);
      }
    };

    animationFrameRef.current = requestAnimationFrame(step);
  }, []);

  // Run roulette when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      sfxEngine.stopAll();
      return;
    }

    startRevealChoreography(presentation.displayScore, presentation.displayRating);

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      sfxEngine.stopAll();
    };
  }, [isOpen, presentation.displayScore, presentation.displayRating, startRevealChoreography]);

  if (!isOpen) return null;

  const handleToggleMute = () => {
    const next = sfxEngine.toggleMuted();
    setIsMuted(next);
  };

  const handleReplayChoreography = () => {
    startRevealChoreography(presentation.displayScore, presentation.displayRating);
  };

  // Rank-specific visual theme
  const rankTheme = (() => {
    switch (presentation.displayRating) {
      case 'S':
        return {
          cardBg:
            'bg-gradient-to-b from-amber-950/40 via-zinc-950/80 to-zinc-950 border-amber-500/40 shadow-[0_0_60px_rgba(251,191,36,0.25)]',
          scoreColor: 'text-amber-300',
          gaugeStroke: 'text-amber-400 drop-shadow-[0_0_16px_rgba(251,191,36,0.7)]',
          badgeBorder: 'border-amber-400',
          wingColor: 'bg-amber-400',
          orbitStroke: 'text-amber-500/30',
        };
      case 'A':
        return {
          cardBg:
            'bg-gradient-to-b from-emerald-950/40 via-zinc-950/80 to-zinc-950 border-emerald-500/40 ks-rank-a-pulse',
          scoreColor: 'text-emerald-300',
          gaugeStroke: 'text-emerald-400 drop-shadow-[0_0_16px_rgba(52,211,153,0.6)]',
          badgeBorder: 'border-emerald-400',
          wingColor: 'bg-emerald-400',
          orbitStroke: 'text-emerald-500/30',
        };
      case 'B':
        return {
          cardBg:
            'bg-gradient-to-b from-blue-950/40 via-zinc-950/80 to-zinc-950 border-blue-500/40 shadow-[0_0_40px_rgba(96,165,250,0.2)]',
          scoreColor: 'text-blue-300',
          gaugeStroke: 'text-blue-400 drop-shadow-[0_0_14px_rgba(96,165,250,0.55)]',
          badgeBorder: 'border-blue-400',
          wingColor: 'bg-blue-400',
          orbitStroke: 'text-blue-500/30',
        };
      case 'C':
      default:
        return {
          cardBg:
            'bg-gradient-to-b from-purple-950/30 via-zinc-950/80 to-zinc-950 border-zinc-800 shadow-lg',
          scoreColor: 'text-zinc-200',
          gaugeStroke: 'text-purple-400 drop-shadow-[0_0_12px_rgba(168,85,247,0.45)]',
          badgeBorder: 'border-zinc-500',
          wingColor: 'bg-purple-400',
          orbitStroke: 'text-zinc-600/30',
        };
    }
  })();

  const strokeDashoffset =
    GAUGE_CIRCUMFERENCE * (1 - Math.max(0, Math.min(100, gaugeProgress)) / 100);

  const displayScoreString =
    revealStage === 3
      ? String(presentation.displayScore)
      : String(animScore).padStart(2, '0');

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-modal-title"
      style={{ colorScheme: 'dark' }}
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-black/85 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div className="relative w-[92vw] sm:w-[84vw] max-w-5xl sm:min-h-[80vh] max-h-[92vh] overflow-y-auto rounded-3xl bg-zinc-900 border border-zinc-700/80 shadow-2xl p-4 sm:p-6 text-zinc-100 flex flex-col justify-between gap-3 sm:gap-4 ks-dark-scroll">
        {/* 1. Single-Line Top Bar (32px) */}
        <div className="flex items-center justify-between gap-2 h-8 min-h-[32px] w-full border-b border-zinc-800/80 pb-2 shrink-0">
          {/* Song Title & Mode on Left */}
          <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
            <span className="text-base shrink-0">🎵</span>
            <span className="text-sm sm:text-base font-black text-white truncate">
              {songTitle || 'Kết Quả Hát Karaoke'}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 shrink-0 hidden sm:inline">
              {mode === 'exact' ? 'Tier 1: Exact Melody' : 'Tier 2: Vocal Performance'}
            </span>
            {settings && settings.judgeMode !== 'standard' && (
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800 shrink-0 hidden sm:inline">
                {presentation.judgeLabel}
              </span>
            )}
          </div>

          {/* Controls on Right: [↻ Quay lại] + [🔊/🔇] */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleReplayChoreography}
              className="h-7 px-2.5 text-xs font-semibold rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 transition-all cursor-pointer flex items-center gap-1 active:scale-95"
              title="Quay số lại từ đầu"
            >
              <span>↻</span>
              <span className="hidden sm:inline">Quay lại</span>
            </button>

            <button
              type="button"
              onClick={handleToggleMute}
              className={`h-7 px-2.5 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center justify-center active:scale-95 ${
                isMuted
                  ? 'bg-rose-950/70 border-rose-800 text-rose-300'
                  : 'bg-zinc-800 border-zinc-700 text-emerald-400'
              }`}
              title={isMuted ? 'Bật âm thanh hiệu ứng (SFX)' : 'Tắt âm thanh hiệu ứng (SFX)'}
            >
              <span>{isMuted ? '🔇' : '🔊'}</span>
            </button>
          </div>
        </div>

        {/* 2. Full-Stage Hero Centerpiece with Symmetrical Wings & Dual Spotlights */}
        <div className={`relative flex flex-col items-center justify-center py-4 sm:py-6 px-4 sm:px-8 rounded-3xl border overflow-hidden flex-1 min-h-[300px] sm:min-h-[380px] ${rankTheme.cardBg}`}>
          {/* Dual Top-Corner Stage Spotlight Beams */}
          <div
            className="absolute top-0 left-0 w-80 h-80 pointer-events-none select-none opacity-40 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.12),transparent_70%)]"
            aria-hidden="true"
          />
          <div
            className="absolute top-0 right-0 w-80 h-80 pointer-events-none select-none opacity-40 bg-[radial-gradient(ellipse_at_top_right,rgba(255,255,255,0.12),transparent_70%)]"
            aria-hidden="true"
          />

          {/* Confetti Particles for Rank S */}
          {revealStage === 3 && presentation.displayRating === 'S' && (
            <div className="absolute inset-0 pointer-events-none overflow-hidden select-none" aria-hidden="true">
              <span className="absolute top-3 left-10 text-amber-400 text-xl ks-confetti-particle" style={{ animationDelay: '0s' }}>✨</span>
              <span className="absolute top-6 right-12 text-yellow-300 text-2xl ks-confetti-particle" style={{ animationDelay: '0.4s' }}>★</span>
              <span className="absolute bottom-5 left-16 text-amber-300 text-base ks-confetti-particle" style={{ animationDelay: '0.8s' }}>✦</span>
              <span className="absolute bottom-6 right-16 text-yellow-200 text-xl ks-confetti-particle" style={{ animationDelay: '1.2s' }}>✨</span>
              <span className="absolute top-1/2 left-6 text-amber-400 text-sm ks-confetti-particle" style={{ animationDelay: '0.6s' }}>★</span>
              <span className="absolute top-1/2 right-8 text-yellow-300 text-base ks-confetti-particle" style={{ animationDelay: '1.0s' }}>✦</span>
            </div>
          )}

          {/* Symmetrical Left Wing + Gauge Center + Right Wing Arena */}
          <div className="relative w-full flex items-center justify-between gap-4 z-10">
            {/* Left Stage Equalizer Wing */}
            <div
              className="hidden md:flex items-end justify-center gap-1.5 lg:gap-2 h-44 lg:h-52 w-24 lg:w-36 shrink-0 pointer-events-none select-none opacity-40"
              aria-hidden="true"
            >
              {[35, 65, 90, 50, 80, 60, 95, 45].map((h, i) => (
                <div
                  key={`lw-${i}`}
                  className={`w-2 lg:w-2.5 rounded-full ${rankTheme.wingColor} ${revealStage === 3 ? 'ks-wing-eq' : ''}`}
                  style={{
                    height: `${h}%`,
                    animationDelay: `${i * 0.12}s`,
                  }}
                />
              ))}
            </div>

            {/* Center: Oversized Dual-Ring Circular Gauge (w-52 h-52 sm:w-64 sm:h-64) */}
            <div className="flex flex-col items-center justify-center shrink-0 mx-auto">
              <div className="relative w-52 h-52 sm:w-64 sm:h-64 flex items-center justify-center">
                <svg
                  className="w-full h-full transform -rotate-90"
                  viewBox="0 0 256 256"
                  aria-hidden="true"
                >
                  {/* Subtle Rotating Dashed Outer Orbit Ring */}
                  <circle
                    cx="128"
                    cy="128"
                    r="120"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeDasharray="6 10"
                    fill="transparent"
                    className={`${rankTheme.orbitStroke} ks-orbit-spin`}
                  />

                  {/* Main Background Track */}
                  <circle
                    cx="128"
                    cy="128"
                    r={GAUGE_RADIUS}
                    stroke="currentColor"
                    strokeWidth="10"
                    fill="transparent"
                    className="text-zinc-800/80"
                  />

                  {/* Glowing Progress Stroke */}
                  <circle
                    cx="128"
                    cy="128"
                    r={GAUGE_RADIUS}
                    stroke="currentColor"
                    strokeWidth="10"
                    strokeLinecap="round"
                    fill="transparent"
                    strokeDasharray={GAUGE_CIRCUMFERENCE}
                    strokeDashoffset={strokeDashoffset}
                    className={`transition-all duration-75 ${rankTheme.gaugeStroke}`}
                  />
                </svg>

                {/* Massive Centered Score Typography */}
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none">
                  <span
                    className={`leading-none font-black tabular-nums tracking-tighter ${
                      animScore === 100
                        ? 'text-[86px] sm:text-[118px] lg:text-[132px]'
                        : 'text-[112px] sm:text-[160px] lg:text-[176px]'
                    } ${rankTheme.scoreColor}`}
                  >
                    {displayScoreString}
                  </span>
                  <span className="text-xs sm:text-sm text-zinc-500 font-extrabold uppercase tracking-widest -mt-1 sm:-mt-2">
                    / 100 ĐIỂM
                  </span>
                </div>
              </div>

              {/* Wide Ceremonial Rank Banner */}
              <div className="relative mt-3 sm:mt-4 min-h-[48px] sm:min-h-[56px] flex items-center justify-center w-full max-w-lg">
                {revealStage === 3 ? (
                  <div className="relative w-full flex items-center justify-center">
                    <div
                      className={`absolute -inset-1.5 rounded-2xl pointer-events-none border-2 ${rankTheme.badgeBorder} ks-shockwave`}
                      aria-hidden="true"
                    />

                    <div
                      className={`relative z-10 w-full sm:w-auto px-8 sm:px-12 py-2 sm:py-2.5 rounded-2xl border-2 font-black text-2xl sm:text-3xl lg:text-4xl tracking-wider flex items-center justify-center gap-3 sm:gap-4 ${
                        ratingDetails.badgeClass
                      } ks-rank-stamp-slam ${
                        presentation.displayRating === 'C' ? 'ks-rank-c-bounce' : ''
                      }`}
                    >
                      <span className="text-amber-400 opacity-80 text-lg sm:text-xl select-none">★</span>
                      <span className={presentation.displayRating === 'S' ? 'ks-rank-shimmer' : ''}>
                        {presentation.displayRating}
                      </span>
                      <span className="text-base sm:text-xl font-bold border-l border-current/30 pl-3 sm:pl-4">
                        {ratingDetails.label}
                      </span>
                      <span className="text-amber-400 opacity-80 text-lg sm:text-xl select-none">★</span>
                    </div>
                  </div>
                ) : (
                  <div className="px-6 py-2 rounded-2xl border border-zinc-800 bg-zinc-950/70 text-zinc-500 text-sm font-bold tracking-wider animate-pulse flex items-center gap-2">
                    <span className="text-base">🎰</span>
                    <span>ĐANG QUAY SỐ...</span>
                  </div>
                )}
              </div>

              {isLenientOrStrict && (
                <div className="relative z-10 mt-2 text-xs sm:text-sm text-zinc-400 font-mono">
                  Điểm gốc: <span className="text-zinc-200 font-bold">{score.score}</span> • {presentation.judgeLabel}
                </div>
              )}
            </div>

            {/* Right Stage Equalizer Wing */}
            <div
              className="hidden md:flex items-end justify-center gap-1.5 lg:gap-2 h-44 lg:h-52 w-24 lg:w-36 shrink-0 pointer-events-none select-none opacity-40"
              aria-hidden="true"
            >
              {[45, 95, 60, 80, 50, 90, 65, 35].map((h, i) => (
                <div
                  key={`rw-${i}`}
                  className={`w-2 lg:w-2.5 rounded-full ${rankTheme.wingColor} ${revealStage === 3 ? 'ks-wing-eq' : ''}`}
                  style={{
                    height: `${h}%`,
                    animationDelay: `${(7 - i) * 0.12}s`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* 3. Room-Readable Judge Remark (text-lg sm:text-2xl) */}
        <div className="w-full bg-zinc-950/90 border border-purple-900/40 rounded-2xl px-4 sm:px-6 py-2.5 sm:py-3.5 flex items-center justify-between gap-3 shadow-md shrink-0">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0 flex-1">
            <span className="text-lg sm:text-xl shrink-0">🎙️</span>
            <span className="font-extrabold text-purple-300 shrink-0 text-sm sm:text-base tracking-wide uppercase">
              {presentation.judgeLabel}:
            </span>
            <span className="text-zinc-100 italic truncate font-semibold text-base sm:text-2xl leading-snug">
              &ldquo;{presentation.remark}&rdquo;
            </span>
          </div>
          {settings?.enableFunRemarks && (
            <button
              type="button"
              onClick={() => setRemarkSeed((s) => s + 1)}
              className="shrink-0 text-cyan-400 hover:text-cyan-300 p-1.5 sm:p-2 hover:bg-zinc-800 rounded-xl border border-zinc-800 transition-all text-sm sm:text-base font-semibold cursor-pointer active:scale-95"
              title="Đổi lời nhận xét khác"
            >
              🎲
            </button>
          )}
        </div>

        {/* 4. Single-Line Summary & Details Toggle */}
        <div className="space-y-2 w-full shrink-0">
          <div className="flex items-center justify-between gap-2 px-4 py-2 sm:py-2.5 rounded-2xl bg-zinc-950/60 border border-zinc-800/80 w-full text-xs sm:text-sm">
            <div className="flex items-center gap-3 sm:gap-6 text-zinc-300 font-medium truncate">
              <span>
                Chuẩn nhịp: <strong className="text-cyan-400 font-bold sm:text-base">{(mode === 'exact' ? score.accuracyPct : breakdown.inTuneAccuracy).toFixed(0)}%</strong>
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                Combo: <strong className="text-amber-400 font-bold sm:text-base">{score.maxCombo}</strong>
              </span>
              <span className="text-zinc-600">•</span>
              <span>
                Độ phủ: <strong className="text-emerald-400 font-bold sm:text-base">{breakdown.activeVocalCoverage.toFixed(0)}%</strong>
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsDetailsOpen((prev) => !prev)}
              className="shrink-0 text-xs sm:text-sm text-zinc-400 hover:text-zinc-200 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 transition-colors font-medium flex items-center gap-1.5 cursor-pointer"
            >
              <span>📊</span>
              <span className="hidden sm:inline">Phân tích chi tiết</span>
              <span className="text-xs">{isDetailsOpen ? '▲' : '▾'}</span>
            </button>
          </div>

          {/* Expandable Technical Breakdown */}
          {isDetailsOpen && (
            <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800 space-y-3 text-xs sm:text-sm animate-in fade-in duration-150">
              {/* Metric 1 */}
              <div className="space-y-1">
                <div className="flex justify-between text-zinc-300">
                  <span>1. Chuẩn cao độ bán âm (In-Tune 40%)</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {breakdown.inTuneAccuracy.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, breakdown.inTuneAccuracy))}%` }}
                  />
                </div>
              </div>

              {/* Metric 2 */}
              <div className="space-y-1">
                <div className="flex justify-between text-zinc-300">
                  <span>2. Độ ổn định &amp; rõ tiếng (Stability 25%)</span>
                  <span className="font-mono font-bold text-cyan-400">
                    {breakdown.stabilityClarity.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-cyan-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, breakdown.stabilityClarity))}%` }}
                  />
                </div>
              </div>

              {/* Metric 3 */}
              <div className="space-y-1">
                <div className="flex justify-between text-zinc-300">
                  <span>3. Độ bao phủ giọng hát (Coverage 20%)</span>
                  <span className="font-mono font-bold text-amber-400">
                    {breakdown.activeVocalCoverage.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, breakdown.activeVocalCoverage))}%` }}
                  />
                </div>
              </div>

              {/* Metric 4 */}
              <div className="space-y-1">
                <div className="flex justify-between text-zinc-300">
                  <span>4. Đa dạng nốt nhạc (Variety 15%)</span>
                  <span className="font-mono font-bold text-purple-400">
                    {breakdown.melodicVariety.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, breakdown.melodicVariety))}%` }}
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 5. Bottom Action Row (h-12 text-base font-bold, always visible) */}
        <div className="flex items-center gap-2.5 sm:gap-4 pt-1 w-full shrink-0">
          <button
            type="button"
            onClick={onReplay}
            className="flex-1 h-12 px-5 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-98 text-white font-bold text-sm sm:text-base shadow-lg shadow-emerald-950/80 cursor-pointer transition-all flex items-center justify-center gap-2"
          >
            <span>🎤 Hát lại bài này</span>
          </button>
          {onSelectSong && (
            <button
              type="button"
              onClick={() => {
                onClose();
                onSelectSong();
              }}
              className="h-12 px-5 sm:px-6 rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-cyan-300 font-bold text-sm sm:text-base border border-zinc-700 cursor-pointer transition-all flex items-center justify-center gap-2 shrink-0"
            >
              <span>🎵 Đổi bài</span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-12 px-6 sm:px-8 rounded-2xl bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-zinc-300 font-bold text-sm sm:text-base border border-zinc-700 cursor-pointer transition-all shrink-0"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
