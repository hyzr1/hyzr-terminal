"use client";
/**
 * TrackerPage — the flagship Hyperliquid tracker.
 * Layout chrome follows the real Trackers page (icon strip, wallet pill +
 * tab pills, main column + collapsible right rail), but the product is
 * ours: a full whale-money terminal — Manager, Whale Flow, Smart Money,
 * Copy Trading — with a live alert engine.
 */
import { useEffect, useState } from "react";
import { PillTab, IconBtn, WalletAvatar, TrackerModal, PillAction, fmtUsdCompact } from "./bits";
import ManagerTab from "./ManagerTab";
import WhaleFlowTab from "./WhaleFlowTab";
import SmartMoneyTab from "./SmartMoneyTab";
import CopyTradeTab from "./CopyTradeTab";
import TrackerSidebar from "./TrackerSidebar";
import WalletProfile from "./WalletProfile";
import { useTrackerStream, useFeedStore } from "@/lib/tracker/useTrackerStream";
import { useTrackerStore } from "@/lib/tracker/trackerStore";
import { toast } from "@/lib/hyperliquid/tradeStore";

type Tab = "manager" | "whales" | "smart" | "copy";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "manager", label: "Manager", icon: "ri-wallet-3-line" },
  { id: "whales", label: "Whale Flow", icon: "ri-water-flash-line" },
  { id: "smart", label: "Smart Money", icon: "ri-brain-line" },
  { id: "copy", label: "Copy Trading", icon: "ri-magic-line" },
];

