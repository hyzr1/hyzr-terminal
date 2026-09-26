"use client";

/* ---------------------------------------------------------------------------
 * SurgeBoard — the two-column live card board ("Early" | "Surging") shown
 * when a Surge source is active. 1:1 with the reference screenshots:
 * avatar + curve ring + address, symbol/name row with live age, MC →
 * accent progress line → live price + change, stats row (age, socials,
 * V, L, holders, ATH, multiple), audit badges and the lightning buy.
 * ------------------------------------------------------------------------- */

import { useMemo } from "react";
import type { RowModel } from "./live/toRow";
import { ACCENT_HEX, fmtUsd } from "@/lib/format";
import TokenAvatar from "./TokenAvatar";
import { InfoBadge, DexPaidBadge } from "./InfoBadge";
import { IconProTrader } from "./HyzrIcons";
import { toast } from "@/lib/hyperliquid/tradeStore";

function SurgeCard({ t }: { t: RowModel }) {
  const accent = ACCENT_HEX[t.accent];
  const ch = parseFloat(t.changePct) || 0;
  const prevMc = t.mcNum > 0 ? t.mcNum / (1 + ch / 100) : 0;
  return (
    <div
      className={`flex w-full flex-col gap-[10px] rounded-[8px] border-[1px] border-primaryStroke/60 bg-backgroundSecondary p-[12px] transition-colors duration-150 hover:border-secondaryStroke ${
        t.fresh ? "token-enter" : ""
      }`}
    >
      {/* top: avatar column + title/price block */}
      <div className="flex w-full flex-row items-start justify-start gap-[12px]">
        <div className="flex w-[64px] min-w-[64px] flex-col items-center justify-start gap-[6px] sm:w-[84px] sm:min-w-[84px]">
          <div className="scale-[1.16] sm:scale-[1.29]">
            <TokenAvatar
              image={t.image}
              name={t.name}
              symbol={t.symbol}
              dexBadge={t.dexBadge}
              ringOffset={t.ringOffset}
            />
          </div>
          <span className="w-full truncate text-center text-[12px] font-medium text-textTertiary">
            {t.addressShort}
          </span>
        </div>

        <div className="flex min-w-0 flex-1 flex-col items-start justify-start gap-[10px] pt-[2px]">
          {/* symbol / name / age */}
          <div className="flex w-full min-w-0 flex-row items-center justify-between gap-[8px]">
            <div className="flex min-w-0 flex-row items-center justify-start gap-[6px]">
              <span className="truncate text-[16px] font-bold tracking-[-0.02em] text-textPrimary sm:text-[18px]">
                {t.symbol}
              </span>
              <span className="min-w-0 cursor-pointer truncate text-[14px] font-medium tracking-[-0.01em] text-textTertiary transition-colors duration-150 hover:text-textSecondary sm:text-[16px]">
                {t.name}
              </span>
              <i className="ri-file-copy-line flex-shrink-0 text-[13px] text-textTertiary transition-colors duration-150 hover:text-textSecondary" />
            </div>
            <span className="flex-shrink-0 text-[14px] font-semibold text-textPrimary">
              {t.age}
            </span>
          </div>

          {/* MC ----• price  pct */}
          <div className="flex w-full min-w-0 flex-row items-center justify-between gap-[8px]">
            <div className="flex flex-row items-center justify-start gap-[6px]">
              <span className="text-[13px] font-medium text-textTertiary">
                MC
              </span>
              <span
                className="whitespace-nowrap text-[15px] font-semibold sm:text-[16px]"
                style={{ color: accent }}
              >
                {t.marketCap}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-row items-center justify-start gap-[6px] px-[6px]">
              <div
                className="h-[2px] min-w-[24px] flex-1 rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${accent}30 0%, ${accent} 100%)`,
                }}
              />
              <div
                className="h-[5px] w-[5px] flex-shrink-0 rounded-full"
                style={{ background: accent }}
              />
            </div>
            <div className="flex flex-shrink-0 flex-row items-center justify-start gap-[6px]">
              <span
                className={`whitespace-nowrap text-[15px] font-semibold sm:text-[16px] ${
                  t.changeUp ? "text-increase" : "text-decrease"
                }`}
              >
                {fmtUsd(prevMc)}
              </span>
              <span
                className={`whitespace-nowrap font-GeistMono text-[13px] font-medium ${
                  t.changeUp ? "text-increase" : "text-decrease"
                }`}
              >
                {t.changePct}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* stats row */}
      <div className="flex w-full flex-row items-center justify-start gap-[10px] overflow-hidden whitespace-nowrap text-[13px] font-medium">
        <span className="text-primaryGreen">{t.age}</span>
        {t.iconQuill && (
          <i className="ri-quill-pen-line" style={{ fontSize: 15, color: "rgb(93,188,255)" }} />
        )}
        {t.iconLink && <i className="ri-link text-textSecondary" style={{ fontSize: 15 }} />}
        {t.iconWeb && <i className="ri-global-line text-textSecondary" style={{ fontSize: 15 }} />}
        {t.iconCoin && <i className="ri-coins-line text-primaryYellow" style={{ fontSize: 15 }} />}
        <i className="ri-search-line text-textSecondary" style={{ fontSize: 15 }} />
        <span className="flex items-center gap-[3px] text-textSecondary">
          <i className="ri-eye-line" style={{ fontSize: 15 }} />
          {t.viewers}
        </span>
        <span className="flex items-center gap-[3px] text-textSecondary">
          V <span className="text-textPrimary">{t.volume}</span>
        </span>
        <span className="flex items-center gap-[3px] text-textSecondary">
          L <span className="text-textPrimary">{t.liquidity}</span>
        </span>
        <span className="flex items-center gap-[3px] text-textSecondary">
          <i className="ri-user-3-line" style={{ fontSize: 15 }} />
          {t.holders}
        </span>
        <span className="flex items-center gap-[3px] text-textSecondary">
          <IconProTrader size={14} />
          {t.proTraders}
        </span>
        <span className="flex items-center gap-[3px] text-textSecondary">
          ATH <span style={{ color: accent }}>{fmtUsd(t.athMc)}</span>
        </span>
        <span className="flex items-center gap-[2px]" style={{ color: accent }}>
          {t.mult.toFixed(2)}x
        </span>
      </div>

      {/* badges + quick buy */}
      <div className="flex w-full flex-row items-center justify-between gap-[8px]">
        <div className="flex min-w-0 flex-row items-center justify-start gap-[6px] overflow-hidden">
          {t.infoBadges.map((b, i) => (
            <InfoBadge key={i} badge={b} />
          ))}
          <DexPaidBadge paid={t.dexPaid} />
        </div>
        <button
          type="button"
          aria-label={`Quick buy ${t.symbol}`}
          onClick={() => {
            toast(`Quick buy ${t.symbol} — paper order simulated`, "success");
          }}
          className="flex h-[36px] w-[36px] flex-shrink-0 items-center justify-center rounded-full bg-primaryBlue text-white shadow-[0_0_0_0_rgba(82,111,255,0.5)] transition-all duration-150 hover:bg-primaryBlueHover active:scale-90"
        >
          <i className="ri-flashlight-fill text-[18px]" />
        </button>
      </div>
    </div>
  );
}

