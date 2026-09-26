"use client";

/**
 * Global client providers mounted once in the root layout so state
 * (live WS/SSE connections, UI context) survives client-side navigation
 * between the per-page URLs (/, /perpetuals, /trackers, /portfolio).
 *
 * Also owns persisted-store rehydration: zustand `persist` uses
 * skipHydration so the server HTML and the client's first render match
 * (no React hydration mismatches), then we rehydrate after mount.
 */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { HyzrUIProvider, pathForPage } from "./ui/HyzrUI";
import { LiveProvider } from "./live/LiveProvider";
import { FilterPanel } from "./menus/FilterPanel";
import { HyzrModals } from "./ui/Modals";
import { useTradeStore, switchTradeAccount } from "@/lib/hyperliquid/tradeStore";
import { useTrackerStore } from "@/lib/tracker/trackerStore";
import { useProfileStore } from "@/lib/profileStore";
import { useWalletStore } from "@/lib/walletStore";
import { applyStoredAccent } from "./FooterBar";
import { fetchWalletBalance } from "@/lib/walletBalances";
import { evmProviderFor } from "@/lib/walletProviders";

export default function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const wallets = useWalletStore((s) => s.wallets);
  const activeAddress = useWalletStore((s) => s.activeAddress);

  useEffect(() => {
    // after mount is safe: first client render already matched the server
    applyStoredAccent(); // persisted accent picker choice -> --primary-color
    let cancelled = false;
    (async () => {
      try {
        await Promise.all([
          useTradeStore.persist.rehydrate(),
          useTrackerStore.persist.rehydrate(),
          useProfileStore.persist.rehydrate(),
          useWalletStore.persist.rehydrate(),
        ]);
      } catch {
        /* private mode / storage disabled — defaults are fine */
      }
      if (cancelled) return;
      // route the terminal onto the active wallet's trading account (fx24)
      switchTradeAccount(useWalletStore.getState().activeAddress);
    })();
    // later connect/disconnect/switch → swap accounts live
    const unsub = useWalletStore.subscribe((s, prev) => {
      if (s.activeAddress !== prev.activeAddress) {
        switchTradeAccount(s.activeAddress);
      }
    });
    // prefetch every platform route right after the first paint so tab
    // switches are instant (all routes share this provider tree)
    const pages = ["discover", "perpetuals", "trackers", "portfolio", "rewards"] as const;
    const t = setTimeout(() => {
      for (const p of pages) {
        try {
          router.prefetch(pathForPage(p));
        } catch {
          /* prefetch is best-effort */
        }
      }
    }, 400);
    return () => {
      cancelled = true;
      unsub();
      clearTimeout(t);
    };
  }, [router]);

  /* live on-chain balances for every paired wallet (fx24) */
  useEffect(() => {
    if (wallets.length === 0 || typeof window === "undefined") return;
    let alive = true;
    const refresh = async () => {
      const list = useWalletStore.getState().wallets;
      await Promise.all(
        list.map(async (w) => {
          useWalletStore.getState().setBalance(w.address, { loading: true });
          const bal = await fetchWalletBalance(w.kind, w.address, { evm: evmProviderFor(w.kind) });
          if (!alive) return;
          useWalletStore
            .getState()
            .setBalance(w.address, { ...bal, loading: false, fetchedAt: Date.now() });
        }),
      );
    };
    void refresh();
    const id = setInterval(() => void refresh(), 30_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [wallets, activeAddress]);

  return (
    <LiveProvider>
      <HyzrUIProvider>
        {children}
        {/* floating layers (portal into body themselves) */}
        <FilterPanel />
        <HyzrModals />
      </HyzrUIProvider>
    </LiveProvider>
  );
}
