"use client";

import { useState } from "react";
import { ASSETS } from "@/lib/hyzr-data";
import { Popover } from "./ui/Popover";
import { ActiveWalletsMenuContent } from "./menus/ActiveWalletsMenu";
import { QuickBuyPresetMenu } from "./menus/SmallMenus";
import {
  useHyzrUI,
  SURGE_CAPS,
  SURGE_CAP_LABELS,
  type QuickBuyValue,
} from "./ui/HyzrUI";

/* ------------------------------------------------------------------ */
/* Timeframe pill group (1m / 5m / 30m / 1h)                           */
/* ------------------------------------------------------------------ */
export function TimeframeTabs({
  active = "5m",
  onChange,
}: {
  active?: string;
  /** when provided the tabs become controlled */
  onChange?: (tf: string) => void;
}) {
  const [selected, setSelected] = useState(active);
  const current = onChange ? active : selected;
  const items = ["1m", "5m", "30m", "1h"];
  return (
    <div className="flex flex-row items-center justify-end gap-[4px]">
      {items.map((tf) => (
        <button
          key={tf}
          type="button"
          onClick={() => {
            if (onChange) onChange(tf);
            else setSelected(tf);
          }}
          className={`relative flex h-[32px] flex-row items-center justify-start whitespace-nowrap rounded-[4px] px-[8px] hover:text-primaryBlue hover:[transition:color_135ms_ease-in-out] ${
            current === tf ? "text-primaryBlue" : "text-textPrimary"
          }`}
        >
          <span className="pointer-events-none absolute inset-0 z-0 rounded-[4px] bg-primaryBlue/20 opacity-0 will-change-transform" />
          <span className="relative z-[1] text-[14px] font-medium">{tf}</span>
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Wallet selector pill — [wallet] 1 | SOL 0  v  → Active wallets menu */
/* ------------------------------------------------------------------ */
export function WalletSelect({ compact = false }: { compact?: boolean }) {
  const { wallets } = useHyzrUI();
  const count = wallets.length;
  const selected = wallets.filter((w) => w.selected).length;
  return (
    <Popover
      align={compact ? "end" : "end"}
      content={(close) => <ActiveWalletsMenuContent close={close} />}
      button={({ open, toggle }) => (
        <button

          type="button"
          title="Active wallets"
          onClick={toggle}
          className={`group flex h-[32px] flex-row items-center justify-center gap-[8px] rounded-full border border-primaryStroke transition-all duration-[65ms] ease-out active:scale-[0.96] active:bg-primaryStroke/35 ${
            compact
              ? "p-[4px] pl-[12px] pr-[12px]"
              : "p-[4px] pl-[12px] pr-[12px] hover:bg-primaryStroke/35"
          }`}
        >
          <div className="flex flex-row items-center justify-center gap-[4px]">
            <i className="ri-wallet-line cursor-pointer text-[18px] text-textSecondary transition-colors duration-150 ease-in-out group-hover:text-textPrimary" />
            <span className="cursor-pointer text-[14px] font-medium text-textSecondary transition-colors duration-150 ease-in-out group-hover:text-textPrimary">
              {compact ? count : selected || count}
            </span>
          </div>
          <div className="flex flex-row items-center justify-center gap-[4px]">
            <img src={ASSETS.sol} alt="SOL" className="h-[15px] w-[15px] object-contain" />
            <span className="cursor-pointer text-[14px] font-medium text-textPrimary transition-colors duration-150 ease-in-out group-hover:text-textPrimary">
              <span>0</span>
            </span>
          </div>
          <i
            className={`ri-arrow-down-s-line cursor-pointer text-[18px] text-textSecondary transition-all duration-150 ease-in-out group-hover:text-textPrimary ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Quick-buy amount input with P1/P2/P3 preset switcher + config menu  */
/* ------------------------------------------------------------------ */
export function QuickBuyInput({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { quickBuy, setQuickBuy } = useHyzrUI();
  const [preset, setPreset] = useState(1);
  const [draft, setDraft] = useState("");

  const presets = ["P1", "P2", "P3"];

  const pick = (v: QuickBuyValue) => {
    setQuickBuy(preset, v);
    if (v !== "on") setDraft(v === "20%" ? "20%" : v);
  };

  const displayValue = draft || (quickBuy[preset] && quickBuy[preset] !== "on" ? quickBuy[preset] : "");

  return (
    <div
      className={`flex h-[32px] flex-row items-center justify-start gap-[8px] overflow-hidden whitespace-nowrap rounded-[8px] rounded-full border-[1px] border-primaryStroke pl-[12px] font-normal transition-all duration-[65ms] ease-out ${
        compact ? "flex-1" : "min-w-[280px]"
      }`}
    >
      {!compact && (
        <span className="flex text-[14px] font-medium text-textTertiary">
          Quick Buy
        </span>
      )}
      <div className="flex min-w-[0px] flex-1 sm:max-w-[60px]">
        <input
          type="text"
          value={displayValue}
          onChange={(e) => setDraft(e.target.value.replace(/[^0-9.%]/g, ""))}
          placeholder="0.0"
          className="w-full bg-transparent text-left text-[14px] font-medium text-textPrimary outline-none"
        />
      </div>
      <img src={ASSETS.sol} alt="SOL" className="h-[15px] w-[15px] object-contain" />
      <div className="flex h-full cursor-pointer items-center justify-center gap-[6px] border-l-[1px] border-primaryStroke pl-[3px] pr-[3px]">
        {presets.map((p, i) => (
          <Popover
            key={p}
            align="end"
            gap={6}
            content={(close) => (
              <QuickBuyPresetMenu
                preset={i + 1}
                onPick={(v) => {
                  pick(v);
                  close();
                }}
              />
            )}
            button={({ toggle }) => (
              <button

                type="button"
                onClick={() => {
                  if (preset === i + 1) {
                    // already active → toggles its config menu
                    toggle();
                  } else {
                    setPreset(i + 1);
                    setDraft("");
                  }
                }}
                className={`duration-125 group relative flex h-[24px] flex-row items-center justify-center gap-[4px] rounded-[4px] px-[6px] transition-colors ease-in-out ${
                  i === 2 ? "rounded-l-[4px] rounded-r-full" : ""
                } ${
                  preset === i + 1
                    ? "bg-white/[0.04] hover:bg-primaryBlueHover/10"
                    : "hover:bg-primaryStroke/60"
                }`}
              >
                <span
                  className={`duration-125 flex flex-row items-center justify-center gap-[4px] text-[13px]! font-medium transition-colors ease-in-out ${
                    preset === i + 1
                      ? "text-primaryBlue hover:text-primaryBlueHover"
                      : "text-textSecondary"
                  }`}
                >
                  {p}
                </span>
              </button>
            )}
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Surge market-cap ceiling:  [−]  ▰▰▰ 50K  [+]  ⓘ                     */
/* (the slider row shown when a Surge source is active)                */
/* ------------------------------------------------------------------ */
export function SurgeCapControl() {
  const { surgeCapIdx, setSurgeCapIdx } = useHyzrUI();
  const max = SURGE_CAPS.length - 1;
  const idx = Math.min(Math.max(surgeCapIdx, 0), max);
  const pct = max === 0 ? 0 : (idx / max) * 100;
  const label = SURGE_CAP_LABELS[idx];

  const step = (d: number) =>
    setSurgeCapIdx(Math.min(Math.max(idx + d, 0), max));

  return (
    <div className="flex flex-row items-center gap-[8px]">
      <button
        type="button"
        aria-label="Decrease market cap ceiling"
        onClick={() => step(-1)}
        className="flex h-[28px] w-[28px] flex-shrink-0 items-center justify-center rounded-full text-textSecondary transition-colors duration-150 hover:bg-primaryStroke/60 hover:text-textPrimary"
      >
        <i className="ri-subtract-line text-[16px]" />
      </button>

      <div
        className="relative h-[28px] w-[170px] flex-shrink-0 overflow-hidden rounded-full bg-secondaryStroke/25"
        title={`Max market cap: $${label}`}
      >
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primaryBlue to-primaryBlueHover transition-all duration-150 ease-out"
          style={{ width: `calc(${pct}% + ${pct > 0 && pct < 100 ? 14 : 0}px)` }}
        />
        <span className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center text-[13px] font-medium text-white">
          {label}
        </span>
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={idx}
          onChange={(e) => setSurgeCapIdx(Number(e.target.value))}
          className="absolute inset-0 z-[2] h-full w-full cursor-pointer opacity-0"
          aria-label="Max market cap"
        />
      </div>

      <button
        type="button"
        aria-label="Increase market cap ceiling"
        onClick={() => step(1)}
        className="flex h-[28px] w-[28px] flex-shrink-0 items-center justify-center rounded-full text-textSecondary transition-colors duration-150 hover:bg-primaryStroke/60 hover:text-textPrimary"
      >
        <i className="ri-add-line text-[16px]" />
      </button>

      <Popover
        gap={10}
        content={() => (
          <div className="w-[240px] p-[12px]">
            <div className="mb-[6px] text-[13px] font-semibold text-textPrimary">
              Market cap ceiling
            </div>
            <div className="text-[12px] leading-[18px] text-textSecondary">
              Only pairs below this market cap feed the Surging list. Lower it
              to catch earlier gems, raise it to include runners.
            </div>
          </div>
        )}
        button={({ toggle }) => (
          <button
            type="button"
            aria-label="About the market cap ceiling"
            onClick={toggle}
            className="flex h-[24px] w-[24px] items-center justify-center rounded-full text-textTertiary transition-colors duration-150 hover:text-textPrimary"
          >
            <i className="ri-information-line text-[15px]" />
          </button>
        )}
      />
    </div>
  );
}
