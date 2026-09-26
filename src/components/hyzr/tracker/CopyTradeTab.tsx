"use client";
/**
 * Copy Trading — configure mirror-copying of tracked wallets into the
 * paper trading engine (fixed $ or proportional sizing, leverage cap,
 * long-only), plus the live ledger of mirrored trades and their PnL.
 */
import { useEffect, useMemo, useState } from "react";
import { useTrackerStore, type CopyConfig } from "@/lib/tracker/trackerStore";
import { useFeedStore } from "@/lib/tracker/useTrackerStream";
import { useTradeStore, toast } from "@/lib/hyperliquid/tradeStore";
import { WalletAvatar, PillAction, CoinChip, TrackerModal, fmtUsdCompact, ageStr, pnlClass } from "./bits";
import { shortAddr } from "@/lib/tracker/trackerStore";

export default function CopyTradeTab() {
  const copies = useTrackerStore((s) => s.copies);
  const copied = useTrackerStore((s) => s.copied);
  const updateCopy = useTrackerStore((s) => s.updateCopy);
  const removeCopy = useTrackerStore((s) => s.removeCopy);
  const equity = useTradeStore((s) => s.balance);
  const [pickOpen, setPickOpen] = useState(false);

  const copiedPnl = useMemo(() => {
    // realized PnL of closed copy trades (from our own fills, tagged via detail)
    let sum = 0;
    for (const c of copied) {
      if (c.status === "closed" && c.closePnl !== undefined) sum += c.closePnl;
    }
    return sum;
  }, [copied]);

  const openCopies = copies.filter((c) => c.enabled).length;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* stats strip */}
      <div className="flex min-h-[52px] shrink-0 flex-wrap items-center gap-x-[14px] gap-y-[6px] border-b border-primaryStroke px-[12px] py-[6px] sm:h-[52px] sm:flex-nowrap sm:px-[16px] sm:py-0">
        <Stat label="Active copies" value={`${openCopies}/${copies.length}`} />
        <Stat label="Mirrored trades" value={String(copied.length)} />
        <Stat label="Copy PnL (closed)" value={fmtUsdCompact(copiedPnl, true)} cls={pnlClass(copiedPnl)} />
        <Stat label="Paper equity" value={fmtUsdCompact(equity)} />
        <div className="ml-auto">
          <PillAction label="Add Copy" icon="ri-add-line" kind="blue" onClick={() => setPickOpen(true)} />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-[16px]">
        {/* copy cards */}
        {copies.length === 0 ? (
          <div className="flex h-[180px] flex-col items-center justify-center gap-[10px] rounded-[10px] border border-dashed border-primaryStroke">
            <i className="ri-magic-line text-[26px] text-textTertiary" />
            <span className="text-[13px] text-textTertiary">
              Copy the best wallets automatically — their trades mirror into your paper account.
            </span>
            <PillAction label="Pick a wallet to copy" kind="blue" icon="ri-add-line" onClick={() => setPickOpen(true)} />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-[10px] md:grid-cols-2 xl:grid-cols-3">
            {copies.map((c) => (
              <CopyCard key={c.id} cfg={c} onUpdate={updateCopy} onRemove={removeCopy} />
            ))}
          </div>
        )}

        {/* copied trades ledger */}
        <div className="mt-[16px] text-[12px] font-semibold uppercase tracking-[0.04em] text-textTertiary">
          Mirrored Trades
        </div>
        <div className="mt-[6px] overflow-x-auto">
          <div className="min-w-[540px] overflow-hidden rounded-[8px] border border-primaryStroke">
            <div className="grid grid-cols-[64px_1fr_120px_90px_90px_100px] bg-primaryStroke/25 px-[12px] py-[6px] text-[11px] text-textTertiary">
              <span>Age</span>
              <span>Wallet</span>
              <span>Market</span>
              <span className="text-right">Size</span>
              <span className="text-right">Status</span>
              <span className="text-right">PnL</span>
            </div>
            {copied.length === 0 ? (
              <div className="flex h-[90px] items-center justify-center text-[12px] text-textTertiary">
                No mirrored trades yet — they appear the moment a copied wallet trades.
              </div>
            ) : (
              copied.slice(0, 80).map((t) => (
                <div
                  key={t.id}
                  className="grid grid-cols-[64px_1fr_120px_90px_90px_100px] items-center border-t border-primaryStroke/40 px-[12px] py-[6px] text-[12px]"
                >
                  <span className="text-textTertiary">{ageStr(t.t)}</span>
                  <span className="flex min-w-0 items-center gap-[7px]">
                    <WalletAvatar address={t.wallet} size={20} rounded="rounded-[5px]" />
                    <span className="font-GeistMono text-[11px] text-textSecondary">{shortAddr(t.wallet)}</span>
                  </span>
                  <span className="flex items-center gap-[6px]">
                    <CoinChip coin={t.coin} size={14} />
                    {t.isBuy ? (
                      <span className="rounded-full bg-increase/15 px-[5px] text-[9px] font-bold uppercase text-increase">long</span>
                    ) : (
                      <span className="rounded-full bg-decrease/15 px-[5px] text-[9px] font-bold uppercase text-decrease">short</span>
                    )}
                  </span>
                  <span className="text-right font-GeistMono text-textPrimary">
                    {t.usd ? fmtUsdCompact(t.usd) : `@ ${t.px.toPrecision(5)}`}
                  </span>
                  <span className="text-right">
                    <span
                      className={`rounded-full px-[7px] py-[1px] text-[10px] font-medium ${
                        t.status === "filled"
                          ? "bg-increase/15 text-increase"
                          : t.status === "closed"
                            ? "bg-primaryBlue/15 text-primaryBlue"
                            : "bg-decrease/15 text-decrease"
                      }`}
                    >
                      {t.status}
                    </span>
                  </span>
                  <span className={`text-right font-GeistMono ${pnlClass(t.closePnl)}`}>
                    {t.closePnl !== undefined ? fmtUsdCompact(t.closePnl, true) : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <WalletPicker
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        existing={copies.map((c) => c.wallet)}
      />
    </div>
  );
}

function Stat({ label, value, cls = "text-textPrimary" }: { label: string; value: string; cls?: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-[0.04em] text-textTertiary">{label}</span>
      <span className={`font-GeistMono text-[14px] font-medium ${cls}`}>{value}</span>
    </div>
  );
}

function CopyCard({
  cfg,
  onUpdate,
  onRemove,
}: {
  cfg: CopyConfig;
  onUpdate: (id: string, patch: Partial<CopyConfig>) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-[10px] rounded-[10px] border border-primaryStroke bg-backgroundSecondary/60 p-[12px]">
      <div className="flex items-center gap-[9px]">
        <WalletAvatar address={cfg.wallet} size={30} />
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-[13px] font-medium text-textPrimary">
            {cfg.label || shortAddr(cfg.wallet)}
          </span>
          <span className="font-GeistMono text-[10px] text-textTertiary">{shortAddr(cfg.wallet)}</span>
        </div>
        {/* switch */}
        <button
          type="button"
          onClick={() => onUpdate(cfg.id, { enabled: !cfg.enabled })}
          className={`relative h-[18px] w-[32px] rounded-full transition-colors ${
            cfg.enabled ? "bg-increase" : "bg-primaryStroke"
          }`}
        >
          <span
            className={`absolute top-[2px] h-[14px] w-[14px] rounded-full bg-background transition-all ${
              cfg.enabled ? "left-[16px]" : "left-[2px]"
            }`}
          />
        </button>
        <button
          type="button"
          onClick={() => onRemove(cfg.id)}
          className="flex h-[22px] w-[22px] items-center justify-center rounded-full text-textTertiary hover:bg-decrease/15 hover:text-decrease"
        >
          <i className="ri-delete-bin-line text-[13px]" />
        </button>
      </div>

      <div className="flex items-center gap-[6px]">
        <div className="flex h-[26px] flex-1 items-center gap-[2px] rounded-full bg-primaryStroke/40 p-[2px]">
          {(["fixed", "proportional"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => onUpdate(cfg.id, { sizing: m })}
              className={`h-[22px] flex-1 rounded-full text-[11px] font-medium capitalize transition-colors ${
                cfg.sizing === m ? "bg-primaryStroke text-textPrimary" : "text-textTertiary hover:text-textSecondary"
              }`}
            >
              {m === "fixed" ? "Fixed $" : "% Equity"}
            </button>
          ))}
        </div>
        <input
          value={cfg.sizing === "fixed" ? cfg.fixedUsd : cfg.propPct}
          onChange={(e) => {
            const v = parseFloat(e.target.value.replace(/[^0-9.]/g, "")) || 0;
            onUpdate(cfg.id, cfg.sizing === "fixed" ? { fixedUsd: v } : { propPct: v });
          }}
          className="h-[26px] w-[70px] rounded-full border border-primaryStroke bg-transparent text-center font-GeistMono text-[12px] text-textPrimary outline-none focus:border-primaryBlue"
        />
      </div>

      <div className="flex items-center justify-between text-[11px] text-textTertiary">
        <label className="flex items-center gap-[5px]">
          Max Lev
          <input
            value={cfg.maxLev}
            onChange={(e) => onUpdate(cfg.id, { maxLev: parseFloat(e.target.value.replace(/[^0-9]/g, "")) || 1 })}
            className="h-[22px] w-[42px] rounded-[6px] border border-primaryStroke bg-transparent text-center font-GeistMono text-[11px] text-textPrimary outline-none focus:border-primaryBlue"
          />
          x
        </label>
        <label className="flex cursor-pointer items-center gap-[5px]">
          <input
            type="checkbox"
            checked={cfg.longOnly}
            onChange={(e) => onUpdate(cfg.id, { longOnly: e.target.checked })}
            className="accent-[rgb(var(--primary-color))]"
          />
          Longs only
        </label>
      </div>
    </div>
  );
}

/* pick a wallet to copy — quick search over the leaderboard */
function WalletPicker({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: string[] }) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<{ address: string; name: string | null; pnl: number; av: number }[]>([]);
  const addCopy = useTrackerStore((s) => s.addCopy);
  const addWallet = useTrackerStore((s) => s.addWallet);

  const search = useMemo(() => q.trim(), [q]);
  const load = (query: string) => {
    const sp = new URLSearchParams({ window: "week", sort: "pnl", limit: "20", offset: "0" });
    if (query) sp.set("q", query);
    fetch(`/api/tracker/leaderboard?${sp}`)
      .then((r) => r.json())
      .then((j) => setRows(j.rows ?? []))
      .catch(() => {});
  };

  useEffect(() => {
    if (!open) return;
    load(search);
  }, [open, search]);

  return (
    <TrackerModal open={open} onClose={onClose} title="Copy a Top Wallet" width={520}>
      <div className="flex flex-col gap-[10px] p-[14px]">
        <div className="flex h-[32px] items-center gap-[8px] rounded-full border border-primaryStroke px-[12px]">
          <i className="ri-search-line text-[14px] text-textTertiary" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search 0x address…"
            className="min-w-0 flex-1 bg-transparent text-[13px] text-textPrimary outline-none placeholder:text-textTertiary"
          />
        </div>
        <div className="max-h-[340px] overflow-y-auto">
          {rows.map((r) => {
            const has = existing.includes(r.address);
            return (
              <button
                key={r.address}
                type="button"
                onClick={() => {
                  addWallet(r.address, r.name ?? undefined);
                  addCopy({
                    wallet: r.address,
                    label: r.name ?? undefined,
                    enabled: true,
                    sizing: "proportional",
                    fixedUsd: 500,
                    propPct: 10,
                    maxLev: 5,
                    longOnly: false,
                  });
                  toast(`Now copy trading ${r.name ?? shortAddr(r.address)}`, "success");
                  onClose();
                }}
                className="flex w-full items-center gap-[9px] rounded-[8px] px-[10px] py-[8px] text-left hover:bg-primaryStroke/30"
              >
                <WalletAvatar address={r.address} size={26} rounded="rounded-[7px]" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-[13px] text-textPrimary">{r.name || shortAddr(r.address)}</span>
                  <span className="font-GeistMono text-[10px] text-textTertiary">{shortAddr(r.address)}</span>
                </span>
                <span className="font-GeistMono text-[12px] text-textSecondary">{fmtUsdCompact(r.av)}</span>
                <span className="w-[70px] text-right font-GeistMono text-[12px] text-increase">
                  {fmtUsdCompact(r.pnl, true)}
                </span>
                {has ? (
                  <span className="rounded-full bg-increase/15 px-[7px] text-[10px] font-bold uppercase text-increase">
                    copying
                  </span>
                ) : null}
              </button>
            );
          })}
          {!rows.length ? (
            <div className="flex h-[80px] items-center justify-center text-[12px] text-textTertiary">
              Loading top wallets…
            </div>
          ) : null}
        </div>
      </div>
    </TrackerModal>
  );
}
