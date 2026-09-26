"use client";

import { useState } from "react";
import { ASSETS } from "@/lib/hyzr-data";
import { useHyzrUI } from "../ui/HyzrUI";
import { PusdIcon } from "../ui/icons";
import { WalletLogo } from "../ui/icons";
import { useTradeStore } from "@/lib/hyperliquid/tradeStore";
import { useWalletStore, activeWallet, shortAddr } from "@/lib/walletStore";

type BalanceView = "sol" | "perps" | "poly";

function ViewIcon() {
  /* the small overlapping-squares icon before Sol / Perps / Poly */
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
    >
      <rect x="4.2" y="1.2" width="8.6" height="8.6" rx="1.8" />
      <path d="M9.8 12.8H3a1.8 1.8 0 0 1-1.8-1.8V4.2" />
    </svg>
  );
}

/* Wallet dropdown content — 420px panel per the original screenshots. */
export function WalletMenuContent({ close }: { close: () => void }) {
  const { setModal } = useHyzrUI();
  const [view, setView] = useState<BalanceView>("sol");
  const balance = useTradeStore((s) => s.balance);
  const wallets = useWalletStore((s) => s.wallets);
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const balances = useWalletStore((s) => s.balances);
  const active = activeWallet({ wallets, activeAddress });

  const views: { id: BalanceView; label: string }[] = [
    { id: "sol", label: "Sol" },
    { id: "perps", label: "Perps" },
    { id: "poly", label: "Poly" },
  ];

  return (
    <div className="w-[calc(100vw-24px)] max-w-[420px] rounded-[12px] p-[20px]">
      {/* header row */}
      <div className="flex flex-row items-center justify-between">
        <span className="text-[15px] font-medium text-textPrimary">
          Total Value
        </span>
        <div className="flex flex-row items-center gap-[14px]">
          {views.map((v) => (
            <button
              key={v.id}
              type="button"
              onClick={() => setView(v.id)}
              className={`flex flex-row items-center gap-[5px] transition-colors duration-150 ${
                view === v.id
                  ? "text-textPrimary"
                  : "text-textTertiary hover:text-textSecondary"
              }`}
            >
              <ViewIcon />
              <span className="text-[13px] font-medium">{v.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* total */}
      <div className="mt-[10px] text-[26px] font-bold leading-[32px] text-textPrimary">
        ${balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
      </div>

      {/* currency segmented control + settings */}
      <div className="mt-[16px] flex flex-row items-center gap-[10px]">
        <div className="flex flex-1 flex-row items-center rounded-full bg-white/[0.055] p-[3px]">
          <button
            type="button"
            onClick={() => setView("sol")}
            className={`flex h-[30px] flex-1 flex-row items-center justify-center gap-[6px] rounded-full px-[10px] text-[14px] font-semibold transition-colors duration-150 ${
              view === "sol"
                ? "bg-white/[0.09] text-textPrimary"
                : "text-textSecondary hover:text-textPrimary"
            }`}
          >
            <img src={ASSETS.sol} alt="SOL" width={15} height={15} />
            SOL
          </button>
          <button
            type="button"
            onClick={() => setView("perps")}
            className={`flex h-[30px] flex-1 flex-row items-center justify-center gap-[6px] rounded-full px-[10px] text-[14px] font-semibold transition-colors duration-150 ${
              view === "perps"
                ? "bg-white/[0.09] text-textPrimary"
                : "text-textSecondary hover:text-textPrimary"
            }`}
          >
            <img src={ASSETS.usdc} alt="USDC" width={15} height={15} />
            USDC
          </button>
          <button
            type="button"
            onClick={() => setView("poly")}
            className={`flex h-[30px] flex-1 flex-row items-center justify-center gap-[6px] rounded-full px-[10px] text-[14px] font-semibold transition-colors duration-150 ${
              view === "poly"
                ? "bg-white/[0.09] text-textPrimary"
                : "text-textSecondary hover:text-textPrimary"
            }`}
          >
            <img src={ASSETS.sol} alt="uSOL" width={15} height={15} />
            uSOL
          </button>
        </div>
        <button
          type="button"
          title="Manage wallet — open Portfolio"
          onClick={() => {
            close?.();
            window.location.assign("/portfolio");
          }}
          className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full text-textTertiary transition-colors duration-150 hover:bg-white/[0.06] hover:text-textSecondary"
        >
          <i className="ri-settings-3-line text-[16px]" />
        </button>
      </div>

      {/* 2x2 balances grid */}
      <div className="mt-[18px] grid grid-cols-2 border-y border-white/[0.06]">
        <div className="flex flex-col items-start border-r border-white/[0.06] py-[20px] pr-[12px]">
          <div className="flex flex-row items-center gap-[8px]">
            <img src={ASSETS.sol} alt="SOL" width={18} height={18} />
            <span className="text-[17px] font-bold text-textPrimary">0</span>
          </div>
          <span className="mt-[6px] text-[14px] text-textTertiary">SOL</span>
        </div>
        <div className="flex flex-col items-start py-[20px] pl-[16px]">
          <div className="flex flex-row items-center gap-[8px]">
            <img src={ASSETS.usdc} alt="USDC" width={18} height={18} />
            <span className="text-[17px] font-bold text-textPrimary">{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <span className="mt-[6px] text-[14px] text-textTertiary">USDC</span>
        </div>
        <div className="flex flex-col items-start border-r border-t border-white/[0.06] py-[20px] pr-[12px]">
          <div className="flex flex-row items-center gap-[8px]">
            <img src={ASSETS.usdc} alt="HL USDC" width={18} height={18} />
            <span className="text-[17px] font-bold text-textPrimary">{balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
          </div>
          <span className="mt-[6px] text-[14px] text-textTertiary">
            HL USDC
          </span>
        </div>
        <div className="flex flex-col items-start border-t border-white/[0.06] py-[20px] pl-[16px]">
          <div className="flex flex-row items-center gap-[8px]">
            <PusdIcon size={18} />
            <span className="text-[17px] font-bold text-textPrimary">0</span>
          </div>
          <span className="mt-[6px] text-[14px] text-textTertiary">PUSD</span>
        </div>
      </div>

      {/* actions */}
      <div className="mt-[20px] grid grid-cols-2 gap-[12px]">
        <button
          type="button"
          onClick={() => {
            close();
            setModal("deposit");
          }}
          className="h-[42px] rounded-[10px] bg-primaryBlue text-[15px] font-bold text-white transition-colors duration-150 hover:bg-primaryBlueHover"
        >
          Deposit
        </button>
        <button
          type="button"
          onClick={() => {
            close();
            setModal("withdraw");
          }}
          className="h-[42px] rounded-[10px] bg-white/[0.07] text-[15px] font-bold text-textPrimary transition-colors duration-150 hover:bg-white/[0.11]"
        >
          Withdraw
        </button>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[.06] bg-white/[.025] px-3 py-2.5"><div className="flex min-w-0 items-center gap-2.5">{active ? <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/[0.06]"><WalletLogo kind={active.kind} size={17} /></span> : null}<div className="min-w-0"><p className="text-[10px] font-bold text-textSecondary">{active ? `${active.kind} · ${shortAddr(active.address, 4)}` : "No external wallet connected"}</p><p className="truncate text-[9px] text-textTertiary">{active ? [balances[active.address]?.native ? `${balances[active.address]?.native} ${balances[active.address]?.symbol}` : null, balances[active.address]?.usdc ? `${balances[active.address]?.usdc} USDC` : null].filter(Boolean).join(" · ") || "Balances loading…" : "Connect Phantom, Solflare or an EVM wallet"}</p></div></div><button onClick={() => { close(); setModal("deposit"); }} className="ml-3 shrink-0 text-[10px] font-bold text-[#c7cdd3] hover:text-white">{active ? "Manage" : "Connect"}</button></div>
    </div>
  );
}
