"use client";

import { useMemo, useState } from "react";
import { ASSETS } from "@/lib/hyzr-data";
import { ChartTypeIcon } from "../ui/icons";
import { useLive } from "../live/LiveProvider";

/* --------------------------------------------------------------------- */
/* seeded chart data                                                      */
/* --------------------------------------------------------------------- */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* hand-tuned 24h shape lifted from the reference screenshot:
   flat/bumpy low range, then a sharp double-top rally near the end */
const SHAPE_24H = [
  0.43, 0.36, 0.42, 0.3, 0.25, 0.32, 0.22, 0.28, 0.3, 0.24, 0.34, 0.3, 0.4,
  0.36, 0.3, 0.38, 0.33, 0.28, 0.35, 0.3, 0.22, 0.18, 0.26, 0.2, 0.24, 0.3,
  0.22, 0.28, 0.34, 0.3, 0.36, 0.55, 0.48, 0.62, 0.7, 0.64, 0.8, 0.9, 0.97,
  0.85, 0.93, 0.78, 0.9, 0.76, 0.86, 0.78, 0.85, 0.82,
];

type Tf = "1m" | "1hr" | "4hr" | "24hr";

const SERIES: Record<
  Tf,
  { seed: number; high: string; low: string; price: string; pct: string }
> = {
  "1m": {
    seed: 7,
    high: "$103.72",
    low: "$103.55",
    price: "$103.66",
    pct: "+0.03%",
  },
  "1hr": {
    seed: 17,
    high: "$104.10",
    low: "$102.48",
    price: "$103.72",
    pct: "+0.11%",
  },
  "4hr": {
    seed: 29,
    high: "$105.32",
    low: "$100.86",
    price: "$104.85",
    pct: "+1.25%",
  },
  "24hr": {
    seed: 0,
    high: "$110.93",
    low: "$70.55",
    price: "$103.67",
    pct: "+27.08%",
  },
};

function buildSeries(tf: Tf): number[] {
  const { seed } = SERIES[tf];
  if (seed === 0) return SHAPE_24H;
  const rnd = mulberry32(seed);
  const n = 48;
  const pts: number[] = [];
  let v = 0.35 + rnd() * 0.3;
  for (let i = 0; i < n; i++) {
    // gentle random walk with a mild rally at the end
    const rally = i > n * 0.7 ? (i - n * 0.7) / (n * 0.3) : 0;
    const drift = rally * 0.55;
    v = v + (rnd() - 0.48) * 0.16 + drift * 0.08;
    v = Math.max(0.08, Math.min(0.96, v));
    pts.push(v);
  }
  pts[n - 1] = 0.72 + rnd() * 0.1;
  return pts;
}

