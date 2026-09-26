"use client";
/** Paper/Live mode settings — paste a Hyperliquid API (agent) key, or approve a
 * locally-generated agent with the CONNECTED browser wallet (fx24). */
import { useEffect, useState } from "react";
import { useTradeStore, toast } from "@/lib/hyperliquid/tradeStore";
import { agentAddressFromKey, createAgentKeypair, approveAgentWithBrowserWallet } from "@/lib/hyperliquid/signing";
import { useWalletStore, activeWallet, shortAddr } from "@/lib/walletStore";
import { evmProviderFor, isSolanaKind } from "@/lib/walletProviders";
import { WalletLogo } from "../ui/icons";

export default function SettingsModal() {
  const [open, setOpen] = useState(false);
  const mode = useTradeStore((s) => s.mode);
  const testnet = useTradeStore((s) => s.testnet);
  const agentKey = useTradeStore((s) => s.agentKey);
  const setMode = useTradeStore((s) => s.setMode);
  const setAgent = useTradeStore((s) => s.setAgent);
  const setTestnet = useTradeStore((s) => s.setTestnet);
  const resetAccount = useTradeStore((s) => s.resetAccount);
  const [keyInput, setKeyInput] = useState("");
  const wallets = useWalletStore((s) => s.wallets);
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const active = activeWallet({ wallets, activeAddress });
  const [approving, setApproving] = useState(false);

  /** Real Hyperliquid connect flow: generate an agent keypair in-browser,
   *  have the connected EVM wallet sign the approveAgent typed data, POST it. */
  const connectAgentWithWallet = async () => {
    if (!active) return;
    const provider = evmProviderFor(active.kind);
    if (!provider) {
      toast("Hyperliquid agents need an EVM signature — paste an API key instead", "error");
      return;
    }
    setApproving(true);
    try {
      const testnet = useTradeStore.getState().testnet;
      const agent = createAgentKeypair();
      const res = await approveAgentWithBrowserWallet({
        userAddress: active.address,
        agentAddress: agent.address,
        testnet,
        request: (args) => provider.request(args),
      });
      if (!res.ok) {
        toast(res.error ?? "Agent approval failed", "error");
        return;
      }
      setAgent(agent.key);
      setMode("live");
      toast(`Live — agent ${shortAddr(agent.address, 4)} approved by ${active.kind}`, "success");
      setOpen(false);
    } finally {
      setApproving(false);
    }
  };

  useEffect(() => {
    const h = () => setOpen(true);
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("perps-open-settings", h);
    document.addEventListener("keydown", k);
    return () => {
      window.removeEventListener("perps-open-settings", h);
      document.removeEventListener("keydown", k);
    };
  }, []);

  if (!open) return null;

  const saveKey = () => {
    const k = keyInput.trim();
    if (!k) return;
    try {
      const addr = agentAddressFromKey(k);
      setAgent(k);
      setMode("live");
      toast(`Live mode enabled — agent ${addr.slice(0, 6)}…${addr.slice(-4)}`, "success");
      setOpen(false);
    } catch {
      toast("Invalid private key", "error");
    }
  };

  return (
    <div className="fade-in fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-[12px] backdrop-blur-[8px]" onMouseDown={() => setOpen(false)}>
      <div
        className="glass-pop-strong pop-in w-[min(380px,100%)] rounded-[14px] border border-white/10 p-[16px] shadow-dropdown"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-[12px]">
          <span className="text-[14px] font-semibold text-textPrimary">Trading Mode</span>
          <button onClick={() => setOpen(false)} className="text-textSecondary hover:text-textPrimary">
            <i className="ri-close-line text-[18px]" />
          </button>
        </div>

        <div className="flex flex-row gap-[4px] rounded-[8px] border border-primaryStroke bg-primaryStroke/50 p-[4px]">
          <button
            onClick={() => setMode("paper")}
            className={`flex-1 rounded-[6px] py-[11px] text-[12px] font-medium ${mode === "paper" ? "bg-primaryBlue font-bold text-background" : "text-textSecondary hover:bg-primaryStroke/40"}`}
          >
            Paper Trading
          </button>
          <button
            onClick={() => {
              if (!agentKey) { toast("Add an API wallet key first", "error"); return; }
              setMode("live");
            }}
            className={`flex-1 rounded-[6px] py-[11px] text-[12px] font-medium ${mode === "live" ? "bg-primaryBlue font-bold text-background" : "text-textSecondary hover:bg-primaryStroke/40"}`}
          >
            Live Trading
          </button>
        </div>

        {/* connected wallet → live agent (fx24). Shown in BOTH modes:
            in paper mode this is the one-click path to go live. */}
        <div className="mt-[12px] rounded-[8px] border border-primaryStroke bg-primaryStroke/40 p-[10px]">
          <div className="flex items-center gap-[8px]">
            {active ? (
              <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-[6px] bg-white/[0.06]">
                <WalletLogo kind={active.kind} size={15} />
              </span>
            ) : null}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-bold text-textPrimary">
                {active ? `${active.kind} · ${shortAddr(active.address, 4)}` : "No wallet connected"}
              </p>
              <p className="text-[10px] text-textTertiary">
                {active
                  ? isSolanaKind(active.kind)
                    ? "Solana wallets can't sign Hyperliquid agents — use Live Trading → paste a key"
                    : "Approve a locally-generated agent with this wallet"
                  : "Fund HYZR → connect an EVM wallet to go live"}
              </p>
            </div>
            <button
              disabled={!active || isSolanaKind(active.kind) || approving}
              onClick={() => void connectAgentWithWallet()}
              className={`flex h-[28px] shrink-0 items-center gap-[5px] rounded-[6px] px-[10px] text-[11px] font-bold transition-colors ${
                !active || isSolanaKind(active.kind) || approving
                  ? "cursor-not-allowed bg-white/[0.05] text-textTertiary"
                  : "bg-primaryBlue text-background hover:bg-primaryBlueHover"
              }`}
            >
              {approving ? <i className="ri-loader-4-line animate-spin" /> : <i className="ri-links-line" />}
              {approving ? "Approving…" : "Approve & Go Live"}
            </button>
          </div>
        </div>

        {mode === "live" && (
          <>
            <div className="pt-[12px]">
              <span className="text-[12px] text-textTertiary">Hyperliquid API wallet (agent) private key</span>
              <input
                value={agentKey ?? ""}
                onChange={(e) => setKeyInput(e.target.value)}
                type="password"
                placeholder="0x…"
                className="mt-[6px] h-[32px] w-full rounded-[6px] border border-primaryStroke bg-primaryStroke/50 px-[8px] text-[12px] text-textPrimary outline-none placeholder:text-textTertiary"
              />
              <button
                onClick={saveKey}
                className="mt-[8px] h-[30px] w-full rounded-[6px] bg-primaryBlue text-[12px] font-bold text-background hover:bg-primaryBlueHover"
              >
                Save Key & Go Live
              </button>
            </div>
            <label className="mt-[10px] flex cursor-pointer items-center gap-[8px]">
              <input type="checkbox" checked={testnet} onChange={(e) => setTestnet(e.target.checked)} className="accent-[rgb(82,111,255)]" />
              <span className="text-[12px] text-textSecondary">Use testnet (api.hyperliquid-testnet.xyz)</span>
            </label>
            <p className="pt-[8px] text-[11px] leading-[14px] text-textTertiary">
              Orders are signed locally (EIP-712, Exchange chainId 1337) and sent straight to
              Hyperliquid&apos;s /exchange endpoint. Your key never leaves the browser.
            </p>
          </>
        )}

        {mode === "paper" && (
          <p className="pt-[12px] text-[11px] leading-[14px] text-textTertiary">
            Paper orders fill against the real Hyperliquid order book with realistic slippage,
            taker fees (0.045%) and hourly funding. Positions and PnL are tracked locally.
          </p>
        )}

        <div className="mt-[12px] flex justify-between">
          <button
            onClick={() => { resetAccount(); toast("Paper account reset to $10,000", "info"); }}
            className="rounded-[6px] border border-primaryStroke/50 px-[10px] py-[6px] text-[11px] font-medium text-textSecondary hover:bg-primaryStroke/40"
          >
            Reset paper account
          </button>
          <button
            onClick={() => setOpen(false)}
            className="rounded-[6px] bg-primaryBlue px-[14px] py-[6px] text-[11px] font-bold text-background hover:bg-primaryBlueHover"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
