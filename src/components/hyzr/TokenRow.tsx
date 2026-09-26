"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import type { RowModel } from "./live/toRow";
import FlashSpan from "./live/FlashSpan";
import TokenAvatar from "./TokenAvatar";
import Sparkline from "./Sparkline";
import { InfoBadge, DexPaidBadge, CountBadges } from "./InfoBadge";
import { IconCommunityHyzr } from "./HyzrIcons";

/* One table row — 68px tall (fx16: more vertical padding, calmer rhythm).
   Columns: market (fixed) · spark (fixed) · price 1.15fr · OI/volume/trades
   1fr (sm+) · market info (fixed 192) · action (fixed 72, sm+ only).
   sm:min-w-[1088px] — fits a 1280 viewport with zero horizontal overflow
   (was 1288px which always scrolled). */
export default function TokenRow({
  token,
  onBondingHover,
}: {
  token: RowModel;
  onBondingHover?: (pct: number | null) => void;
}) {
  const router = useRouter();
  const isMarket = token.kind === "market";
  const live = useMemo(
    () => token.iconQuill !== undefined || token.iconWeb !== undefined,
    [token.iconQuill, token.iconWeb],
  );
  const showQuill = live ? !!token.iconQuill : true;

  return (
    <div className={`relative ${token.fresh ? "token-enter" : ""}`}>
      <div
        onMouseEnter={() => onBondingHover?.(token.bondingPct)}
        onMouseLeave={() => onBondingHover?.(null)}
        onClick={(e) => {
          /* Ticker item routes to its trade terminal (Buy button + any
             real link/button inside keep their own handlers). */
          const t = e.target as HTMLElement;
          if (t.closest("a,button,input,textarea,select")) return;
          router.push(`/trade?market=${encodeURIComponent(token.tradeCoin || token.symbol)}`);
        }}
        className="group flex h-[68px] max-h-[68px] min-h-[68px] w-full min-w-0 max-w-[1600px] flex-grow cursor-pointer flex-row items-center justify-start whitespace-nowrap rounded-b-[0px] border-b-[1px] border-primaryStroke/40 bg-backgroundSecondary px-0 active:bg-primaryStroke/50 sm:min-w-[1088px] sm:px-[14px] sm:hover:bg-primaryStroke/40"
      >
        <div className="relative flex h-full w-full flex-grow flex-row items-center">
          {/* hidden eye-off quick action (as captured in the snapshot) */}
          <button
            type="button"
            className="pointer-events-none absolute z-50 text-textTertiary opacity-0 transition-opacity duration-0 hover:text-primaryBlueHover focus-visible:pointer-events-auto"
          >
            <i className="ri-eye-off-line text-[14px]" />
          </button>

          {/* Pair info */}
          <div className="flex w-[150px] min-w-0 flex-row items-center justify-start gap-[12px] px-[12px] sm:w-[256px]">
            <TokenAvatar
              image={token.image}
              name={token.name}
              symbol={token.symbol}
              dexBadge={token.dexBadge}
              ringOffset={token.ringOffset}
            />
            <div className="flex min-w-0 flex-col items-start justify-start gap-[4px]">
              <div className="flex max-w-full min-w-0 flex-row items-center justify-start gap-[4px]">
                <span className="text-[12px] font-medium tracking-[-0.02em] text-textPrimary sm:text-[16px]">
                  <div className="min-w-0 overflow-hidden truncate whitespace-nowrap" style={{ maxWidth: "calc(96px)" }}>
                    {token.symbol}
                  </div>
                </span>
                <div className="min-w-0 max-w-full cursor-pointer" role="button">
                  <span className="flex min-w-0 cursor-pointer flex-row items-center justify-start gap-[4px] overflow-hidden text-textTertiary transition-colors duration-[125ms] hover:text-textSecondary">
                    <span className="block max-w-full truncate text-[12px] font-medium tracking-[-0.02em] text-inherit sm:text-[16px]">
                      <div className="min-w-0 overflow-hidden truncate whitespace-nowrap">
                        {token.name}
                      </div>
                    </span>
                    <i className="ri-file-copy-line text-[12px] text-inherit sm:text-[14px]" />
                  </span>
                </div>
              </div>
              <div className="flex max-w-full min-w-0 flex-row items-center justify-start gap-[8px] overflow-hidden">
                <span className="text-[12px] font-medium text-primaryGreen sm:text-[14px]">
                  {token.age}
                </span>
                {isMarket ? null : (
                  <>
                {showQuill && (
                  <div>
                    <a
                      className="flex flex-shrink-0 cursor-pointer flex-row items-center justify-start gap-[2px]"
                      href={token.tweet ?? "#"}
                    >
                      <i
                        className="ri-quill-pen-line transition-colors duration-[125ms] ease-in-out"
                        style={{ fontSize: 16, color: "rgb(93, 188, 255)" }}
                      />
                    </a>
                  </div>
                )}
                {token.iconLink && (
                  <a className="flex flex-shrink-0 items-center" href="#">
                    <i className="ri-link text-[14px] text-textSecondary transition-colors duration-[125ms] hover:text-textPrimary sm:text-[16px]" />
                  </a>
                )}
                {token.iconWeb && (
                  <a className="flex flex-shrink-0 items-center" href="#">
                    <i className="ri-global-line text-[14px] text-textSecondary transition-colors duration-[125ms] hover:text-textPrimary sm:text-[16px]" />
                  </a>
                )}
                {token.iconCoin && (
                  <a className="flex flex-shrink-0 items-center" href="#">
                    <i className="ri-coins-line text-[14px] text-primaryYellow transition-colors duration-[125ms] hover:brightness-110 sm:text-[16px]" />
                  </a>
                )}
                {!live && token.community && (
                  <div>
                    <IconCommunityHyzr
                      size={14}
                      className="cursor-pointer text-hyzrCommunity transition-colors duration-[125ms] hover:text-hyzrCommunityHover sm:hidden"
                    />
                    <IconCommunityHyzr
                      size={16}
                      className="hidden cursor-pointer text-hyzrCommunity transition-colors duration-[125ms] hover:text-hyzrCommunityHover sm:block"
                    />
                  </div>
                )}
                {token.refund && (
                  <span className="contents">
                    <div className="flex h-[20px] w-[20px] cursor-default flex-row items-center justify-center rounded-full bg-protocolFeats/[0.08] text-protocolFeats">
                      <i className="ri-refund-2-line text-[14px] transition-colors duration-[125ms]" />
                    </div>
                  </span>
                )}
                  </>
                )}
                {!isMarket && (
                <a className="flex items-center" href="#">
                  <i className="ri-search-line text-[14px] text-textSecondary transition-colors duration-[125ms] hover:text-primaryBlueHover sm:text-[16px]" />
                </a>
                )}
                {isMarket ? (
                  <span className="hidden text-[11px] font-medium text-textTertiary sm:inline">
                    {token.tradeCoin?.includes(":") ? `HL · ${token.tradeCoin.split(":")[1]}` : "HL PERP"}
                  </span>
                ) : (
                <span className="contents">
                  <div className="inline-flex items-center justify-center gap-1 leading-none text-textSecondary">
                    <i className="ri-eye-line flex items-center text-[9px] sm:text-[16px]" />
                    <span className="flex items-center text-[11px] font-medium sm:text-[11px]">
                      {token.viewers}
                    </span>
                  </div>
                </span>
                )}
              </div>
            </div>
          </div>

          {/* sparkline — fixed width so the stat columns share free space
              evenly instead of the chart eating it */}
          <div className="flex w-[56px] flex-none flex-row items-center justify-start pr-[8px] sm:w-[96px] sm:pr-[12px]">
            <Sparkline
              seed={token.sparkSeed}
              up={token.changeUp}
              series={token.series}
            />
          </div>

          {/* price + 24h change */}
          <div className="flex min-w-0 flex-1 flex-row items-center justify-start px-[12px] sm:flex-[1.15_1_0%]">
            <div className="flex flex-row items-center justify-start gap-[8px]">
              <div className="flex flex-col items-start justify-start gap-[4px]">
                <div className="flex flex-row items-center justify-start gap-[4px]">
                  <FlashSpan
                    value={token.mcNum}
                    className="rounded-[4px] text-[12px] font-medium text-textPrimary sm:text-[14px]"
                  >
                    {token.marketCap}
                  </FlashSpan>
                </div>
                <div className="flex flex-row items-center justify-start gap-[4px]">
                  <span
                    className={`font-GeistMono text-[12px] font-medium ${
                      token.changeUp ? "text-increase" : "text-decrease"
                    }`}
                  >
                    {token.changePct}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* liquidity */}
          <div className="hidden min-w-0 flex-1 flex-row items-center justify-start px-[12px] sm:flex">
            <div className="flex flex-col items-start justify-start gap-[4px]">
              <div className="flex flex-row items-center justify-start gap-[4px]">
                <FlashSpan
                  value={token.liqNum}
                  className="rounded-[4px] text-[12px] font-medium text-textPrimary sm:text-[14px]"
                >
                  {token.liquidity}
                </FlashSpan>
              </div>
            </div>
          </div>

          {/* volume */}
          <div className="flex min-w-0 flex-1 flex-row items-center justify-start px-[12px]">
            <div className="flex flex-col items-start justify-start gap-[4px]">
              <div className="flex flex-row items-center justify-start gap-[4px]">
                <FlashSpan
                  value={token.volNum}
                  className="rounded-[4px] text-[12px] font-medium text-textPrimary sm:text-[14px]"
                >
                  {token.volume}
                </FlashSpan>
              </div>
            </div>
          </div>

          {/* txns */}
          <div className="hidden min-w-0 flex-1 flex-row items-center justify-start px-[12px] sm:flex">
            <div className="flex flex-col items-start justify-start gap-[4px]">
              <div className="flex flex-row items-center justify-start gap-[4px]">
                <FlashSpan
                  value={token.txNum}
                  className="rounded-[4px] text-[12px] font-medium text-textPrimary sm:text-[14px]"
                >
                  {token.txns}
                </FlashSpan>
              </div>
              <div className="flex flex-row items-center justify-start gap-[4px]">
                <div className="flex flex-row items-center justify-start gap-[4px]">
                  <span className="font-GeistMono text-[12px] font-medium text-increase">
                    {token.txnsBuy}
                  </span>
                  <span className="font-GeistMono text-[12px] font-medium text-textSecondary">
                    /
                  </span>
                  <span className="font-GeistMono text-[12px] font-medium text-decrease">
                    {token.txnsSell}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* token info badges — fixed width so the 2x2 grid never gets
              flex-crushed into overlapping its own cells */}
          <div className="hidden min-w-0 flex-row items-center justify-start px-[12px] sm:flex sm:w-[192px] sm:flex-none">
            {isMarket ? (
              <MarketInfoGrid token={token} />
            ) : (
              <div className="flex min-w-[72px] flex-row items-center justify-start gap-[4px]">
                <div className="flex flex-col items-start justify-start gap-[4px]">
                  {token.infoBadges.slice(0, 3).map((b, i) => (
                    <InfoBadge key={i} badge={b} />
                  ))}
                </div>
                <div className="flex flex-col items-start justify-start gap-[4px]">
                  {token.infoBadges.slice(3, 5).map((b, i) => (
                    <InfoBadge key={i} badge={b} />
                  ))}
                  {!isMarket && <DexPaidBadge paid={token.dexPaid} />}
                </div>
                <div className="flex flex-col items-start justify-start gap-[4px]">
                  <CountBadges holders={token.holders} proTraders={token.proTraders} />
                </div>
              </div>
            )}
          </div>

          {/* action — desktop only (mobile drops the Buy button; the whole
              row routes to the terminal). fit-content column so there is no
              dead band between the Market Info stats and the Buy button. */}
          <div className="hidden w-[64px] flex-none flex-col items-center justify-center gap-[4px] sm:flex sm:w-[72px]">
            <button
              type="button"
              onClick={() => { router.push(`/trade?market=${encodeURIComponent(token.tradeCoin || token.symbol)}`); }}
              className="group/quickBuyButton relative flex flex-row items-center justify-center gap-[4px] overflow-hidden whitespace-nowrap bg-primaryBlue text-[#090909] transition-all duration-0 hover:bg-primaryBlueHover"
              style={{ paddingLeft: 12, paddingRight: 12, borderRadius: 999, height: 32 }}
            >
              <span className="relative z-10 text-[12px] font-bold">Buy</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* Organized perp-market stats for the "Market Info" column:
   a labeled 2x2 grid (funding, 24h change, max leverage, turnover) instead
   of a pile of bordered chips. Only funding + 24h carry color. */