function SolChart({ points }: { points: number[] }) {
  const W = 440;
  const H = 296;
  const PAD_X = 6;
  const PAD_T = 10;
  const PAD_B = 8;
  const iw = W - PAD_X * 2;
  const ih = H - PAD_T - PAD_B;
  const step = iw / (points.length - 1);
  const d = points
    .map(
      (v, i) =>
        `${i === 0 ? "M" : "L"}${(PAD_X + i * step).toFixed(1)},${(
          PAD_T +
          (1 - v) * ih
        ).toFixed(1)}`,
    )
    .join(" ");
  const area = `${d} L${(PAD_X + iw).toFixed(1)},${H - PAD_B} L${PAD_X},${H - PAD_B} Z`;
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="sol-pop-area" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgb(47 227 172 / 0.22)" />
          <stop offset="100%" stopColor="rgb(47 227 172 / 0)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sol-pop-area)" />
      <path
        d={d}
        fill="none"
        stroke="rgb(47 227 172)"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* --------------------------------------------------------------------- */
/* popover content                                                        */
/* --------------------------------------------------------------------- */
export function SolPricePopoverContent({ close: _close }: { close: () => void }) {
  const [tf, setTf] = useState<Tf>("24hr");
  const [chartMode, setChartMode] = useState<"line" | "depth">("line");
  const [showTraders, setShowTraders] = useState(false);
  const { sol, solHistory } = useLive();
  const s = SERIES[tf];
  void _close;

  /* live history (fall back to the hand-tuned seeded shapes pre-stream) */
  const live = solHistory.length >= 2 && sol > 0;
  const points = useMemo(() => {
    if (live) {
      const lo = Math.min(...solHistory);
      const hi = Math.max(...solHistory);
      const span = hi - lo || 0.01;
      return solHistory.map(
        (v) => 0.08 + ((v - lo) / span) * 0.84,
      );
    }
    return buildSeries(tf);
  }, [live, solHistory, tf]);

  const hiV = live ? Math.max(...solHistory) : parseFloat(s.high.slice(1));
  const loV = live ? Math.min(...solHistory) : parseFloat(s.low.slice(1));
  const pct =
    live && solHistory[0] > 0
      ? ((sol - solHistory[0]) / solHistory[0]) * 100
      : parseFloat(s.pct);
  const up = pct >= 0;

  return (
    <div className="w-[calc(100vw-24px)] max-w-[462px] overflow-hidden rounded-[14px]">
      {/* header */}
      <div className="flex flex-row items-center justify-between px-[16px] pb-[8px] pt-[14px]">
        <div className="flex flex-row items-center gap-[10px]">
          <img src={ASSETS.sol} alt="SOL" width={22} height={22} />
          <span className="text-[17px] font-bold text-textPrimary">SOL</span>
        </div>
        <div className="flex flex-row items-center gap-[8px]">
          <button
            type="button"
            onClick={() => setChartMode((m) => (m === "line" ? "depth" : "line"))}
            className={`flex h-[30px] w-[30px] items-center justify-center rounded-[8px] transition-colors duration-150 ${
              chartMode === "line"
                ? "bg-white/[0.08] text-textPrimary"
                : "bg-white/[0.04] text-textSecondary hover:text-textPrimary"
            }`}
          >
            <ChartTypeIcon size={15} />
          </button>
          <button
            type="button"
            title="Show active traders"
            onClick={() => setShowTraders((v) => !v)}
            className={`flex h-[30px] w-[30px] items-center justify-center rounded-[8px] transition-colors duration-150 ${
              showTraders
                ? "bg-white/[0.08] text-textPrimary"
                : "bg-white/[0.04] text-textSecondary hover:text-textPrimary"
            }`}
          >
            <i className="ri-user-3-line text-[15px]" />
          </button>
          <div className="ml-[2px] flex flex-row items-center gap-[2px]">
            {(["1m", "1hr", "4hr", "24hr"] as Tf[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTf(t)}
                className={`flex h-[30px] items-center rounded-[8px] px-[10px] text-[14px] font-semibold transition-colors duration-150 ${
                  tf === t
                    ? "bg-white/[0.08] text-textPrimary"
                    : "text-textTertiary hover:text-textSecondary"
                }`}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* chart */}
      <div className="h-[290px] w-full px-[2px]">
        {chartMode === "line" ? (
          <SolChart points={points} />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <div className="flex flex-row items-end gap-[3px] px-[24px] pb-[10px]">
              {points.map((v, i) => (
                <div
                  key={i}
                  className="w-[5px] rounded-[1px] bg-[rgb(47_227_172)]"
                  style={{
                    height: `${Math.max(4, v * 240)}px`,
                    opacity: 0.35 + v * 0.65,
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* active traders overlay row */}
      {showTraders ? (
        <div className="flex flex-row items-center justify-between border-t border-white/[0.06] px-[16px] py-[10px]">
          <div className="flex flex-row items-center gap-[8px]">
            <i className="ri-group-line text-[14px] text-textTertiary" />
            <span className="text-[13px] font-medium text-textTertiary">Active traders (24h)</span>
          </div>
          <span className="font-GeistMono text-[14px] font-semibold text-textPrimary">
            {(18420 + Math.round(sol * 37)).toLocaleString()}
          </span>
        </div>
      ) : null}

      {/* stats footer */}
      <div className="flex flex-row items-end justify-between px-[16px] pb-[16px] pt-[10px]">
        <div className="flex flex-col gap-[6px]">
          <div className="flex flex-row items-center gap-[8px]">
            <span className="h-[2px] w-[10px] rounded-full bg-textTertiary" />
            <span className="text-[13px] font-medium text-textTertiary">
              HIGH
            </span>
            <span className="text-[15px] font-semibold text-textPrimary">
              {live ? `$${hiV.toFixed(2)}` : s.high}
            </span>
          </div>
          <div className="flex flex-row items-center gap-[8px]">
            <span className="h-[2px] w-[10px] rounded-full bg-textTertiary" />
            <span className="text-[13px] font-medium text-textTertiary">
              LOW
            </span>
            <span className="text-[15px] font-semibold text-textPrimary">
              {live ? `$${loV.toFixed(2)}` : s.low}
            </span>
          </div>
          <div className="flex flex-row items-center gap-[4px] pl-[2px]">
            <span className={`text-[11px] leading-none ${up ? "text-increase" : "text-decrease"}`}>
              {up ? "▲" : "▼"}
            </span>
            <span
              className={`text-[14px] font-semibold ${
                up ? "text-increase" : "text-decrease"
              }`}
            >
              {up ? "+" : "-"}
              {Math.abs(pct).toFixed(2)}%
            </span>
          </div>
        </div>
        <div
          className={`text-[34px] font-bold leading-none ${
            up ? "text-increase" : "text-decrease"
          }`}
        >
          {live ? `$${sol.toFixed(2)}` : s.price}
        </div>
      </div>
    </div>
  );
}
