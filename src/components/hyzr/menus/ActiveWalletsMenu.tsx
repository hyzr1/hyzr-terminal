"use client";

import { useState } from "react";
import { ASSETS } from "@/lib/hyzr-data";
import { useHyzrUI } from "../ui/HyzrUI";
import { WalletLogo } from "../ui/icons";
import { useWalletStore, activeWallet, shortAddr } from "@/lib/walletStore";
import { toast } from "@/lib/hyperliquid/tradeStore";

function Switch({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative h-[22px] w-[40px] flex-shrink-0 rounded-full transition-colors duration-150 ${
        on ? "bg-primaryBlue" : "bg-primaryStroke"
      }`}
    >
      <span
        className={`absolute top-[2px] h-[18px] w-[18px] rounded-full bg-[#8F939E] shadow transition-all duration-150 ${
          on ? "left-[20px] bg-white" : "left-[2px]"
        }`}
      />
    </button>
  );
}

/**
 * "Active wallets" dropdown — per the original screenshots:
 * Unselect All / Select All with Balance + gear, wallet row with orange
 * checkbox, Off tag, address + copy, SOL balance pill, perps switch,
 * then + Add Wallet.
 */
export function ActiveWalletsMenuContent({ close }: { close: () => void }) {
  const { wallets, setWallets } = useHyzrUI();
  const [copied, setCopied] = useState(false);
  const paired = useWalletStore((s) => s.wallets);
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const balances = useWalletStore((s) => s.balances);

  const patch = (id: string, p: Partial<(typeof wallets)[number]>) =>
    setWallets(wallets.map((w) => (w.id === id ? { ...w, ...p } : w)));

  const copy = () => {
    try {
      navigator.clipboard?.writeText("BCCbEqmbGqVYzMBrq9oB4fWbLJkdnW53EydBCCbE");
    } catch {
      /* noop */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const anySelected = wallets.some((w) => w.selected);

  return (
    <div className="w-[calc(100vw-24px)] max-w-[430px] p-[10px]">
      {/* YOUR WALLETS — the user's own paired wallets (fx24). The active one
          is the trading account powering the whole terminal. */}
      {paired.length > 0 ? (
        <>
          <div className="px-[6px] pb-[6px] pt-[4px] text-[9px] font-bold uppercase tracking-[.16em] text-textTertiary">
            Your wallets · live trading
          </div>
          {paired.map((w) => {
            const isActive = w.address === activeAddress;
            const bal = balances[w.address];
            return (
              <button
                key={w.address}
                type="button"
                onClick={() => {
                  if (!isActive) {
                    useWalletStore.getState().setActive(w.address);
                    toast(`Trading as ${w.kind} ${shortAddr(w.address)}`, "info");
                  }
                }}
                className={`mb-[4px] flex w-full flex-row items-center gap-[12px] rounded-[10px] border px-[10px] py-[10px] text-left transition-colors duration-150 ${
                  isActive
                    ? "border-primaryBlue/40 bg-primaryBlue/[.08]"
                    : "border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.05]"
                }`}
              >
                <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] bg-white/[0.06]">
                  <WalletLogo kind={w.kind} size={17} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-[6px]">
                    <span className="text-[14px] font-semibold text-textPrimary">{w.kind}</span>
                    {w.verified ? <i title="Signature verified" className="ri-shield-check-fill text-[12px] text-increase" /> : null}
                    {isActive ? <span className="rounded-full bg-primaryBlue/20 px-[6px] py-px text-[8px] font-bold uppercase tracking-wide text-primaryBlue">Live</span> : null}
                  </span>
                  <span className="mt-[2px] flex items-center gap-[8px] text-[12px] text-textTertiary">
                    <span className="font-mono">{shortAddr(w.address, 4)}</span>
                    {bal?.native ? <span>{bal.native} {bal.symbol}</span> : null}
                    {bal?.usdc ? <span>· {bal.usdc} USDC</span> : null}
                  </span>
                </span>
                <i className={`flex-shrink-0 text-[16px] ${isActive ? "ri-checkbox-circle-fill text-primaryBlue" : "ri-checkbox-blank-circle-line text-textTertiary"}`} />
              </button>
            );
          })}
          <div className="mx-[6px] my-[6px] border-t border-white/[0.06]" />
          <div className="px-[6px] pb-[6px] text-[9px] font-bold uppercase tracking-[.16em] text-textTertiary">
            Copy trading
          </div>
        </>
      ) : null}

      {/* header */}
      <div className="flex flex-row items-center gap-[10px] px-[6px] pb-[12px] pt-[4px]">
        <button
          type="button"
          onClick={() =>
            setWallets(wallets.map((w) => ({ ...w, selected: false })))
          }
          className="flex h-[36px] items-center rounded-[10px] bg-white/[0.07] px-[14px] text-[14px] font-semibold text-textPrimary transition-colors duration-150 hover:bg-white/[0.1]"
        >
          {anySelected ? "Unselect All" : "Select All"}
        </button>
        <button
          type="button"
          onClick={() =>
            setWallets(
              wallets.map((w) => ({ ...w, selected: true, perpAuto: true })),
            )
          }
          className="px-[6px] text-[14px] font-medium text-textTertiary transition-colors duration-150 hover:text-textSecondary"
        >
          Select All with Balance
        </button>
        <button
          type="button"
          title="Toggle perps auto-trade for all wallets"
          onClick={() => {
            const anyOff = wallets.some((w) => !w.perpAuto);
            setWallets(wallets.map((w) => ({ ...w, perpAuto: anyOff })));
          }}
          className="ml-auto flex h-[30px] w-[30px] items-center justify-center rounded-full text-textTertiary transition-colors duration-150 hover:bg-white/[0.06] hover:text-textSecondary"
        >
          <i className="ri-settings-3-line text-[16px]" />
        </button>
      </div>

      {/* wallet rows */}
      {wallets.map((w) => (
        <div
          key={w.id}
          className="flex flex-row items-center gap-[12px] rounded-[10px] px-[6px] py-[10px] hover:bg-white/[0.02]"
        >
          <button
            type="button"
            onClick={() => patch(w.id, { selected: !w.selected })}
            className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-[6px] transition-colors duration-150 ${
              w.selected
                ? "bg-[#f7931a] text-white"
                : "border border-white/[0.18] text-transparent hover:border-white/[0.35]"
            }`}
          >
            <i className="ri-check-line text-[14px] font-bold" />
          </button>
          <div className="min-w-0">
            <div className="text-[15px] font-semibold leading-[20px] text-[#f7931a]">
              {w.name}
            </div>
            <div className="mt-[2px] flex flex-row items-center gap-[10px] text-[13px] text-textTertiary">
              <span className="flex flex-row items-center gap-[4px]">
                <i className="ri-forbid-line text-[12px]" />
                Off
              </span>
              <span className="flex cursor-pointer flex-row items-center gap-[4px] hover:text-textSecondary">
                {w.address}
                <button
                  type="button"
                  onClick={copy}
                  className="text-textTertiary transition-colors hover:text-textSecondary"
                >
                  <i
                    className={`${
                      copied ? "ri-check-line" : "ri-file-copy-line"
                    } text-[12px]`}
                  />
                </button>
              </span>
            </div>
          </div>
          <div className="ml-auto flex flex-shrink-0 flex-row items-center gap-[10px]">
            <div className="flex h-[34px] items-center gap-[6px] rounded-[10px] bg-white/[0.05] px-[10px]">
              <img src={ASSETS.sol} alt="SOL" width={16} height={16} />
              <span className="text-[14px] font-semibold text-textPrimary">
                0
              </span>
            </div>
            <Switch
              on={w.perpAuto}
              onChange={(v) => patch(w.id, { perpAuto: v })}
            />
            <span className="text-[14px] font-medium text-textSecondary">
              0
            </span>
          </div>
        </div>
      ))}

      <div className="mx-[6px] my-[6px] border-t border-white/[0.06]" />

      <button
        type="button"
        onClick={close}
        className="flex h-[48px] w-full flex-row items-center gap-[12px] rounded-[8px] px-[6px] transition-colors duration-150 hover:bg-white/[0.04]"
      >
        <i className="ri-add-line text-[18px] text-textSecondary" />
        <span className="text-[15px] font-semibold text-textPrimary">
          Add Wallet
        </span>
      </button>
    </div>
  );
}
