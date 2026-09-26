"use client";
/**
 * AccountPanel (fx19) — the Account/Balance component (TopstepX panel set):
 * account value, balance, available margin, margin used, realized (session)
 * + unrealized P&L, open positions/orders counts, trading mode chip.
 * Deposit tops the demo balance; the settings chip opens trading-mode.
 */
import { useMemo } from "react";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import {
  useTradeStore, accountValueCalc, toast, DEMO_DEPOSIT,
} from "@/lib/hyperliquid/tradeStore";
import { fmtUsdFull } from "@/lib/hyperliquid/format";
import { useWalletStore, activeWallet, shortAddr } from "@/lib/walletStore";
import { WalletLogo } from "../ui/icons";

export default function AccountPanel() {
  const balance = useTradeStore((s) => s.balance);
  const positions = useTradeStore((s) => s.positions);
  const orders = useTradeStore((s) => s.orders);
  const fills = useTradeStore((s) => s.fills);
  const mids = usePerpsData((s) => s.mids);
  const deposit = useTradeStore((s) => s.deposit);
  const mode = useTradeStore((s) => s.mode);
  const testnet = useTradeStore((s) => s.testnet);
  const paired = useWalletStore((s) => s.wallets);
  const activeAddress = useWalletStore((s) => s.activeAddress);
  const active = activeWallet({ wallets: paired, activeAddress });

  const stats = useMemo(() => {
    const accountValue = accountValueCalc(balance, positions, mids);
    let upnl = 0;
    let used = 0;
    for (const p of Object.values(positions)) {
      if (!p || p.szi === 0) continue;
      const mark = mids[p.coin] ?? p.entryPx;
      upnl += (mark - p.entryPx) * p.szi;
      used += (Math.abs(p.szi) * p.entryPx) / p.leverage + (p.isCross ? 0 : p.isolatedMargin);
    }
    const rpnl = fills.reduce((a, f) => a + f.closedPnl, 0);
    return {
      accountValue,
      upnl,
      rpnl,
      used,
      avail: Math.max(0, accountValue - used),
      posCount: Object.values(positions).filter((p) => p && p.szi !== 0).length,
      orderCount: orders.length,
    };
  }, [balance, positions, orders, fills, mids]);

  const cls = (v: number) => (v > 0 ? "text-increase" : v < 0 ? "text-decrease" : "text-textSecondary");
  const sign = (v: number) => (v >= 0 ? "+" : "-");

  return (
    <div className="flex h-full w-full flex-col overflow-y-auto bg-backgroundSecondary [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      <div className="flex flex-col gap-[2px] px-[14px] pb-[56px] pt-[10px]">
        {/* headline */}
        <div className="flex flex-row items-end justify-between pb-[8px]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.08em] text-textTertiary">Account Value</div>
            <div className="font-GeistMono text-[22px] font-medium leading-[28px] text-textPrimary tabular-nums">
              ${fmtUsdFull(stats.accountValue)}
            </div>
          </div>
          <button
            onClick={() => { deposit(DEMO_DEPOSIT); toast(`Added $${DEMO_DEPOSIT.toLocaleString()} demo USDC`, "success"); }}
            className="rounded-[6px] border border-primaryStroke/60 bg-primaryBlue/10 px-[10px] py-[5px] text-[11px] font-semibold text-primaryBlueHover transition-colors hover:bg-primaryBlue/20"
          >
            Deposit
          </button>
        </div>

        <Row label="Balance" value={`$${fmtUsdFull(balance)}`} />
        <Row label="Available Margin" value={`$${fmtUsdFull(stats.avail)}`} />
        <Row label="Margin Used" value={`$${fmtUsdFull(stats.used)}`} />
        <Row
          label="Unrealized P&L"
          value={`${sign(stats.upnl)}$${fmtUsdFull(Math.abs(stats.upnl))}`}
          valueClass={cls(stats.upnl)}
        />
        <Row
          label="Realized P&L (session)"
          value={`${sign(stats.rpnl)}$${fmtUsdFull(Math.abs(stats.rpnl))}`}
          valueClass={cls(stats.rpnl)}
        />
        <Row label="Open Positions" value={String(stats.posCount)} />
        <Row label="Working Orders" value={String(stats.orderCount)} />
        <Row label="Fills (session)" value={String(fills.length)} />

        <div className="mt-[10px] flex flex-row items-center gap-[6px]">
          {active ? (
            <span className="flex h-[22px] items-center gap-[5px] rounded-[6px] border border-primaryStroke bg-backgroundTertiary px-[7px] text-[10px] font-bold tracking-[0.06em] text-textSecondary" title={`Trading account: ${active.address}`}>
              <WalletLogo kind={active.kind} size={12} />
              {shortAddr(active.address, 4)}
              {active.verified ? <i className="ri-shield-check-fill text-[10px] text-increase" /> : null}
            </span>
          ) : (
            <span className="flex h-[22px] items-center rounded-[6px] border border-primaryStroke bg-backgroundTertiary px-[8px] text-[10px] font-bold tracking-[0.06em] text-textTertiary">
              DEMO ACCOUNT
            </span>
          )}
          <span className="flex h-[22px] items-center rounded-[6px] border border-primaryStroke bg-backgroundTertiary px-[8px] text-[10px] font-bold tracking-[0.06em] text-textSecondary">
            {mode === "paper" ? "PAPER" : "LIVE"}
          </span>
          {mode === "live" && testnet && (
            <span className="flex h-[22px] items-center rounded-[6px] border border-primaryStroke bg-backgroundTertiary px-[8px] text-[10px] font-bold tracking-[0.06em] text-textSecondary">
              TESTNET
            </span>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent("perps-open-settings"))}
            className="ml-auto rounded-[6px] border border-primaryStroke/60 px-[10px] py-[3px] text-[11px] font-medium text-primaryBlueHover transition-colors hover:bg-primaryBlue/10"
          >
            Trading mode…
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex h-[24px] flex-row items-center justify-between border-b border-primaryStroke/30">
      <span className="text-[11.5px] text-textTertiary">{label}</span>
      <span className={`font-GeistMono text-[11.5px] tabular-nums ${valueClass ?? "text-textSecondary"}`}>
        {value}
      </span>
    </div>
  );
}
