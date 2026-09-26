"use client";
/**
 * MobileTerminal (fx18/fx19) — the <lg Trade Lab is its OWN structure, not a
 * reflow of the desktop workspace (no panel drag/resize on touch):
 *   · the dock "Trade" button lands here on the DOM / order-entry view —
 *     the price ladder is the default module, with the account P&L header
 *     (realized · unrealized · account) across the top of the screen
 *   · bottom tab bar: Chart / DOM / Positions / Orders + a THREE-DOT
 *     overflow for the less-frequent panels (Time & Sales, Trades history,
 *     Account details) — one module on screen at a time, full-screen
 *   · floating gradient "+" FAB → order ticket as an Apple-style bottom
 *     sheet (grabber, spring slide-up, drag-down / backdrop dismiss)
 * Every tap target ≥ 40×40px.
 */
import { useEffect, useState } from "react";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import { baseName } from "@/lib/hyperliquid/types";
import { fmtPrice, fmtFunding, fmtCountdown, nextFundingTime } from "@/lib/hyperliquid/format";
import { useClock } from "@/hooks/use-clock";
import HlIcon from "./HlIcon";
import PerpsChart from "./PerpsChart";
import DomPanel, { PnlStrip } from "./DomPanel";
import TimeAndSalesPanel from "./TimeAndSalesPanel";
import AccountPanel from "./AccountPanel";
import PositionsPanel from "./PositionsPanel";
import OrderSheet from "./OrderSheet";
import MarketSelector from "./MarketSelector";

type Module = "chart" | "dom" | "positions" | "orders" | "trades" | "tas" | "account";

/* fx20: Chart/DOM previously used non-existent Remix classes
   (ri-candlestick-line / ri-bar-grouped-line) — the <i> rendered NO glyph at
   all, which read as missing icons next to Positions/Orders. These are valid
   glyphs from the same font at the same 17px weight. */
const TABS: Array<[Module, string, string]> = [
  ["chart", "Chart", "ri-line-chart-line"],
  ["dom", "DOM", "ri-bar-chart-grouped-line"],
  ["positions", "Positions", "ri-file-list-3-line"],
  ["orders", "Orders", "ri-instance-line"],
];

const OVERFLOW: Array<[Module, string, string]> = [
  ["tas", "Time & Sales", "ri-time-line"],
  ["trades", "Trades history", "ri-exchange-dollar-line"],
  ["account", "Account details", "ri-wallet-3-line"],
];

