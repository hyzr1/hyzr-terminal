"use client";
/**
 * TimeAndSalesPanel (fx19) — the market tape: every public trade print for
 * the panel's market, newest first (Hyperliquid `trades` stream).
 * Columns: Time | Price | Size — price colored by taker side (buy green /
 * sell pink). New prints flash in via a mount animation (rows are keyed by
 * trade id, so only the arriving print animates).
 */
import { usePerpsData, useCoinWatch } from "@/lib/hyperliquid/perpsStore";
import { fmtPrice, fmtTime } from "@/lib/hyperliquid/format";

export default function TimeAndSalesPanel({ coin: coinProp }: { coin?: string }) {
  const storeCoin = usePerpsData((s) => s.coin);
  const coin = coinProp ?? storeCoin;
  useCoinWatch(coin);

  const tape = usePerpsData((s) => s.tapes[coin]);
  const byName = usePerpsData((s) => s.byName);
  const meta = byName[coin]?.meta;

  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-backgroundSecondary">
      {/* column captions */}
      <div className="flex h-[26px] flex-shrink-0 items-center border-b border-primaryStroke px-[14px] text-[10px] font-medium uppercase tracking-[0.05em] text-textTertiary">
        <span className="flex-1 text-left">Time</span>
        <span className="flex-1 text-right">Price</span>
        <span className="flex-1 text-right">Size</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto font-GeistMono [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {!tape || tape.length === 0 ? (
          <div className="flex h-[72px] items-center justify-center text-[12px] text-textSecondary">
            Waiting for prints…
          </div>
        ) : (
          tape.map((t) => (
            <div
              key={t.tid}
              className="row-in flex min-h-[21px] items-center px-[14px] hover:bg-primaryStroke/20"
            >
              <span className="flex-1 text-left text-[10.5px] text-textSecondary">{fmtTime(t.time)}</span>
              <span className={`flex-1 text-right text-[11px] tabular-nums ${t.side === "B" ? "text-increase" : "text-decrease"}`}>
                {fmtPrice(meta, t.px)}
              </span>
              <span className="flex-1 text-right text-[11px] text-textPrimary tabular-nums">
                {fmtCompact(t.sz)}
              </span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function fmtCompact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return +v.toFixed(4) + "";
}
