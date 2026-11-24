import React from 'react';

export interface LatencyControlProps {
  latencyOffsetMs: number;
  setLatencyOffsetMs: (ms: number) => void;
}

const STORAGE_KEY = 'karascore_latency_offset_ms';

export const LatencyControl: React.FC<LatencyControlProps> = ({
  latencyOffsetMs,
  setLatencyOffsetMs,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextVal = parseInt(e.target.value, 10);
    if (!Number.isNaN(nextVal)) {
      setLatencyOffsetMs(nextVal);
      try {
        localStorage.setItem(STORAGE_KEY, String(nextVal));
      } catch {
        // Safe fallback for restricted storage environments
      }
    }
  };

  const handleSetPreset = (val: number) => {
    setLatencyOffsetMs(val);
    try {
      localStorage.setItem(STORAGE_KEY, String(val));
    } catch {
      // Safe fallback
    }
  };

  const formattedOffset =
    latencyOffsetMs > 0 ? `+${latencyOffsetMs}ms` : `${latencyOffsetMs}ms`;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-zinc-900/60 border border-zinc-800 text-xs">
      <div className="space-y-0.5">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-zinc-200">⏱️ Bù độ trễ âm thanh (Latency Offset):</span>
          <span
            className={`font-mono font-bold px-2 py-0.5 rounded text-xs ${
              latencyOffsetMs === 0
                ? 'bg-zinc-800 text-zinc-300'
                : latencyOffsetMs > 0
                  ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                  : 'bg-amber-950 text-amber-300 border border-amber-800'
            }`}
          >
            {formattedOffset}
          </span>
        </div>
        <p className="text-[11px] text-zinc-500">
          Chỉnh khi video & giọng hát lệch nhịp (-300ms đến +300ms, bước 10ms).
        </p>
      </div>

      <div className="flex items-center gap-3 w-full sm:w-auto">
        <input
          type="range"
          min={-300}
          max={300}
          step={10}
          value={latencyOffsetMs}
          onChange={handleChange}
          aria-label="Điều chỉnh độ trễ âm thanh"
          className="w-full sm:w-48 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-cyan-400 focus:outline-none"
        />

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => handleSetPreset(0)}
            disabled={latencyOffsetMs === 0}
            className="px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 active:bg-zinc-600 disabled:opacity-40 text-zinc-300 font-mono text-[11px] border border-zinc-700 cursor-pointer disabled:cursor-not-allowed transition-colors"
            title="Đặt lại về 0ms"
          >
            0ms
          </button>
        </div>
      </div>
    </div>
  );
};
