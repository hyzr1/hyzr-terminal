"use client";
/**
 * Trade panel (right, 320px) — Long/Short, Market/Limit, always-inline
 * leverage card (no popup), amount + slider, TP/SL, margin rows, submit,
 * "powered by Hyperliquid".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { usePerpsData, useCoinWatch } from "@/lib/hyperliquid/perpsStore";
import { baseName } from "@/lib/hyperliquid/types";
import { useTradeStore, accountValueCalc, estLiqPrice, unrealizedPnl, toast, DEMO_DEPOSIT, tradeDraft } from "@/lib/hyperliquid/tradeStore";
import { fmtPrice, fmtUsd, fmtUsdFull, fmtSzQuote, fmtPxQuote } from "@/lib/hyperliquid/format";
import HlIcon from "./HlIcon";

type Side = "long" | "short";
type OrderType = "market" | "limit";

const TICKS = [0, 25, 50, 75, 100];

export default function TradePanel({
  variant = "column",
  armedPick = null,
  coin: coinProp,
}: {
  /* column = desktop right terminal column · sheet = mobile bottom sheet ·
     panel = fx19 workspace Order Panel (no fixed width) */
  variant?: "column" | "sheet" | "panel";
  /* DOM price tap handed over from the mobile terminal (applied on mount) */
  armedPick?: { px: number; side?: "ask" | "bid" } | null;
  /* fx19: panel-scoped market — an independent Order Panel can point at any
     market; defaults to the primary store coin */
  coin?: string;
}) {
  const storeCoin = usePerpsData((s) => s.coin);
  const coin = coinProp ?? storeCoin;
  useCoinWatch(coin); // real book fills for this market
  const byName = usePerpsData((s) => s.byName);
  const mids = usePerpsData((s) => s.mids);

  const mode = useTradeStore((s) => s.mode);
  const balance = useTradeStore((s) => s.balance);
  const positions = useTradeStore((s) => s.positions);
  const leverageMap = useTradeStore((s) => s.leverage);
  const marginModeMap = useTradeStore((s) => s.marginMode);
  const setLeverage = useTradeStore((s) => s.setLeverage);
  const deposit = useTradeStore((s) => s.deposit);

  const metaInit = byName[coin]?.meta;
  /* armedPick (mobile DOM tap → sheet) initializes the ticket directly —
     lazy state, no mount-effect setState cascade */
  const [side, setSide] = useState<Side>(
    armedPick?.side ? (armedPick.side === "ask" ? "short" : "long") : "long",
  );
  const [type, setType] = useState<OrderType>(armedPick ? "limit" : "market");
  const [amount, setAmount] = useState("");
  const [sliderPct, setSliderPct] = useState(0);
  const [tpsl, setTpsl] = useState(false);
  const [tpPx, setTpPx] = useState("");
  const [slPx, setSlPx] = useState("");
  const [limitPx, setLimitPx] = useState(armedPick ? fmtPxQuote(armedPick.px, metaInit) : "");

  const meta = byName[coin]?.meta;
  const ctx = byName[coin]?.ctx;
  const base = baseName(coin);
  const mid = mids[coin] ?? (ctx ? +ctx.midPx : null);
  const lev = leverageMap[coin] ?? 5;
  const isCross = (marginModeMap[coin] ?? "cross") === "cross";
  const position = positions[coin];
  const maxLev = Math.max(1, meta?.maxLeverage ?? 20);
  const levSafe = Math.min(lev, maxLev);
  const applyLev = (v: number) => {
    const next = Math.max(1, Math.min(maxLev, Math.round(v)));
    if (next !== levSafe) setLeverage(coin, next, isCross);
  };

  const accountValue = useMemo(() => accountValueCalc(balance, positions, mids), [balance, positions, mids]);
  const avail = useMemo(() => {
    let used = 0;
    let upnl = 0;
    for (const p of Object.values(positions)) {
      const mark = mids[p.coin] ?? p.entryPx;
      upnl += (mark - p.entryPx) * p.szi;
      used += (Math.abs(p.szi) * p.entryPx) / p.leverage;
    }
    return Math.max(0, balance + upnl - used);
  }, [balance, positions, mids]);

  const liq = estLiqPrice(position, avail);

  // `amount` = USDC notional (the real input is USDC-denominated);
  // size in coin = notional / price.
  const notional = parseFloat(amount) || 0;
  const pxNum = type === "limit" ? parseFloat(limitPx) || mid || 0 : mid || 0;
  const szNum = pxNum > 0 ? notional / pxNum : 0;
  const marginNeeded = notional / lev;

  // chart click-to-place-limits reads the same size the panel shows
  useEffect(() => {
    tradeDraft.usd = notional;
  }, [notional]);

  // slider = % of max buy power, expressed in USDC
  const maxSize = useMemo(() => Math.max(0, avail * lev), [avail, lev]);

  const applySlider = (pct: number) => {
    setSliderPct(pct);
    if (pct > 0 && maxSize > 0) {
      setAmount(usdcStr((maxSize * pct) / 100));
    }
  };

  // book row click → limit price (legacy number detail or {px, side} —
  // side-aware per ProjectX DOM: tap an ask → sell limit there, bid → buy)
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail as number | { px: number; side?: "ask" | "bid" };
      const px = typeof d === "number" ? d : d.px;
      const sd = typeof d === "number" ? undefined : d.side;
      if (sd) setSide(sd === "ask" ? "short" : "long");
      setType("limit");
      setLimitPx(fmtPxQuote(px, meta));
    };
    window.addEventListener("perps-pick-price", h);
    return () => window.removeEventListener("perps-pick-price", h);
  }, [meta]);

  const sliderRef = useRef<HTMLDivElement>(null);
  const onSlider = (clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pct = Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100));
    applySlider(Math.round(pct));
  };

  const submit = async () => {
    if (accountValue <= 0) {
      deposit(DEMO_DEPOSIT);
      toast(`Added $${DEMO_DEPOSIT.toLocaleString()} demo USDC`, "success");
      return;
    }
    if (!(szNum > 0)) {
      toast("Enter an amount", "error");
      return;
    }
    const roundedSz = +(szNum.toFixed(Math.min(meta?.szDecimals ?? 4, 6)));
    if (!(roundedSz > 0)) {
      toast("Amount too small for this market", "error");
      return;
    }
    const st = useTradeStore.getState();
    const res = await st.placeOrder({
      coin,
      isBuy: side === "long",
      sz: roundedSz,
      type,
      px: type === "limit" ? parseFloat(limitPx) || mid || 0 : undefined,
      tif: type === "limit" ? "Gtc" : undefined,
      tp: tpsl && parseFloat(tpPx) ? parseFloat(tpPx) : null,
      sl: tpsl && parseFloat(slPx) ? parseFloat(slPx) : null,
    });
    if (!res.ok && res.error) toast(res.error, "error");
    if (res.ok) {
      setAmount("");
      setSliderPct(0);
      setTpPx("");
      setSlPx("");
      tradeDraft.usd = 0;
    }
  };

  const insufficient = accountValue <= 0 || (notional > 0 && marginNeeded > avail + 1e-9);
  const submitLabel =
    insufficient
      ? "Add More Funds"
      : type === "market"
        ? side === "long" ? "Buy" : "Sell"
        : side === "long" ? "Buy / Limit" : "Sell / Limit";

  const isLong = side === "long";
  const sheet = variant === "sheet";

  return (
    /* column: lg:pb keeps desktop controls above the floating dock.
       sheet: natural-height flow inside the mobile bottom sheet.
       panel: workspace Order Panel — NATURAL height (no stretch, no clip):
       the panel frame's scroll wrapper owns overflow, so every control stays
       reachable at any panel size. (fx22: the old full-height-column layout
       — flex-1 stretch sections + overflow-hidden shrink — left dead gaps
       and cut the submit button off inside short panels.) */
    <div className={
      sheet
        ? "flex w-full min-w-0 flex-col"
        : variant === "panel"
          ? "flex w-full shrink-0 flex-col pb-[10px]"
          : "flex min-h-[0px] w-full min-w-[320px] flex-col overflow-hidden lg:max-w-[320px] lg:pb-[56px]"
    }>
      <div className="relative flex w-full flex-col">
        {/* Long / Short */}
        <div className={sheet ? "flex w-full flex-shrink-0 flex-col px-[2px] pt-[2px]" : "flex flex-shrink-0 flex-col"}>
          <div className={sheet ? "flex w-full flex-row items-center justify-center rounded-[12px] border border-primaryStroke bg-primaryStroke/40 p-[4px]" : "flex h-[64px] flex-shrink-0 flex-row items-center justify-center border-b border-primaryStroke p-[12px]"}>
            <div className={`flex flex-1 flex-row items-center justify-center gap-[4px] rounded-[8px] ${sheet ? "" : "max-h-[40px] min-h-[40px] rounded-[12px] border border-primaryStroke bg-primaryStroke/50 p-[4px]"}`}>
              <button
                onClick={() => setSide("long")}
                className={`flex flex-1 flex-row items-center justify-center rounded-[8px] px-[8px] text-[13px] font-medium leading-[16px] transition-colors ${
                  sheet ? "min-h-[40px]" : "max-h-[32px] min-h-[32px]"
                } ${
                  isLong ? "bg-increase font-bold text-[#090909]" : "bg-transparent text-textSecondary hover:bg-primaryStroke/40"
                }`}
              >
                Long
              </button>
              <button
                onClick={() => setSide("short")}
                className={`flex flex-1 flex-row items-center justify-center rounded-[8px] px-[8px] text-[13px] font-medium leading-[16px] transition-colors ${
                  sheet ? "min-h-[40px]" : "max-h-[32px] min-h-[32px]"
                } ${
                  !isLong ? "bg-decrease font-bold text-[#090909]" : "bg-transparent text-textSecondary hover:bg-primaryStroke/40"
                }`}
              >
                Short
              </button>
            </div>
          </div>
        </div>

        {sheet ? (
          <div className="flex w-full flex-shrink-0 flex-row items-end justify-start gap-[10px] px-[12px] pb-[4px] pt-[10px]">
            <TypeTab tall label="Market" active={type === "market"} onClick={() => setType("market")} />
            <TypeTab tall label="Limit" active={type === "limit"} onClick={() => setType("limit")} />
          </div>
        ) : (
          <div className="flex h-[32px] flex-shrink-0 flex-row items-end justify-start gap-[16px] border-b border-primaryStroke/50 pb-[4px] pl-[12px] pr-[12px]">
            <div className="flex flex-1 flex-row items-center justify-start gap-[16px]">
              <TypeTab label="Market" active={type === "market"} onClick={() => setType("market")} />
              <TypeTab label="Limit" active={type === "limit"} onClick={() => setType("limit")} />
            </div>
          </div>
        )}

          {/* body */}
          <div className={`flex flex-shrink-0 flex-col ${sheet ? "min-h-[4px] px-[8px] pb-[12px] pt-[2px]" : "p-[16px] pb-[24px]"}`}>
            <div className="flex flex-col items-center justify-start gap-[4px]">
              {/* Leverage — always visible inline card (nothing pops out) */}
              <div className="flex w-full flex-col gap-[8px] rounded-[10px] border border-primaryStroke bg-primaryStroke/40 px-[12px] py-[10px]">
                <div className="flex w-full flex-row items-center justify-between">
                  <span className="text-[12px] font-medium leading-[16px] text-textTertiary">Leverage</span>
                  <div className="flex flex-row items-center rounded-[6px] border border-primaryStroke bg-backgroundTertiary p-[2px]">
                    <button
                      onClick={() => setLeverage(coin, levSafe, true)}
                      className={`rounded-[5px] px-[8px] py-[2px] text-[11px] leading-[14px] transition-colors ${
                        isCross ? "bg-primaryBlue font-bold text-background" : "font-medium text-textSecondary hover:text-textPrimary"
                      }`}
                    >
                      Cross
                    </button>
                    <button
                      onClick={() => setLeverage(coin, levSafe, false)}
                      className={`rounded-[5px] px-[8px] py-[2px] text-[11px] leading-[14px] transition-colors ${
                        !isCross ? "bg-primaryBlue font-bold text-background" : "font-medium text-textSecondary hover:text-textPrimary"
                      }`}
                    >
                      Isolated
                    </button>
                  </div>
                </div>
                <div className="flex w-full flex-row items-center gap-[8px]">
                  <button
                    onClick={() => applyLev(levSafe - 1)}
                    disabled={levSafe <= 1}
                    className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[6px] border border-primaryStroke bg-backgroundTertiary text-[13px] leading-none text-textSecondary transition-colors hover:bg-primaryStroke/40 disabled:opacity-40"
                    aria-label="Decrease leverage"
                  >
                    −
                  </button>
                  <div className="relative flex h-[16px] flex-1 flex-row items-center">
                    <div className="relative h-[4px] w-full rounded-[999px] bg-primaryStroke">
                      <div
                        className="absolute h-full rounded-[999px] bg-primaryBlue"
                        style={{ left: 0, width: `${((levSafe - 1) / (maxLev - 1)) * 100}%` }}
                      />
                      <input
                        type="range"
                        min={1}
                        max={maxLev}
                        step={1}
                        value={levSafe}
                        onChange={(e) => applyLev(+e.target.value)}
                        aria-label="Leverage"
                        className="absolute left-0 top-1/2 h-[24px] w-full -translate-y-1/2 cursor-pointer opacity-0"
                      />
                      <div
                        className="pointer-events-none absolute top-1/2 z-10 h-[12px] w-[12px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primaryBlue shadow-[0_0_0_3px_rgba(178,143,255,0.18)]"
                        style={{ left: `${((levSafe - 1) / (maxLev - 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                  <button
                    onClick={() => applyLev(levSafe + 1)}
                    disabled={levSafe >= maxLev}
                    className="flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[6px] border border-primaryStroke bg-backgroundTertiary text-[13px] leading-none text-textSecondary transition-colors hover:bg-primaryStroke/40 disabled:opacity-40"
                    aria-label="Increase leverage"
                  >
                    +
                  </button>
                  <span className="min-w-[34px] text-right text-[14px] font-bold leading-[18px] text-primaryBlue">{levSafe}x</span>
                </div>
              </div>

              {/* limit price input */}
              {type === "limit" && (
                <div className="flex h-[48px] w-full flex-col items-center justify-between rounded-[8px] border border-primaryStroke bg-primaryStroke/50 px-[12px] py-[6px]">
                  <div className="flex w-full flex-row items-center justify-start">
                    <span className="text-[12px] font-normal leading-[16px] text-textTertiary">Limit Price</span>
                  </div>
                  <div className="flex w-full flex-row items-center justify-start">
                    <input
                      value={limitPx}
                      onChange={(e) => setLimitPx(e.target.value.replace(/[^0-9.]/g, ""))}
                      placeholder={fmtPxQuote(mid ?? 0, meta)}
                      className="w-full min-w-0 bg-transparent text-[14px] font-normal leading-[18px] text-textPrimary outline-none placeholder:text-textTertiary"
                    />
                  </div>
                </div>
              )}

              {/* amount box */}
              <div className="flex h-[64px] w-full flex-col items-center justify-between rounded-[10px] border border-primaryStroke bg-primaryStroke/40 transition-colors focus-within:border-primaryBlue/60">
                <div className="flex w-full flex-row items-center justify-start px-[12px] pt-[8px]">
                  <div className="flex h-full flex-1 flex-row items-center justify-start">
                    <span className="text-[12px] font-normal leading-[16px] text-textTertiary">
                      {isLong ? "Buy" : "Sell"} Amount
                    </span>
                  </div>
                  <div className="flex h-full flex-row items-center justify-center">
                    <span className="text-[12px] font-normal leading-[16px] text-textTertiary">{base}</span>
                  </div>
                </div>
                <div className="flex w-full flex-row items-center justify-start px-[12px] pb-[6px]">
                  <div className="flex min-w-0 flex-1 flex-row items-center justify-start">
                    <input
                      value={amount}
                      onChange={(e) => {
                        const v = e.target.value.replace(/[^0-9.]/g, "");
                        setAmount(v);
                        const n = parseFloat(v) || 0;
                        if (maxSize > 0) setSliderPct(Math.min(100, Math.round((n / maxSize) * 100)));
                      }}
                      placeholder="0.0 USDC"
                      className="w-full min-w-0 bg-transparent text-[18px] font-normal leading-[23px] text-textPrimary outline-none placeholder:text-[18px] placeholder:leading-[16px] placeholder:text-textTertiary"
                    />
                  </div>
                  <div className="ml-2 flex flex-shrink-0 flex-row items-center justify-end gap-[4px]">
                    <HlIcon coin={coin} size={16} />
                    <span className="max-w-[100px] truncate whitespace-nowrap text-[18px] font-normal leading-[23px] text-textPrimary">
                      {notional > 0 && pxNum > 0 ? trimNum(szNum, meta?.szDecimals ?? 4) : "0"}
                    </span>
                  </div>
                </div>
              </div>

              {/* slider with ticks */}
              <div className="relative flex h-[26px] w-full flex-row items-start justify-between px-[6px] pt-[8px]">
                <div className="relative flex h-[2px] flex-1 flex-row items-center justify-between rounded-[999px] bg-primaryStroke">
                  <div className="absolute h-full rounded-[999px] bg-primaryBlue" style={{ left: 0, width: `${sliderPct}%` }} />
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={sliderPct}
                    onChange={(e) => applySlider(+e.target.value)}
                    className="peer absolute left-0 h-[44px] w-full cursor-pointer opacity-0"
                    style={{ top: -12 }}
                  />
                  <div className="pointer-events-none absolute top-1/2 z-10 h-[12px] w-[12px] rounded-full bg-primaryBlue transition-[width,height] peer-hover:h-[16px] peer-hover:w-[16px]" style={{ left: `${sliderPct}%`, transform: "translate(-50%, -50%)" }} />
                  {TICKS.map((t) => (
                    <div key={t} className={`pointer-events-none absolute h-[4px] w-[2px] rounded-full ${t === 0 ? "bg-primaryBlue" : "bg-textTertiary"}`} style={{ left: `${t}%` }}>
                      <span className="pointer-events-none absolute left-1/2 top-[11px] -translate-x-1/2 select-none text-[10px] font-normal leading-[14px] text-textSecondary">
                        {t}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div
                ref={sliderRef}
                onMouseDown={(e) => {
                  onSlider(e.clientX);
                  const mv = (ev: MouseEvent) => onSlider(ev.clientX);
                  const up = () => { window.removeEventListener("mousemove", mv); window.removeEventListener("mouseup", up); };
                  window.addEventListener("mousemove", mv);
                  window.addEventListener("mouseup", up);
                }}
                className="-mt-[10px] h-[12px] w-full"
              />

              {/* TP/SL */}
              <div className="flex w-full flex-row items-center justify-between pb-[0px] pt-[12px]">
                <button
                  onClick={() => setTpsl((v) => !v)}
                  className="inline-flex h-[16px] flex-row items-center justify-start gap-[8px] cursor-pointer"
                >
                  <span className="flex h-[16px] w-[16px] flex-row items-center justify-center rounded-[4px] border border-secondaryStroke bg-transparent p-[2px]">
                    <span className={`h-[10px] w-[10px] rounded-[1px] ${tpsl ? "bg-primaryBlue" : "bg-transparent"}`} />
                  </span>
                  <span className="text-nowrap text-[12px] font-medium text-textSecondary">TP/SL</span>
                </button>
                <div className="flex items-center gap-[4px]">
                  <span className="text-xs text-textTertiary">Est. Liq. Price:</span>
                  <span className="text-xs text-textSecondary">{liq ? fmtPrice(meta, liq) : "--"}</span>
                </div>
              </div>

              {tpsl && (
                <div className="w-full overflow-hidden opacity-100">
                  <div className="flex w-full flex-col gap-[16px] pb-[4px] pt-[8px]">
                    <div className="flex gap-[8px]">
                      <div className="flex w-full flex-col items-start justify-start gap-[4px] flex-[3]">
                        <span className="text-[12px] font-normal leading-[16px] text-textTertiary">TP Price</span>
                        <input
                          value={tpPx}
                          onChange={(e) => setTpPx(e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder={isLong ? "Above mark" : "Below mark"}
                          className="flex h-[32px] w-full flex-row rounded-[6px] border border-primaryStroke bg-primaryStroke/50 px-[8px] text-[12px] font-normal leading-[16px] text-textPrimary outline-none placeholder:text-textTertiary"
                        />
                      </div>
                      <div className="flex w-full flex-col items-start justify-start gap-[4px] flex-[1]">
                        <span className="text-[12px] font-normal leading-[16px] text-textTertiary">TP %</span>
                        <input
                          value={tpPct(tpPx, pxNum, isLong)}
                          onChange={(e) => {
                            const p = parseFloat(e.target.value);
                            if (!isNaN(p) && pxNum) setTpPx(fmtPxQuote(pxNum * (isLong ? 1 + p / 100 : 1 - p / 100), meta));
                          }}
                          placeholder="--"
                          className="flex h-[32px] w-full flex-row rounded-[6px] border border-primaryStroke bg-primaryStroke/50 px-[8px] text-[12px] font-normal leading-[16px] text-textPrimary outline-none placeholder:text-textTertiary"
                        />
                      </div>
                    </div>
                    <div className="flex gap-[8px]">
                      <div className="flex w-full flex-col items-start justify-start gap-[4px] flex-[3]">
                        <span className="text-[12px] font-normal leading-[16px] text-textTertiary">SL Price</span>
                        <input
                          value={slPx}
                          onChange={(e) => setSlPx(e.target.value.replace(/[^0-9.]/g, ""))}
                          placeholder={isLong ? "Below mark" : "Above mark"}
                          className="flex h-[32px] w-full flex-row rounded-[6px] border border-primaryStroke bg-primaryStroke/50 px-[8px] text-[12px] font-normal leading-[16px] text-textPrimary outline-none placeholder:text-textTertiary"
                        />
                      </div>
                      <div className="flex w-full flex-col items-start justify-start gap-[4px] flex-[1]">
                        <span className="text-[12px] font-normal leading-[16px] text-textTertiary">SL %</span>
                        <input
                          value={slPct(slPx, pxNum, isLong)}
                          onChange={(e) => {
                            const p = parseFloat(e.target.value);
                            if (!isNaN(p) && pxNum) setSlPx(fmtPxQuote(pxNum * (isLong ? 1 - p / 100 : 1 + p / 100), meta));
                          }}
                          placeholder="--"
                          className="flex h-[32px] w-full flex-row rounded-[6px] border border-primaryStroke bg-primaryStroke/50 px-[8px] text-[12px] font-normal leading-[16px] text-textPrimary outline-none placeholder:text-textTertiary"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* submit — pinned to the bottom in the tall desktop column;
                  in the workspace panel the ticket is natural-height so this
                  rides right after the TP/SL block (frame scrolls if short) */}
              {variant !== "panel" && <div className="flex-1" />}
              <div className="relative flex w-full flex-col items-center justify-start overflow-hidden p-[0px] pt-[16px]">
                <button
                  onClick={submit}
                  style={{ height: 40, borderRadius: 10 }}
                  className={`flex w-full flex-row items-center justify-center px-[12px] text-[14px] font-bold leading-[18px] transition-all ${
                    insufficient
                      ? "bg-increase text-[#090909] hover:bg-increaseHover"
                      : isLong
                        ? "bg-increase text-[#090909] shadow-[0_6px_24px_rgba(47,227,172,0.22)] hover:bg-increaseHover"
                        : "bg-decrease text-[#090909] shadow-[0_6px_24px_rgba(236,57,122,0.22)] hover:bg-decreaseHover"
                  }`}
                >
                  {submitLabel}
                </button>

                {/* margin rows */}
                <div className="flex w-full flex-col items-start justify-start pb-[22px] pt-[12px]">
                  <div className="flex h-[24px] w-full flex-row items-center justify-start">
                    <div className="flex flex-1 items-center justify-start gap-[4px]">
                      <span className="text-[12px] font-normal leading-[16px] text-textTertiary">Available Margin</span>
                    </div>
                    <button
                      onClick={() => { deposit(DEMO_DEPOSIT); toast(`Added $${DEMO_DEPOSIT.toLocaleString()} demo USDC`, "success"); }}
                      className="h-[24px] rounded-[4px] border border-primaryStroke/50 bg-primaryBlue/10 px-[4px] text-[12px] font-normal hover:bg-primaryBlue/20"
                      title="Add demo funds"
                    >
                      <span className="text-[12px] font-medium leading-[16px] text-primaryBlueHover">
                        {fmtUsdFull(avail)} USDC
                      </span>
                    </button>
                  </div>
                  <div className="flex h-[24px] w-full flex-row items-center justify-start">
                    <div className="h-[1px] w-full bg-primaryStroke/50" />
                  </div>
                  <div className="flex h-[24px] w-full flex-row items-center justify-start">
                    <div className="flex flex-1 items-center justify-start gap-[4px]">
                      <span className="text-[12px] font-normal leading-[16px] text-textTertiary">Account Value</span>
                    </div>
                    <div className="flex items-center justify-start gap-[4px]">
                      <span className="text-[12px] font-normal leading-[16px] text-textSecondary">
                        {fmtUsdFull(accountValue)} USDC
                      </span>
                    </div>
                  </div>
                  <div className="flex h-[24px] w-full flex-row items-center justify-start">
                    <div className="flex flex-1 items-center justify-start gap-[4px]">
                      <span className="text-[12px] font-normal leading-[16px] text-textTertiary">Current Position</span>
                    </div>
                    <div className="flex items-center justify-start gap-[4px]">
                      <span className="text-[12px] font-normal leading-[16px] text-textSecondary">
                        {position && position.szi !== 0
                          ? `${fmtSzQuote(Math.abs(position.szi), meta)} ${position.szi > 0 ? "Long" : "Short"} (${fmtUsd(unrealizedPnl(position, mid ?? position.entryPx), { signed: true })})`
                          : "--"}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="absolute bottom-[2px] right-0 flex items-center gap-1 whitespace-nowrap">
                  <span className="text-[11px] text-textTertiary">powered by</span>
                  <span className="flex items-center gap-[3px]">
                    <img
                      src="/hl-logo.svg"
                      alt="Hyperliquid Logo"
                      width={13}
                      height={13}
                      loading="lazy"
                      className="h-[13px] w-[13px]"
                    />
                    <span className="text-[11px] font-semibold text-textPrimary">Hyperliquid</span>
                  </span>
                  <button
                    onClick={() => window.dispatchEvent(new CustomEvent("perps-open-settings"))}
                    className="ml-[2px] rounded-[4px] border border-primaryStroke/50 px-[6px] text-[10px] font-semibold text-primaryBlueHover hover:bg-primaryBlue/10"
                    title="Trading mode"
                  >
                    {mode === "paper" ? "PAPER" : "LIVE"}
                  </button>
                </div>
              </div>
            </div>
          </div>
      </div>
    </div>
  );
}

function trimNum(v: number, decimals: number): string {
  const s = v.toFixed(Math.min(decimals, 6));
  return s.replace(/\.?0+$/, "");
}

function usdcStr(v: number): string {
  if (v >= 1000) return String(Math.round(v));
  return String(+v.toFixed(2));
}

function tpPct(tp: string, px: number, isLong: boolean): string {
  const v = parseFloat(tp);
  if (!v || !px) return "";
  const p = isLong ? ((v - px) / px) * 100 : ((px - v) / px) * 100;
  return p.toFixed(2);
}
function slPct(sl: string, px: number, isLong: boolean): string {
  const v = parseFloat(sl);
  if (!v || !px) return "";
  const p = isLong ? ((px - v) / px) * 100 : ((v - px) / px) * 100;
  return p.toFixed(2);
}

function TypeTab({ label, active, onClick, tall }: { label: string; active: boolean; onClick: () => void; tall?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`group relative flex flex-row flex-nowrap items-center justify-start gap-[4px] rounded-[4px] px-[8px] text-nowrap ${tall ? "h-[40px]" : "h-[24px]"}`}
    >
      <div className="pointer-events-none absolute inset-0 z-0 rounded-[4px] bg-primaryStroke/40 will-change-transform" style={{ opacity: active ? 1 : 0 }} />
      <div className={`relative z-[1] flex flex-1 flex-row items-center justify-start gap-[4px] ${tall ? "h-[40px]" : "h-[32px]"} ${active ? "border-b-[2px] border-textPrimary" : "border-b-[2px] border-transparent"}`}>
        <span className={`text-[13px] font-medium ${active ? "text-textPrimary" : "text-textSecondary"}`}>{label}</span>
      </div>
    </button>
  );
}
