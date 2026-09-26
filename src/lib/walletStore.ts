import { create } from "zustand";
import { persist } from "zustand/middleware";

export type WalletKind = "Phantom" | "Solflare" | "MetaMask" | "Coinbase";

export type ConnectedWallet = {
  kind: WalletKind;
  address: string;
  verified: boolean;
  connectedAt: number;
};

export type WalletBalance = {
  native: string | null; // "4.21" — formatted, null = unavailable
  usdc: string | null;
  symbol: string; // SOL / ETH / …
  loading: boolean;
  fetchedAt: number;
};

type WalletState = {
  /** every paired wallet — the user can hold several and switch the active one */
  wallets: ConnectedWallet[];
  /** the wallet whose trading account is live in the terminal */
  activeAddress: string | null;
  connecting: WalletKind | null;
  balances: Record<string, WalletBalance>;

  setConnecting: (kind: WalletKind | null) => void;
  /** adds (or re-adds) a wallet and makes it the active trading account */
  connect: (kind: WalletKind, address: string) => void;
  /** removes the wallet entirely; if it was active the next one becomes active */
  disconnect: (address: string | null) => void;
  setActive: (address: string | null) => void;
  markVerified: (address: string) => void;
  setBalance: (address: string, patch: Partial<WalletBalance>) => void;
};

export function shortAddr(a: string | null | undefined, size = 4): string {
  if (!a) return "";
  return a.length <= size * 2 + 3 ? a : `${a.slice(0, size + 2)}…${a.slice(-size)}`;
}

export function activeWallet(s: { wallets: ConnectedWallet[]; activeAddress: string | null }): ConnectedWallet | null {
  return s.wallets.find((w) => w.address === s.activeAddress) ?? null;
}

export const useWalletStore = create<WalletState>()(
  persist(
    (set) => ({
      wallets: [],
      activeAddress: null,
      connecting: null,
      balances: {},

      setConnecting: (connecting) => set({ connecting }),

      connect: (kind, address) =>
        set((s) => {
          const existing = s.wallets.find((w) => w.address.toLowerCase() === address.toLowerCase());
          const wallets = existing
            ? s.wallets.map((w) =>
                w.address.toLowerCase() === address.toLowerCase()
                  ? { ...w, kind, connectedAt: Date.now() }
                  : w,
              )
            : [...s.wallets, { kind, address, verified: false, connectedAt: Date.now() }];
          // re-connecting normalizes case to the stored one
          const canonical = existing?.address ?? address;
          return { wallets, activeAddress: canonical, connecting: null };
        }),

      disconnect: (address) =>
        set((s) => {
          if (!address) return {};
          const wallets = s.wallets.filter((w) => w.address.toLowerCase() !== address.toLowerCase());
          const balances = { ...s.balances };
          delete balances[address];
          const activeAddress =
            s.activeAddress?.toLowerCase() === address.toLowerCase()
              ? (wallets[wallets.length - 1]?.address ?? null)
              : s.activeAddress;
          return { wallets, balances, activeAddress };
        }),

      setActive: (address) =>
        set((s) => ({
          activeAddress: s.wallets.some((w) => w.address === address) ? address : null,
        })),

      markVerified: (address) =>
        set((s) => ({
          wallets: s.wallets.map((w) =>
            w.address.toLowerCase() === address.toLowerCase() ? { ...w, verified: true } : w,
          ),
        })),

      setBalance: (address, patch) =>
        set((s) => {
          const prev =
            s.balances[address] ??
            ({ native: null, usdc: null, symbol: "", loading: false, fetchedAt: 0 } as WalletBalance);
          return { balances: { ...s.balances, [address]: { ...prev, ...patch } } };
        }),
    }),
    {
      name: "hyzr-wallet",
      version: 2,
      // rehydrated manually after mount (Providers) — prevents hydration mismatch
      skipHydration: true,
      partialize: (s) => ({ wallets: s.wallets, activeAddress: s.activeAddress }),
      migrate: (persisted: unknown, version: number) => {
        // v1 shape: { kind, address } single wallet → promote to the list model
        if (version < 2 && persisted && typeof persisted === "object") {
          const old = persisted as { kind?: WalletKind; address?: string | null };
          if (old.address) {
            return {
              wallets: [{ kind: old.kind ?? "Phantom", address: old.address, verified: false, connectedAt: Date.now() }],
              activeAddress: old.address,
            };
          }
        }
        return persisted as { wallets: ConnectedWallet[]; activeAddress: string | null };
      },
    },
  ),
);
