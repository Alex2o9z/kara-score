import React from 'react';
import type { ScoreRating, ScoreSnapshot, ScoringMode } from '../types/karaoke';

export interface ResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReplay: () => void;
  score: ScoreSnapshot;
  mode: ScoringMode;
  songTitle?: string;
}

function getRatingBadgeDetails(rating: ScoreRating) {
  switch (rating) {
    case 'S':
      return {
        label: 'Hạng S — Xuất Sắc!',
        sub: 'Mastery: Giọng hát cực kỳ chuẩn xác và ổn định!',
        badgeClass:
          'text-amber-400 border-amber-400 bg-amber-950/70 shadow-[0_0_24px_rgba(251,191,36,0.4)]',
      };
    case 'A':
      return {
        label: 'Hạng A — Rất Tốt',
        sub: 'Great Performance: Kỹ thuật bắt nhịp và cao độ rất chuẩn!',
        badgeClass:
          'text-emerald-400 border-emerald-400 bg-emerald-950/70 shadow-[0_0_24px_rgba(52,211,153,0.4)]',
      };
    case 'B':
      return {
        label: 'Hạng B — Đạt Chuẩn',
        sub: 'Solid Effort: Duy trì nhịp tốt, cần thêm độ ổn định.',
        badgeClass:
          'text-blue-400 border-blue-400 bg-blue-950/70 shadow-[0_0_24px_rgba(96,165,250,0.4)]',
      };
    case 'C':
    default:
      return {
        label: 'Hạng C — Cần Luyện Thêm',
        sub: 'Practice More: Hãy tự tin hát to, rõ ràng và bắt đúng nhịp nhé!',
        badgeClass:
          'text-zinc-300 border-zinc-600 bg-zinc-900 shadow-none',
      };
  }
}

export const ResultModal: React.FC<ResultModalProps> = ({
  isOpen,
  onClose,
  onReplay,
  score,
  mode,
  songTitle,
}) => {
  if (!isOpen) return null;

  const ratingDetails = getRatingBadgeDetails(score.rating);
  const { breakdown } = score;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="result-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-lg rounded-2xl bg-zinc-900 border border-zinc-700 shadow-2xl p-6 text-zinc-100 space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs uppercase font-extrabold tracking-wider px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
              {mode === 'exact' ? 'Tier 1: Exact Melody' : 'Tier 2: Vocal Performance'}
            </span>
          </div>
          <h2 id="result-modal-title" className="text-2xl font-black tracking-tight text-white">
            Kết Quả Hát Karaoke
          </h2>
          {mode === 'smart' ? (
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Đánh giá độ ổn định cao độ, độ chuẩn bán âm &amp; mức độ tham gia khi chưa có phổ nốt chuẩn.
            </p>
          ) : songTitle ? (
            <p className="text-xs text-zinc-400 truncate max-w-md mx-auto">
              {songTitle}
            </p>
          ) : null}
        </div>

        {/* Score & Rating Display */}
        <div className="flex flex-col items-center justify-center p-5 rounded-xl bg-zinc-950/80 border border-zinc-800 space-y-3">
          <div className="flex items-baseline gap-2">
            <span className="text-6xl font-black tracking-tighter text-emerald-400">
              {score.score}
            </span>
            <span className="text-lg text-zinc-500 font-bold">/ 100</span>
          </div>

          <div
            className={`px-4 py-1.5 rounded-xl border-2 font-black text-xl tracking-wide flex items-center gap-2 ${ratingDetails.badgeClass}`}
          >
            <span>{score.rating}</span>
            <span className="text-sm font-semibold border-l border-current/30 pl-2">
              {ratingDetails.label}
            </span>
          </div>

          <p className="text-xs text-zinc-400 text-center max-w-xs">
            {ratingDetails.sub}
          </p>

          <div className="flex items-center gap-6 pt-2 text-xs border-t border-zinc-800/80 w-full justify-center">
            <div className="text-center">
              <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Max Combo</span>
              <span className="font-bold text-amber-400 text-sm">{score.maxCombo}</span>
            </div>
            {mode === 'exact' && (
              <div className="text-center">
                <span className="text-zinc-500 block text-[10px] uppercase font-semibold">Độ chuẩn nốt mẫu</span>
                <span className="font-bold text-cyan-400 text-sm">
                  {score.accuracyPct.toFixed(1)}%
                </span>
              </div>
            )}
          </div>
        </div>

        {/* 4 Vocal Metrics Breakdown */}
        <div className="space-y-3">
          <div className="text-xs font-bold text-zinc-300 uppercase tracking-wider flex items-center justify-between">
            <span>Chi tiết 4 tiêu chí Vocal Performance</span>
            <span className="text-[10px] text-zinc-500 font-normal">Trọng số 100%</span>
          </div>

          <div className="space-y-2.5 text-xs">
            {/* Metric 1 */}
            <div className="space-y-1">
              <div className="flex justify-between text-zinc-300">
                <span>1. Chuẩn cao độ bán âm (In-Tune 40%)</span>
                <span className="font-mono font-bold text-emerald-400">
                  {breakdown.inTuneAccuracy.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, breakdown.inTuneAccuracy))}%` }}
                />
              </div>
            </div>

            {/* Metric 2 */}
            <div className="space-y-1">
              <div className="flex justify-between text-zinc-300">
                <span>2. Độ ổn định & rõ tiếng (Stability 25%)</span>
                <span className="font-mono font-bold text-cyan-400">
                  {breakdown.stabilityClarity.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
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
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
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
              <div className="h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(0, breakdown.melodicVariety))}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onReplay}
            className="flex-1 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm shadow-lg shadow-emerald-950/60 cursor-pointer transition-colors flex items-center justify-center gap-2"
          >
            <span>🎤 Hát lại (Replay)</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="py-3 px-5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 text-zinc-300 font-semibold text-sm border border-zinc-700 cursor-pointer transition-colors"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