export default function MobileTerminal() {
  const coin = usePerpsData((s) => s.coin);
  const byName = usePerpsData((s) => s.byName);
  const mids = usePerpsData((s) => s.mids);
  const now = useClock();

  /* fx19: Trade navigation lands on the DOM / order-entry view */
  const [module, setModule] = useState<Module>("dom");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [armedPick, setArmedPick] = useState<{ px: number; side?: "ask" | "bid" } | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [selectorOpen, setSelectorOpen] = useState(false);

  const meta = byName[coin]?.meta;
  const ctx = byName[coin]?.ctx;
  const mid = mids[coin] ?? (ctx ? +ctx.midPx : null);
  const prevDay = ctx ? +ctx.prevDayPx : null;
  const change = mid != null && prevDay ? ((mid - prevDay) / prevDay) * 100 : null;
  const mark = ctx ? +ctx.markPx : mid;
  const funding = ctx ? +ctx.funding : null;
  const countdown = now ? fmtCountdown(nextFundingTime(now) - now) : "--";

  /* DOM price tap on mobile: the ticket is not mounted while the sheet is
     closed, so the terminal catches the pick, opens the sheet and hands the
     price over as the initial armed limit. */
  useEffect(
    () => {
      const h = (e: Event) => {
        const d = (e as CustomEvent).detail as number | { px: number; side?: "ask" | "bid" };
        const pick = typeof d === "number" ? { px: d } : d;
        setArmedPick(pick);
        setSheetOpen(true);
      };
      window.addEventListener("perps-pick-price", h);
      return () => window.removeEventListener("perps-pick-price", h);
    },
    [],
  );

  return (
    <div className="relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-backgroundSecondary">
      {/* ---------- compact header (48px, all targets ≥40px) ---------- */}
      {/* fx20: pill|divider|gear cluster (was a crowded 6px gap). The header's
          left-side paddings/gaps are a touch slimmer so the live PRICE never
          has to truncate at 390 to fund that separation. */}
      <div className="flex h-[48px] shrink-0 items-center gap-[6px] border-b border-primaryStroke px-[8px]">
        <button
          onClick={() => setSelectorOpen(true)}
          className="flex h-[40px] min-w-[64px] items-center gap-[4px] rounded-[10px] px-[6px] transition-colors hover:bg-primaryStroke/30"
        >
          <HlIcon coin={coin} size={22} />
          <span className="text-[15px] font-semibold tracking-[-0.01em] text-textPrimary">{baseName(coin)}</span>
          <i className="ri-arrow-down-s-line text-[16px] text-textSecondary" />
        </button>

        <div className="flex min-w-0 flex-row items-baseline gap-[6px]">
          <span className="truncate text-[16px] font-medium leading-[20px] text-textPrimary [font-variant-numeric:tabular-nums]">
            {fmtPrice(meta, mark)}
          </span>
          <span className={`shrink-0 text-[11px] font-normal leading-[14px] ${change != null && change < 0 ? "text-decrease" : "text-increase"}`}>
            {change != null ? `${change >= 0 ? "+" : ""}${change.toFixed(2)}%` : "--"}
          </span>
        </div>

        {/* fx20: pill and gear read as one crowded cluster at gap-6px — a hairline
            divider (the dock's h-16 w-px white/10 language) with real gaps on
            both sides gives the gear its own zone. Pill/divider/gear never squeeze. */}
        <div className="ml-auto flex items-center gap-[10px]">
          <span className="flex h-[28px] shrink-0 items-center gap-[4px] rounded-full border border-primaryStroke px-[8px] text-[10px] leading-none">
            <span className={funding != null && funding < 0 ? "text-decrease" : "text-increase"}>{fmtFunding(funding)}</span>
            <span className="text-textTertiary [font-variant-numeric:tabular-nums]">{countdown}</span>
          </span>
          <span aria-hidden="true" className="h-[16px] w-[1px] shrink-0 bg-white/10" />
          <button
            title="Trading mode"
            aria-label="Trading mode"
            onClick={() => window.dispatchEvent(new CustomEvent("perps-open-settings"))}
            className="flex h-[40px] w-[40px] items-center justify-center rounded-[10px] text-[18px] text-textSecondary transition-colors hover:bg-primaryStroke/30 hover:text-textPrimary"
          >
            <i className="ri-settings-3-line" />
          </button>
        </div>
      </div>

      {/* -------- account P&L header (all non-chart modules) -------- */}
      {module !== "chart" && module !== "dom" && <PnlStrip compactMode />}

      {/* ---------------- module (one at a time, full-screen) ---------------- */}
      <div className="min-h-0 w-full flex-1">
        {module === "chart" && (
          /* chart runs edge-to-edge; its own bottom bar clears the tab bar */
          <div className="h-full w-full pb-[112px]">
            <PerpsChart />
          </div>
        )}
        {module === "dom" && (
          /* the DOM / order-entry view — P&L header + ladder with
             tap-to-arm (hands the price to the order sheet) */
          <div className="h-full w-full overflow-hidden pb-[112px]">
            <DomPanel mode="mobile" />
          </div>
        )}
        {module === "tas" && (
          <div className="h-full w-full overflow-hidden pb-[112px]">
            <TimeAndSalesPanel />
          </div>
        )}
        {module === "account" && (
          <div className="h-full w-full overflow-hidden pb-[112px]">
            <AccountPanel />
          </div>
        )}
        {(module === "positions" || module === "orders" || module === "trades") && (
          <div className="h-full w-full overflow-hidden pb-[112px]">
            <PositionsPanel
              soloTab={module}
              onResizeStart={() => undefined}
              height={0}
            />
          </div>
        )}
      </div>

      {/* ---------------- floating "+" FAB (order ticket) ---------------- */}
      {!sheetOpen && (
        <button
          onClick={() => { setArmedPick(null); setSheetOpen(true); }}
          aria-label="Open order ticket"
          title="Order ticket"
          className="absolute bottom-[124px] right-[14px] z-40 flex h-[52px] w-[52px] items-center justify-center rounded-full bg-gradient-to-br from-[#B28FFF] to-[#FF9EE5] text-white shadow-[0_10px_28px_rgba(178,143,255,0.42)] transition-transform active:scale-[0.94]"
        >
          <i className="ri-add-line text-[28px] leading-none" />
        </button>
      )}

      {/* ---------------- bottom module tab bar + overflow ---------------- */}
      <nav
        aria-label="Terminal modules"
        className="glass-pop absolute inset-x-[8px] bottom-[54px] z-40 flex h-[54px] items-stretch gap-[2px] rounded-[16px] border border-white/10 px-[6px] shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
      >
        {TABS.map(([id, label, icon]) => {
          const active = module === id;
          return (
            <button
              key={id}
              onClick={() => setModule(id)}
              aria-current={active ? "page" : undefined}
              className={`relative flex min-w-[44px] flex-1 flex-col items-center justify-center gap-[2px] rounded-[12px] transition-colors ${
                active ? "text-textPrimary" : "text-textTertiary hover:text-textSecondary"
              }`}
            >
              {active && <span className="absolute inset-x-[10px] top-[6px] h-[2px] rounded-full bg-primaryBlue" />}
              <i className={`${icon} text-[17px] leading-none`} />
              <span className="text-[9.5px] font-medium leading-[12px]">{label}</span>
            </button>
          );
        })}

        {/* three-dot overflow — less-frequent panels */}
        <div className="relative flex items-stretch">
          <button
            onClick={() => setOverflowOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={overflowOpen}
            title="More panels"
            data-testid="mobile-overflow"
            className={`relative flex min-w-[44px] flex-1 flex-col items-center justify-center gap-[2px] rounded-[12px] transition-colors ${
              overflowOpen || (module !== "chart" && module !== "dom" && module !== "positions" && module !== "orders")
                ? "text-textPrimary"
                : "text-textTertiary hover:text-textSecondary"
            }`}
          >
            {(module === "tas" || module === "trades" || module === "account") && (
              <span className="absolute inset-x-[10px] top-[6px] h-[2px] rounded-full bg-primaryBlue" />
            )}
            <i className="ri-more-fill text-[17px] leading-none" />
            <span className="text-[9.5px] font-medium leading-[12px]">More</span>
          </button>

          {overflowOpen && (
            <div
              role="menu"
              className="glass-pop-strong pop-in absolute bottom-[60px] right-0 z-50 w-[172px] rounded-[12px] border border-white/10 p-[5px] shadow-dropdown"
              data-testid="mobile-overflow-menu"
            >
              {OVERFLOW.map(([id, label, icon]) => (
                <button
                  key={id}
                  role="menuitem"
                  onClick={() => { setModule(id); setOverflowOpen(false); }}
                  className={`flex min-h-[40px] w-full items-center gap-[9px] rounded-[9px] px-[9px] text-left text-[12.5px] transition-colors ${
                    module === id ? "bg-primaryStroke/60 text-textPrimary" : "text-textSecondary hover:bg-white/[0.06] hover:text-textPrimary"
                  }`}
                >
                  <i className={`${icon} text-[15px] text-textTertiary`} />
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </nav>

      {/* ---------------- order ticket bottom sheet ---------------- */}
      <OrderSheet open={sheetOpen} armedPick={armedPick} onClose={() => setSheetOpen(false)} />

      {/* ---------------- market selector ---------------- */}
      {selectorOpen && <MarketSelector onClose={() => setSelectorOpen(false)} />}
    </div>
  );
}
