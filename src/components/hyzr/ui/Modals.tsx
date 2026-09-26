"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ASSETS } from "@/lib/hyzr-data";
import { useHyzrUI } from "./HyzrUI";
import {
  useWalletStore,
  activeWallet,
  shortAddr,
  type ConnectedWallet,
  type WalletKind,
} from "@/lib/walletStore";
import {
  WalletNotInstalledError,
  connectWallet as connectProvider,
  disconnectWallet as disconnectProvider,
  detectWallet,
  verifyOwnership,
} from "@/lib/walletProviders";
import { toast, useTradeStore } from "@/lib/hyperliquid/tradeStore";
import { WalletLogo } from "./icons";

const WALLET_KINDS: WalletKind[] = ["Phantom", "Solflare", "MetaMask", "Coinbase"];

function explorerUrl(kind: WalletKind, address: string): string {
  return kind === "Phantom" || kind === "Solflare"
    ? `https://solscan.io/account/${address}`
    : `https://etherscan.io/address/${address}`;
}

function Shell({
  title,
  onClose,
  children,
  width = 420,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}) {
  return createPortal(
    <div className="fixed inset-0 z-[120]">
      <div
        className="hyzr-modal-backdrop absolute inset-0"
        onPointerDown={onClose}
      />
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-[16px]">
        <div
          className="hyzr-modal-panel pointer-events-auto w-full overflow-hidden rounded-[14px] border border-white/[0.07] bg-backgroundTertiary shadow-[0_32px_80px_-16px_rgb(0_0_0/0.85)]"
          style={{ maxWidth: width }}
        >
          <div className="flex flex-row items-center justify-between border-b border-white/[0.06] px-[20px] py-[14px]">
            <span className="text-[16px] font-semibold text-textPrimary">
              {title}
            </span>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[28px] w-[28px] items-center justify-center rounded-[8px] text-textTertiary transition-colors hover:bg-white/[0.06] hover:text-textPrimary"
            >
              <i className="ri-close-line text-[18px]" />
            </button>
          </div>
          <div className="p-[20px]">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export function HyzrModals() {
  const { modal, setModal } = useHyzrUI();
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<"sol" | "usdc">("sol");
  const [fundAmount, setFundAmount] = useState("1000");
  const [walletError, setWalletError] = useState("");
  const [installUrl, setInstallUrl] = useState<string | null>(null);
  const [detected, setDetected] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);
  const [verifying, setVerifying] = useState<string | null>(null);
  const wallets = useWalletStore((s) => s.wallets);
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const connecting = useWalletStore((s) => s.connecting);
  const balances = useWalletStore((s) => s.balances);
  const store = useWalletStore.getState();
  const active = activeWallet({ wallets, activeAddress });
  const depositDemo = useTradeStore((s) => s.deposit);
  const close = () => setModal(null);

  /* live per-wallet detection: immediate sync pass, then EIP-6963 announcements.
     runs whenever the picker is visible — including "add another wallet" mode. */
  useEffect(() => {
    if (modal !== "deposit") return;
    const pickerVisible = wallets.length === 0 || adding;
    if (!pickerVisible) return;
    const probe = () => {
      const next: Record<string, boolean> = {};
      for (const kind of WALLET_KINDS) next[kind] = detectWallet(kind) !== null;
      setDetected(next);
    };
    probe();
    const t1 = setTimeout(probe, 250); // after EIP-6963 announceProvider window
    const t2 = setTimeout(probe, 1200); // late-injecting extensions
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [modal, wallets.length, adding]);

  const connectWallet = async (kind: WalletKind) => {
    setWalletError("");
    setInstallUrl(null);
    store.setConnecting(kind);
    try {
      const { address } = await connectProvider(kind);
      useWalletStore.getState().connect(kind, address);
      toast(`${kind} connected — trading as ${shortAddr(address)}`, "success");
    } catch (error) {
      useWalletStore.getState().setConnecting(null);
      if (error instanceof WalletNotInstalledError) {
        setInstallUrl(error.installUrl);
      }
      const message = error instanceof Error ? error.message : "Wallet connection failed";
      setWalletError(message);
      toast(message, "error");
    }
  };

  const verify = async (w: ConnectedWallet) => {
    setWalletError("");
    setInstallUrl(null);
    setVerifying(w.address);
    try {
      await verifyOwnership(w.kind, w.address);
      useWalletStore.getState().markVerified(w.address);
      toast(`${w.kind} ownership verified`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Verification failed";
      setWalletError(message);
      toast(message, "error");
    } finally {
      setVerifying(null);
    }
  };

  const removeWallet = (w: ConnectedWallet) => {
    void disconnectProvider(w.kind);
    useWalletStore.getState().disconnect(w.address);
    toast(`${w.kind} ${shortAddr(w.address)} removed`, "info");
  };

  const showPicker = wallets.length === 0 || adding;

  if (modal === "deposit") {
    return (
      <Shell title="Fund HYZR" onClose={close} width={500}>
        <div className="mb-4 rounded-xl border border-white/[.07] bg-white/[.025] p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[12px] font-bold text-textPrimary">{wallets.length > 0 ? "Your wallets" : "Connect a wallet"}</p>
              <p className="mt-0.5 text-[10px] text-textTertiary">{wallets.length > 0 ? "The active wallet's account is live in the terminal" : "No account setup or identity verification"}</p>
            </div>
            {active ? <button onClick={() => removeWallet(active)} className="text-[10px] text-textTertiary hover:text-white">Disconnect</button> : null}
          </div>

          {/* paired wallet manager — switch active / verify / explore / remove */}
          {wallets.length > 0 ? (
            <div className="mt-3 flex flex-col gap-[6px]">
              {wallets.map((w) => {
                const isActive = w.address === activeAddress;
                const bal = balances[w.address];
                return (
                  <div
                    key={w.address}
                    role="button"
                    tabIndex={0}
                    onClick={() => { if (!isActive) { useWalletStore.getState().setActive(w.address); toast(`Trading as ${w.kind} ${shortAddr(w.address)}`, "info"); } }}
                    onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !isActive) { e.preventDefault(); useWalletStore.getState().setActive(w.address); } }}
                    className={`flex w-full cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors ${isActive ? "border-increase/25 bg-increase/[.06]" : "border-white/[0.07] bg-white/[0.02] hover:border-white/[0.16] hover:bg-white/[0.045]"}`}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/[0.06]"><WalletLogo kind={w.kind} size={20} /></span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[11px] font-bold text-white">{w.kind}</p>
                        {w.verified ? <i title="Signature verified" className="ri-shield-check-fill text-[11px] text-increase" /> : null}
                        {isActive ? <span className="rounded-full bg-increase/15 px-1.5 py-px text-[8px] font-bold uppercase tracking-wide text-increase">Active</span> : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="truncate font-mono text-[10px] text-textTertiary">{shortAddr(w.address, 6)}</span>
                        <span className="flex shrink-0 items-center gap-1 text-[10px] text-textSecondary">
                          {bal?.loading ? <i className="ri-loader-4-line animate-spin text-[9px] text-textTertiary" /> : null}
                          {bal?.native ? <span>{bal.native} {bal.symbol}</span> : null}
                          {bal?.usdc ? <span className="text-textTertiary">· {bal.usdc} USDC</span> : null}
                        </span>
                      </div>
                    </div>
                    <span className="flex shrink-0 items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      {!w.verified ? (
                        <button title="Verify ownership by signing a message" onClick={() => void verify(w)} className="flex h-6 items-center gap-1 rounded-md bg-white/[0.06] px-1.5 text-[9px] font-bold text-textSecondary transition-colors hover:bg-white/[0.12] hover:text-white">
                          {verifying === w.address ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-shield-keyhole-line text-[11px]" />}Verify
                        </button>
                      ) : null}
                      <a title="View on explorer" href={explorerUrl(w.kind, w.address)} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} className="flex h-6 w-6 items-center justify-center rounded-md text-textTertiary transition-colors hover:bg-white/[0.08] hover:text-white"><i className="ri-external-link-line text-[11px]" /></a>
                      {!isActive ? (
                        <button title="Remove wallet" onClick={() => removeWallet(w)} className="flex h-6 w-6 items-center justify-center rounded-md text-textTertiary transition-colors hover:bg-decrease/15 hover:text-decrease"><i className="ri-close-line text-[13px]" /></button>
                      ) : null}
                    </span>
                  </div>
                );
              })}
              <button type="button" onClick={() => setAdding((v) => !v)} className="flex h-[34px] items-center justify-center gap-1.5 rounded-lg border border-dashed border-white/[0.12] text-[10px] font-bold text-textSecondary transition-colors hover:border-white/[0.25] hover:text-white">
                <i className={`${adding ? "ri-subtract-line" : "ri-add-line"} text-[13px]`} />{adding ? "Hide wallet options" : "Add another wallet"}
              </button>
            </div>
          ) : null}

          {showPicker ? <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {WALLET_KINDS.map((name) => (
            <button key={name} onClick={() => connectWallet(name)} type="button" className="relative flex h-[62px] flex-col items-center justify-center gap-[6px] rounded-[10px] border border-white/[0.07] bg-white/[0.035] text-[10px] font-medium text-textSecondary transition-colors hover:border-white/20 hover:bg-white/[0.07] hover:text-white">
              {connecting === name ? <i className="ri-loader-4-line animate-spin text-[18px]" /> : <WalletLogo kind={name} size={20} />}
              {name}
              {detected[name] ? <span title="Installed" className="absolute right-[6px] top-[6px] h-[5px] w-[5px] rounded-full bg-increase" /> : null}
            </button>
          ))}</div> : null}
          {walletError ? <div className="mt-2 flex items-center justify-between gap-2"><p className="flex items-center gap-1.5 text-[10px] text-decrease"><i className="ri-error-warning-line" />{walletError}</p>{installUrl ? <a href={installUrl} target="_blank" rel="noreferrer" className="shrink-0 rounded-md bg-white/[0.08] px-2 py-1 text-[10px] font-bold text-white transition-colors hover:bg-white/[0.14]">Install<i className="ri-external-link-line ml-1 text-[9px]" /></a> : null}</div> : null}
        </div>
        <div className="mb-[12px] flex items-center gap-[10px] text-[9px] font-bold uppercase tracking-[.16em] text-textTertiary"><span className="h-px flex-1 bg-white/[0.07]" />deposit crypto<span className="h-px flex-1 bg-white/[0.07]" /></div>
        <div className="mb-[14px] flex flex-row items-center rounded-full bg-white/[0.055] p-[3px]">
          {(
            [
              { id: "sol" as const, label: "SOL", img: ASSETS.sol },
              { id: "usdc" as const, label: "USDC", img: ASSETS.usdc },
            ]
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex h-[32px] flex-1 flex-row items-center justify-center gap-[6px] rounded-full text-[14px] font-semibold transition-colors ${
                tab === t.id
                  ? "bg-white/[0.09] text-textPrimary"
                  : "text-textSecondary hover:text-textPrimary"
              }`}
            >
              <img src={t.img} alt={t.label} width={15} height={15} />
              {t.label}
            </button>
          ))}
        </div>
        <div className="mb-[8px] text-[13px] font-medium text-textTertiary">
          Your {tab === "sol" ? "Solana" : "USDC"} deposit address · preview
        </div>
        <button
          type="button"
          onClick={() => {
            try {
              navigator.clipboard?.writeText(
                "BCCbEqmbGqVYzMBrq9oB4fWbLJkdnW53EydFq9oB4f",
              );
            } catch {
              /* noop */
            }
            setCopied(true);
            setTimeout(() => setCopied(false), 1200);
          }}
          className="flex h-[48px] w-full flex-row items-center justify-between rounded-[10px] bg-white/[0.05] px-[14px] transition-colors hover:bg-white/[0.08]"
        >
          <span className="truncate font-GeistMono text-[13px] text-textPrimary">
            BCCbEqmbGqVYzMBrq9oB4fWbLJkdnW53EydFq9oB4f
          </span>
          <i
            className={`${
              copied ? "ri-check-line text-primaryGreen" : "ri-file-copy-line"
            } ml-[10px] text-[15px] text-textSecondary`}
          />
        </button>
        <p className="mt-[14px] text-[13px] leading-[19px] text-textTertiary">
          This is a funding-flow preview. Wire the custody backend before accepting real assets; practice funds below work immediately.
        </p>
        <div className="mt-4 border-t border-white/[.07] pt-4"><div className="flex items-center justify-between"><div><p className="text-[11px] font-bold text-textPrimary">Practice balance</p><p className="mt-0.5 text-[10px] text-textTertiary">Fund paper trading instantly—no real assets used.</p></div><span className="rounded-full bg-[#aab3bd]/10 px-2 py-1 text-[9px] font-bold uppercase text-[#aab3bd]">Demo</span></div><div className="mt-3 flex gap-2"><div className="flex h-10 flex-1 items-center rounded-lg border border-white/[.08] bg-white/[.03] px-3"><span className="mr-2 text-textTertiary">$</span><input value={fundAmount} onChange={(e) => setFundAmount(e.target.value.replace(/[^0-9.]/g, ""))} className="min-w-0 flex-1 bg-transparent text-[13px] outline-none" /><span className="text-[10px] text-textTertiary">USDC</span></div><button onClick={() => { const amount = Number(fundAmount); if (amount > 0) { depositDemo(amount); toast(`Added $${amount.toLocaleString()} to practice balance`, "success"); close(); } }} className="steel-button rounded-lg px-4 text-[11px] font-bold">Add funds</button></div></div>
      </Shell>
    );
  }

  if (modal === "withdraw") {
    return (
      <Shell title="Withdraw" onClose={close}>
        <div className="mb-[8px] flex flex-row items-center justify-between">
          <span className="text-[13px] font-medium text-textTertiary">
            Amount
          </span>
          <span className="text-[13px] font-medium text-textTertiary">
            Available: 0 SOL
          </span>
        </div>
        <div className="flex h-[48px] items-center rounded-[10px] bg-white/[0.05] px-[14px]">
          <input
            placeholder="0.0"
            className="w-full bg-transparent text-[15px] font-medium text-textPrimary outline-none"
          />
          <img src={ASSETS.sol} alt="SOL" width={16} height={16} />
        </div>
        <button
          type="button"
          disabled
          className="mt-[16px] h-[42px] w-full rounded-[10px] bg-white/[0.07] text-[15px] font-bold text-textTertiary"
        >
          Enter an amount
        </button>
      </Shell>
    );
  }

  if (modal === "quicksell") {
    return (
      <Shell title="Quick Sell Presets" onClose={close} width={400}>
        <div className="flex flex-col gap-[10px]">
          {["P1", "P2", "P3"].map((p) => (
            <div
              key={p}
              className="flex h-[46px] flex-row items-center justify-between rounded-[10px] bg-white/[0.04] px-[14px]"
            >
              <span className="text-[14px] font-semibold text-textPrimary">
                {p}
              </span>
              <div className="flex h-[34px] flex-row items-center rounded-full bg-white/[0.05] px-[10px]">
                <input
                  placeholder="25%"
                  className="w-[70px] bg-transparent text-right text-[14px] font-medium text-textPrimary outline-none"
                />
                <span className="ml-[6px] text-[13px] text-textTertiary">
                  % supply
                </span>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={close}
          className="mt-[16px] h-[42px] w-full rounded-[10px] bg-primaryBlue text-[15px] font-bold text-white transition-colors hover:bg-primaryBlueHover"
        >
          Save Presets
        </button>
      </Shell>
    );
  }

  if (modal === "blacklist") {
    return (
      <Shell title="Blacklist" onClose={close} width={400}>
        <div className="flex flex-col items-center gap-[8px] py-[28px]">
          <i className="ri-file-forbid-line text-[26px] text-textTertiary" />
          <span className="text-[14px] text-textTertiary">
            No blacklisted tokens
          </span>
        </div>
      </Shell>
    );
  }

  return null;
}
