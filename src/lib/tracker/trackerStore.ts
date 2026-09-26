"use client";
/**
 * Tracker client store — tracked wallets, alert rules + log, copy-trade
 * configs + mirrored paper trades, and whale-feed preferences.
 * Persisted to localStorage (key: hyzr-tracker).
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface TrackedWallet {
  address: string;
  label?: string;
  addedAt: number;
}

export type AlertKind = "whale_trade" | "wallet_trade" | "wallet_close" | "coin_positioning";

export interface AlertRule {
  id: string;
  name: string;
  enabled: boolean;
  kind: AlertKind;
  /** whale_trade: usd >= minUsd */
  minUsd?: number;
  /** whale_trade: coin filter (empty = any) */
  coins?: string[];
  /** whale_trade: buy / sell / both */
  side?: "buy" | "sell" | "both";
  /** whale_trade / wallet_trade: open / close / both */
  action?: "open" | "close" | "both";
  /** wallet_trade / wallet_close: 'tracked' | specific address */
  wallet?: string;
  /** wallet_close: alert when |realized pnl| >= minPnl */
  minPnl?: number;
  /** coin_positioning: coin + long-share threshold pct */
  positioningCoin?: string;
  positioningPct?: number;
  positioningAbove?: boolean;
}

export interface AlertEntry {
  id: string;
  t: number;
  ruleId: string;
  ruleName: string;
  text: string;
  sub?: string;
  tone: "long" | "short" | "neutral";
  read: boolean;
}

export interface CopyConfig {
  id: string;
  wallet: string;
  label?: string;
  enabled: boolean;
  sizing: "fixed" | "proportional";
  fixedUsd: number;
  propPct: number; // % of our equity per copy
  maxLev: number;
  longOnly: boolean;
  createdAt: number;
}

export interface CopiedTrade {
  id: string;
  wallet: string;
  coin: string;
  isBuy: boolean;
  px: number;
  sz: number;
  usd: number;
  t: number;
  status: "filled" | "failed" | "closed";
  detail?: string;
  closePnl?: number;
}

export interface FeedPrefs {
  minUsd: number;
  coins: string[]; // empty = all
  types: ("open" | "close")[];
  k: ("whale" | "tracked")[];
  sound: boolean;
}

interface TrackerState {
  wallets: TrackedWallet[];
  rules: AlertRule[];
  alertLog: AlertEntry[];
  unread: number;
  copies: CopyConfig[];
  copied: CopiedTrade[];
  feed: FeedPrefs;
  watchAck: number; // bumped whenever wallets change -> triggers server sync

  addWallet: (address: string, label?: string) => boolean;
  removeWallet: (address: string) => void;
  removeAllWallets: () => void;
  importWallets: (list: { address: string; label?: string }[]) => number;

  addRule: (r: Omit<AlertRule, "id">) => void;
  updateRule: (id: string, patch: Partial<AlertRule>) => void;
  removeRule: (id: string) => void;
  pushAlert: (a: Omit<AlertEntry, "id" | "read">) => void;
  markAllRead: () => void;
  clearAlerts: () => void;

  addCopy: (c: Omit<CopyConfig, "id" | "createdAt">) => void;
  updateCopy: (id: string, patch: Partial<CopyConfig>) => void;
  removeCopy: (id: string) => void;
  recordCopy: (t: Omit<CopiedTrade, "id">) => void;
  updateCopied: (id: string, patch: Partial<CopiedTrade>) => void;

  setFeed: (p: Partial<FeedPrefs>) => void;
}

const uid = () => Math.random().toString(36).slice(2, 10);

export const DEFAULT_RULE: Omit<AlertRule, "id"> = {
  name: "Whales > $1M",
  enabled: true,
  kind: "whale_trade",
  minUsd: 1_000_000,
  coins: [],
  side: "both",
  action: "both",
};