function MarketStat({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "neutral";
}) {
  return (
    <div className="flex min-w-0 flex-col items-start justify-start">
      <span className="whitespace-nowrap text-[9px] font-semibold uppercase leading-[10px] tracking-[0.14em] text-textTertiary">
        {label}
      </span>
      <span
        className={`whitespace-nowrap font-GeistMono text-[12px] font-medium leading-[17px] ${
          tone === "green" ? "text-increase" : tone === "red" ? "text-decrease" : "text-textPrimary"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

function MarketInfoGrid({ token }: { token: RowModel }) {
  const b = token.infoBadges;
  const funding = b[0];
  const lev = b[2];
  const turnover = b[3];
  const ch = b[4];
  const toneOf = (t?: string) => (t === "green" ? "green" : t === "red" ? "red" : "neutral") as
    | "green"
    | "red"
    | "neutral";
  return (
    <div className="grid min-w-0 w-full grid-cols-2 gap-x-[28px] gap-y-[7px]">
      <MarketStat
        label="Funding / 8h"
        value={funding?.value ?? "--"}
        tone={toneOf(funding?.tone)}
      />
      <MarketStat label="24h" value={ch?.value ?? "--"} tone={toneOf(ch?.tone)} />
      <MarketStat label="Max Lev" value={lev?.value ?? "--"} />
      <MarketStat label="Turnover" value={turnover?.value ?? "--"} />
    </div>
  );
}
