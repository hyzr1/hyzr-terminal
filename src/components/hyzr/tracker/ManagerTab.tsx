"use client";
/**
 * Manager tab — the user's tracked Hyperliquid wallets.
 * Add / import / export / remove, live balance + 24h PnL + activity
 * (real clearinghouseState + userFills via the server tracker engine).
 */
import { useMemo, useState } from "react";
import { useTrackerStore } from "@/lib/tracker/trackerStore";
import { toast } from "@/lib/hyperliquid/tradeStore";
import { useFeedStore } from "@/lib/tracker/useTrackerStream";
import {
  WalletAvatar,
  WalletLabel,
  PillAction,
  Th,
  TrackerModal,
  pnlClass,
  fmtUsdCompact,
  ageStr,
} from "./bits";

export default function ManagerTab({
  onOpenWallet,
  onQuickAdd,
}: {
  onOpenWallet: (addr: string) => void;
  onQuickAdd: () => void;
}) {
  const wallets = useTrackerStore((s) => s.wallets);
  const addWallet = useTrackerStore((s) => s.addWallet);
  const removeWallet = useTrackerStore((s) => s.removeWallet);
  const removeAllWallets = useTrackerStore((s) => s.removeAllWallets);
  const importWallets = useTrackerStore((s) => s.importWallets);
  const addCopy = useTrackerStore((s) => s.addCopy);
  const tracked = useFeedStore((s) => s.tracked);
  const [query, setQuery] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [addrInput, setAddrInput] = useState("");
  const [importText, setImportText] = useState("");
  const [sortKey, setSortKey] = useState("created");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const enriched = useMemo(() => {
    const map = new Map(tracked.map((t) => [t.address, t]));
    return wallets.map((w) => ({
      ...w,
      row: map.get(w.address) ?? null,
    }));
  }, [wallets, tracked]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? enriched.filter(
          (w) => w.address.includes(q) || (w.label ?? "").toLowerCase().includes(q),
        )
      : enriched;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case "name":
          return (a.label ?? a.address).localeCompare(b.label ?? b.address) * dir;
        case "balance":
          return ((a.row?.av ?? 0) - (b.row?.av ?? 0)) * dir;
        case "pnl":
          return ((a.row?.pnl24h ?? 0) - (b.row?.pnl24h ?? 0)) * dir;
        case "active":
          return ((a.row?.lastActive ?? 0) - (b.row?.lastActive ?? 0)) * dir;
        default:
          return (a.addedAt - b.addedAt) * dir;
      }
    });
  }, [enriched, query, sortKey, sortDir]);

  const onSort = (k: string) => {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };

  const doImport = () => {
    const list: { address: string; label?: string }[] = [];
    for (const line of importText.split(/[\n,]/)) {
      const t = line.trim();
      if (!t) continue;
      try {
        const j = JSON.parse(t);
        if (Array.isArray(j)) {
          for (const item of j) list.push({ address: item.address ?? item, label: item.label });
          continue;
        }
        if (j.address) {
          list.push({ address: j.address, label: j.label });
          continue;
        }
      } catch {
        /* plain address */
      }
      list.push({ address: t });
    }
    const n = importWallets(list);
    setImportOpen(false);
    setImportText("");
    toast(`${n} wallet${n === 1 ? "" : "s"} imported`, "success");
  };

  const doExport = () => {
    const blob = new Blob([JSON.stringify(wallets.map((w) => ({ address: w.address, label: w.label })), null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "hyzr-tracked-wallets.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* toolbar — matches the real page chrome (search + Import/Export/Add) */}
      <div className="flex min-h-[52px] shrink-0 flex-row flex-wrap items-center gap-[8px] border-b border-primaryStroke px-[10px] py-[6px] sm:h-[52px] sm:flex-nowrap sm:px-[16px] sm:py-0">
        <div className="flex h-[32px] min-w-0 flex-1 items-center gap-[8px] rounded-full border border-primaryStroke px-[12px] transition-colors hover:bg-primaryStroke/35 sm:max-w-[280px] sm:flex-none">
          <i className="ri-search-line text-[14px] text-textTertiary" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or addr..."
            className="min-w-0 flex-1 bg-transparent text-[13px] font-medium text-textPrimary outline-none placeholder:text-textTertiary"
          />
        </div>
        <div className="ml-auto flex items-center gap-[8px]">
          <PillAction label="Import" icon="ri-upload-2-line" onClick={() => setImportOpen(true)} className="hidden sm:flex" />
          <PillAction label="Export" icon="ri-download-2-line" onClick={doExport} className="hidden sm:flex" />
          <PillAction label="Add Wallet" icon="ri-add-line" kind="blue" onClick={() => setAddOpen(true)} />
        </div>
      </div>

      {/* table */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-[1] flex h-[30px] items-center gap-[8px] border-b border-primaryStroke bg-background px-[10px] sm:px-[16px]">
          <Th sortKey="created" activeSort={sortKey} sortDir={sortDir} onSort={onSort} className="hidden w-[92px] lg:flex">
            Created
          </Th>
          <Th sortKey="name" activeSort={sortKey} sortDir={sortDir} onSort={onSort} className="min-w-[120px] flex-1">
            Name
          </Th>
          <Th sortKey="balance" activeSort={sortKey} sortDir={sortDir} onSort={onSort} className="w-[90px] sm:w-[110px]">
            Balance
          </Th>
          <Th sortKey="pnl" activeSort={sortKey} sortDir={sortDir} onSort={onSort} className="w-[90px] sm:w-[110px]">
            24h PnL
          </Th>
          <Th className="hidden w-[84px] md:flex">Positions</Th>
          <Th sortKey="active" activeSort={sortKey} sortDir={sortDir} onSort={onSort} className="hidden w-[92px] sm:flex">
            Last Active
          </Th>
          <div className="flex w-[64px] flex-row items-center justify-end gap-[2px] sm:w-[150px]">
            <button
              type="button"
              onClick={() => {
                if (wallets.length && confirm("Remove all tracked wallets?")) removeAllWallets();
              }}
              className="hidden rounded px-[8px] py-[4px] text-[12px] font-medium text-decreaseHover transition-all hover:text-decreaseHover/80 sm:block"
            >
              Remove All
            </button>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="flex h-[280px] flex-col items-center justify-center gap-[12px]">
            <div className="flex h-[52px] w-[52px] items-center justify-center rounded-[14px] bg-primaryStroke/40">
              <i className="ri-radar-line text-[26px] text-textTertiary" />
            </div>
            <span className="text-[13px] text-textTertiary">No wallets added yet.</span>
            <div className="flex gap-[8px]">
              <PillAction label="Add Wallet" icon="ri-add-line" kind="blue" onClick={() => setAddOpen(true)} />
              <PillAction label="Top Whales" icon="ri-vip-crown-line" onClick={onQuickAdd} />
            </div>
          </div>
        ) : (
          rows.map((w) => (
            <div
              key={w.address}
              className="group flex h-[44px] cursor-pointer items-center gap-[8px] border-b border-primaryStroke/40 px-[10px] transition-colors hover:bg-primaryStroke/25 sm:px-[16px]"
              onClick={() => onOpenWallet(w.address)}
            >
              <div className="hidden w-[92px] text-[12px] text-textTertiary lg:block">{ageStr(w.addedAt)} ago</div>
              <div className="flex min-w-0 flex-1 items-center gap-[10px]">
                <WalletAvatar address={w.address} size={28} />
                <div className="flex min-w-0 flex-col">
                  <WalletLabel address={w.address} name={w.label ?? w.row?.name} />
                  {w.row ? (
                    <span className="hidden text-[11px] text-textTertiary sm:block">
                      {w.row.fills24h} trades · {w.row.positions} open positions
                    </span>
                  ) : (
                    <span className="hidden text-[11px] text-textTertiary/70 sm:block">syncing…</span>
                  )}
                </div>
              </div>
              <div className="w-[90px] font-GeistMono text-[12px] text-textPrimary sm:w-[110px]">
                {w.row?.av ? fmtUsdCompact(w.row.av) : "—"}
              </div>
              <div className={`w-[90px] font-GeistMono text-[12px] sm:w-[110px] ${pnlClass(w.row?.pnl24h ?? null)}`}>
                {w.row ? fmtUsdCompact(w.row.pnl24h, true) : "—"}
              </div>
              <div className="hidden w-[84px] font-GeistMono text-[12px] text-textSecondary md:block">
                {w.row ? w.row.positions : "—"}
              </div>
              <div className="hidden w-[92px] text-[12px] text-textTertiary sm:block">
                {w.row?.lastActive ? ageStr(w.row.lastActive) : "—"}
              </div>
              <div className="flex w-[64px] items-center justify-end gap-[4px] sm:w-[150px]">
                <button
                  type="button"
                  title="Copy trade this wallet"
                  onClick={(e) => {
                    e.stopPropagation();
                    addCopy({
                      wallet: w.address,
                      label: w.label ?? w.row?.name ?? undefined,
                      enabled: true,
                      sizing: "proportional",
                      fixedUsd: 500,
                      propPct: 10,
                      maxLev: 5,
                      longOnly: false,
                    });
                    document.dispatchEvent(new CustomEvent("tracker-goto-copy"));
                  }}
                  className="flex h-[26px] items-center justify-center gap-[4px] rounded-full bg-primaryStroke px-[8px] text-[12px] font-medium text-textSecondary hover:bg-secondaryStroke sm:px-[10px]"
                >
                  <i className="ri-magic-line text-[13px]" />
                  <span className="hidden sm:inline">Copy</span>
                </button>
                <button
                  type="button"
                  title="Remove"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeWallet(w.address);
                  }}
                  className="flex h-[26px] w-[26px] items-center justify-center rounded-full text-textTertiary hover:bg-decrease/15 hover:text-decrease"
                >
                  <i className="ri-close-line text-[14px]" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Wallet modal */}
      <TrackerModal open={addOpen} onClose={() => setAddOpen(false)} title="Add Wallet" width={460}>
        <div className="flex flex-col gap-[12px] p-[16px]">
          <input
            value={addrInput}
            onChange={(e) => setAddrInput(e.target.value)}
            placeholder="0x… Hyperliquid wallet address"
            className="h-[38px] w-full rounded-[8px] border border-primaryStroke bg-background px-[12px] font-GeistMono text-[13px] text-textPrimary outline-none placeholder:font-sans placeholder:text-textTertiary focus:border-primaryBlue"
          />
          <div className="flex items-center justify-between">
            <button
              type="button"
              className="text-[12px] text-primaryBlue hover:underline"
              onClick={onQuickAdd}
            >
              Or pick from the top whales →
            </button>
            <PillAction
              label="Track Wallet"
              kind="blue"
              icon="ri-eye-plus-line"
              onClick={() => {
                if (addWallet(addrInput)) {
                  setAddrInput("");
                  setAddOpen(false);
                }
              }}
            />
          </div>
        </div>
      </TrackerModal>

      {/* Import modal */}
      <TrackerModal open={importOpen} onClose={() => setImportOpen(false)} title="Import Wallets" width={520}>
        <div className="flex flex-col gap-[10px] p-[16px]">
          <span className="text-[12px] text-textTertiary">
            One address per line — or paste a JSON array / exported file contents.
          </span>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            rows={7}
            placeholder={"0x1234…\n0xabcd…"}
            className="w-full rounded-[8px] border border-primaryStroke bg-background p-[10px] font-GeistMono text-[12px] text-textPrimary outline-none placeholder:font-sans placeholder:text-textTertiary focus:border-primaryBlue"
          />
          <div className="flex justify-end">
            <PillAction label="Import" kind="blue" icon="ri-upload-2-line" onClick={doImport} />
          </div>
        </div>
      </TrackerModal>
    </div>
  );
}