export default function TrackerPage() {
  useTrackerStream(); // activates SSE feed + alerts + copy engine + tracked sync
  const [tab, setTab] = useState<Tab>("whales");
  const [profile, setProfile] = useState<string | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [railOpen, setRailOpen] = useState(false); // mobile drawer
  const [quickAdd, setQuickAdd] = useState(false);
  const unread = useTrackerStore((s) => s.unread);
  const addWallet = useTrackerStore((s) => s.addWallet);
  const copies = useTrackerStore((s) => s.copies);
  const wallets = useTrackerStore((s) => s.wallets);
  const connected = useFeedStore((s) => s.connected);

  // Manager tab can deep-link into Copy Trading
  useEffect(() => {
    const go = () => setTab("copy");
    document.addEventListener("tracker-goto-copy", go);
    return () => document.removeEventListener("tracker-goto-copy", go);
  }, []);

  const openProfile = (addr: string) => {
    setProfile(addr);
    setRailOpen(false); // close the mobile drawer underneath
  };

  return (
    <div className="flex h-full min-h-0 w-full">
      {/* ------------------------- main column ------------------------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        {/* icon strip (page-level actions, like the real top-left icons) */}
        <div className="flex h-[34px] shrink-0 items-center gap-[2px] border-b border-primaryStroke/60 px-[8px]">
          <IconBtn
            icon="ri-settings-3-line"
            title="Tracker settings"
            onClick={() => {
              setSidebarCollapsed(false);
              setRailOpen(true);
              document.dispatchEvent(new CustomEvent("tracker-open-customize"));
            }}
          />
          <IconBtn
            icon="ri-star-line"
            title="Quick-add top whales"
            onClick={() => setQuickAdd(true)}
          />
          <span className="flex-1" />
          <span
            className={`flex items-center gap-[5px] rounded-full px-[8px] text-[10px] font-medium ${
              connected ? "bg-increase/10 text-increase" : "bg-decrease/10 text-decrease"
            }`}
            title={connected ? "Live whale scanner connected" : "Reconnecting to the scanner…"}
          >
            <span className={`h-[5px] w-[5px] rounded-full ${connected ? "animate-pulse bg-increase" : "bg-decrease"}`} />
            {connected ? "LIVE FEED" : "OFFLINE"}
          </span>
        </div>

        {/* wallet pill + tabs */}
        <div className="flex h-[42px] shrink-0 items-center gap-[10px] border-b border-primaryStroke/60 px-[10px]">
          <div className="flex h-[26px] shrink-0 items-center gap-[6px] rounded-[6px] border border-primaryStroke bg-primaryStroke/40 px-[8px]">
            <img
              src="/hl-logo.svg"
              alt="HL"
              className="h-[14px] w-[14px]"
            />
            <span className="text-[12px] font-semibold tracking-[-0.01rem] text-textPrimary">Hyperliquid</span>
          </div>
          <div className="no-scrollbar flex flex-row items-center gap-[8px] overflow-x-auto">
            {TABS.map((t) => (
              <PillTab
                key={t.id}
                label={t.label}
                icon={t.icon}
                active={tab === t.id}
                onClick={() => setTab(t.id)}
              />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-[4px] pr-[2px]">
            <span className="mr-[4px] hidden text-[11px] text-textTertiary sm:block">
              {wallets.length} tracked · {copies.filter((c) => c.enabled).length} copying
            </span>
            <IconBtn
              icon="ri-notification-3-line"
              title="Alerts"
              badge={unread}
              onClick={() => {
                setSidebarCollapsed(false);
                setRailOpen(true);
                document.dispatchEvent(new CustomEvent("tracker-open-alerts"));
              }}
            />
            <IconBtn
              icon="ri-equalizer-3-line"
              title="Feed settings"
              onClick={() => {
                setSidebarCollapsed(false);
                setRailOpen(true);
                document.dispatchEvent(new CustomEvent("tracker-open-customize"));
              }}
            />
          </div>
        </div>

        {/* tab content */}
        {tab === "manager" ? (
          <ManagerTab onOpenWallet={openProfile} onQuickAdd={() => setQuickAdd(true)} />
        ) : tab === "whales" ? (
          <WhaleFlowTab onOpenWallet={openProfile} />
        ) : tab === "smart" ? (
          <SmartMoneyTab onOpenWallet={openProfile} />
        ) : (
          <CopyTradeTab />
        )}
      </div>

      {/* ------------------------- right rail ------------------------- */}
      {/* one persistent instance: inline rail ≥lg · slide-in drawer <lg */}
      {railOpen ? (
        <div className="fixed inset-0 z-[129] bg-black/60 backdrop-blur-[1px] lg:hidden" onClick={() => setRailOpen(false)} />
      ) : null}
      <div
        className={
          railOpen
            ? "fixed inset-y-0 right-0 z-[130] flex w-[90vw] max-w-[380px] flex-col bg-background shadow-[-24px_0_64px_rgba(0,0,0,0.55)] lg:static lg:z-auto lg:w-auto lg:max-w-none lg:bg-transparent lg:shadow-none"
            : "hidden min-h-0 lg:flex"
        }
      >
        <SidebarWithEvents collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed((c) => !c)} onOpenWallet={openProfile} />
      </div>

      {/* wallet analysis */}
      <WalletProfile
        key={profile ?? "profile-closed"}
        address={profile}
        onClose={() => setProfile(null)}
        onOpenCopier={() => {
          setProfile(null);
          setTab("copy");
        }}
      />

      {/* quick add top whales */}
      <QuickAddWhales open={quickAdd} onClose={() => setQuickAdd(false)} onAdd={(addr, name) => {
        if (addWallet(addr, name)) toast(`Tracking ${name ?? addr.slice(0, 8)}`, "success");
      }} />
    </div>
  );
}

/* sidebar reacts to tracker-open-alerts / tracker-open-customize internally */
function SidebarWithEvents({
  collapsed,
  onToggle,
  onOpenWallet,
}: {
  collapsed: boolean;
  onToggle: () => void;
  onOpenWallet: (addr: string) => void;
}) {
  return <TrackerSidebar collapsed={collapsed} onToggle={onToggle} onOpenWallet={onOpenWallet} />;
}

/* one-click add of the best current wallets */
function QuickAddWhales({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (addr: string, name?: string) => void;
}) {
  const [rows, setRows] = useState<{ address: string; name: string | null; pnl: number; av: number; roi: number }[]>([]);
  const wallets = useTrackerStore((s) => s.wallets);
  const tracked = new Set(wallets.map((w) => w.address));

  useEffect(() => {
    if (!open) return;
    fetch("/api/tracker/leaderboard?window=day&sort=pnl&limit=14&offset=0")
      .then((r) => r.json())
      .then((j) => setRows(j.rows ?? []))
      .catch(() => {});
  }, [open]);

  return (
    <TrackerModal open={open} onClose={onClose} title="Top Whales Right Now (24h PnL)" width={560}>
      <div className="flex flex-col">
        <div className="max-h-[420px] overflow-y-auto p-[8px]">
          {rows.map((r) => (
            <div key={r.address} className="flex items-center gap-[10px] rounded-[8px] px-[10px] py-[8px] hover:bg-primaryStroke/25">
              <WalletAvatar address={r.address} size={28} rounded="rounded-[7px]" />
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-[13px] font-medium text-textPrimary">
                  {r.name || `${r.address.slice(0, 8)}…${r.address.slice(-6)}`}
                </span>
                <span className="font-GeistMono text-[10px] text-textTertiary">
                  {r.address.slice(0, 10)}…{r.address.slice(-8)}
                </span>
              </div>
              <span className="font-GeistMono text-[12px] text-textSecondary">{fmtUsdCompact(r.av)}</span>
              <span className="w-[74px] text-right font-GeistMono text-[13px] font-medium text-increase">
                {fmtUsdCompact(r.pnl, true)}
              </span>
              <PillAction
                label={tracked.has(r.address) ? "Added" : "Track"}
                kind={tracked.has(r.address) ? "ghost" : "blue"}
                onClick={() => !tracked.has(r.address) && onAdd(r.address, r.name ?? undefined)}
              />
            </div>
          ))}
          {!rows.length ? (
            <div className="flex h-[140px] items-center justify-center">
              <div className="h-[24px] w-[24px] animate-spin rounded-full border-[2px] border-primaryStroke border-t-primaryBlue" />
            </div>
          ) : null}
        </div>
      </div>
    </TrackerModal>
  );
}