export type SurgeColumn = {
  title: string;
  rows: RowModel[];
};

export default function SurgeBoard({
  columns,
  loading,
}: {
  columns: SurgeColumn[];
  loading?: boolean;
}) {
  const cols = useMemo(
    () => (columns.length === 1 ? [columns[0], null] : columns),
    [columns],
  );
  return (
    <div className="scroll-gutter-stable h-full w-full max-w-[1420px] flex-1 overflow-y-auto overflow-x-hidden">
      <div className="grid w-full grid-cols-1 items-start gap-[16px] sm:grid-cols-2">
        {cols.map((col, ci) => (
          <div key={ci} className="flex min-w-0 flex-col">
            {col && (
              <>
                <div className="mb-[10px] px-[4px] text-[18px] font-bold tracking-[-0.01em] text-textPrimary">
                  {col.title}
                </div>
                <div className="flex flex-col gap-[12px]">
                  {col.rows.map((r) => (
                    <SurgeCard key={r.id} t={r} />
                  ))}
                  {col.rows.length === 0 && (
                    <div className="rounded-[8px] border border-dashed border-primaryStroke/70 px-[16px] py-[28px] text-center text-[13px] text-textTertiary">
                      {loading
                        ? "Scanning live pairs..."
                        : "No pairs match this ceiling yet"}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