export const useTrackerStore = create<TrackerState>()(
  persist(
    (set, get) => ({
      wallets: [],
      rules: [
        { id: "r-whale-1m", name: "Whales > $1M", enabled: true, kind: "whale_trade", minUsd: 1_000_000, coins: [], side: "both", action: "both" },
        { id: "r-whale-250k", name: "Whales > $250K", enabled: false, kind: "whale_trade", minUsd: 250_000, coins: [], side: "both", action: "both" },
        { id: "r-close-big", name: "Tracked big close (>$50K PnL)", enabled: true, kind: "wallet_close", wallet: "tracked", minPnl: 50_000 },
      ],
      alertLog: [],
      unread: 0,
      copies: [],
      copied: [],
      feed: { minUsd: 50_000, coins: [], types: ["open", "close"], k: ["whale", "tracked"], sound: false },
      watchAck: 0,

      addWallet: (address, label) => {
        const a = address.trim().toLowerCase();
        if (!/^0x[a-f0-9]{40}$/.test(a)) return false;
        if (get().wallets.some((w) => w.address === a)) return false;
        set((s) => ({
          wallets: [{ address: a, label, addedAt: Date.now() }, ...s.wallets],
          watchAck: s.watchAck + 1,
        }));
        return true;
      },
      removeWallet: (address) =>
        set((s) => ({
          wallets: s.wallets.filter((w) => w.address !== address),
          copies: s.copies.filter((c) => c.wallet !== address),
          watchAck: s.watchAck + 1,
        })),
      removeAllWallets: () => set({ wallets: [], copies: [], watchAck: Date.now() }),
      importWallets: (list) => {
        let added = 0;
        set((s) => {
          const have = new Set(s.wallets.map((w) => w.address));
          const fresh: TrackedWallet[] = [];
          for (const item of list) {
            const a = item.address?.trim().toLowerCase();
            if (a && /^0x[a-f0-9]{40}$/.test(a) && !have.has(a)) {
              have.add(a);
              fresh.push({ address: a, label: item.label, addedAt: Date.now() });
              added++;
            }
          }
          return { wallets: [...fresh, ...s.wallets], watchAck: s.watchAck + 1 };
        });
        return added;
      },

      addRule: (r) => set((s) => ({ rules: [{ ...r, id: uid() }, ...s.rules] })),
      updateRule: (id, patch) =>
        set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)) })),
      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      pushAlert: (a) =>
        set((s) => ({
          alertLog: [{ ...a, id: uid(), read: false }, ...s.alertLog].slice(0, 300),
          unread: s.unread + 1,
        })),
      markAllRead: () => set((s) => ({ unread: 0, alertLog: s.alertLog.map((a) => ({ ...a, read: true })) })),
      clearAlerts: () => set({ alertLog: [], unread: 0 }),

      addCopy: (c) =>
        set((s) => {
          if (s.copies.some((x) => x.wallet === c.wallet)) return s;
          return { copies: [{ ...c, id: uid(), createdAt: Date.now() }, ...s.copies] };
        }),
      updateCopy: (id, patch) =>
        set((s) => ({ copies: s.copies.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),
      removeCopy: (id) => set((s) => ({ copies: s.copies.filter((c) => c.id !== id) })),
      recordCopy: (t) => set((s) => ({ copied: [{ ...t, id: uid() }, ...s.copied].slice(0, 400) })),
      updateCopied: (id, patch) =>
        set((s) => ({ copied: s.copied.map((c) => (c.id === id ? { ...c, ...patch } : c)) })),

      setFeed: (p) => set((s) => ({ feed: { ...s.feed, ...p } })),
    }),
    {
      name: "hyzr-tracker",
      version: 1,
      // rehydrated manually after mount (Providers) — prevents hydration mismatch
      skipHydration: true,
      partialize: (s) => ({
        wallets: s.wallets,
        rules: s.rules,
        alertLog: s.alertLog.slice(0, 100),
        unread: s.unread,
        copies: s.copies,
        copied: s.copied.slice(0, 150),
        feed: s.feed,
      }),
    },
  ),
);

/** short display form of a wallet address (0x85…2052) */
export function shortAddr(a: string) {
  if (!a || a.length < 12) return a;
  return `${a.slice(0, 4)}…${a.slice(-4)}`;
}

/** deterministic hue pair from an address — wallet avatar gradients */
export function addrHues(a: string): [number, number] {
  let h = 0;
  for (let i = 2; i < a.length; i++) h = (h * 31 + a.charCodeAt(i)) >>> 0;
  return [h % 360, (h >>> 8) % 360];
}
