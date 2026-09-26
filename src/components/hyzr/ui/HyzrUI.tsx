"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";

export type ChainId = "SOL" | "HOOD" | "BNB" | "ETH";
export type Region = "GLOBAL" | "US" | "EU" | "ASIA";
export type QuickBuyValue = "20%" | "0.001" | "0.01" | "on";
/** main discover tab */
export type DiscoverTab = "top" | "trending" | "surge";
/** top-level platform page (nav tabs) — each maps to a real URL so a
 *  refresh (or a shared link) always lands back on the same page */
export type PlatformPage =
  | "discover"
  | "trackers"
  | "perpetuals"
  | "portfolio"
  | "rewards";

export function pathForPage(p: PlatformPage): string {
  return p === "discover"
    ? "/"
    : p === "perpetuals"
      ? "/trade"
      : `/${p}`;
}

export function pathnameToPage(pathname: string | null): PlatformPage {
  if (!pathname) return "discover";
  const seg = pathname.split("/").filter(Boolean)[0] ?? "";
  switch (seg) {
    case "rewards":
      return "rewards";
    case "trackers":
      return "trackers";
    case "perpetuals":
    case "perps":
    case "trade":
      return "perpetuals";
    case "portfolio":
      return "portfolio";
    default:
      return "discover";
  }
}
/** data source picked from the Surge dropdown */
export type SurgeSource = "surge" | "dexscreener" | "pumplive" | "topstreams";

/** market-cap ceiling ladder (in USD thousands) for the surge slider */
export const SURGE_CAPS = [0, 10, 25, 50, 75, 100, 250, 500, 1000, 5000] as const;
export const SURGE_CAP_LABELS = ["All", "10K", "25K", "50K", "75K", "100K", "250K", "500K", "1M", "5M"] as const;

type WalletEntry = {
  id: string;
  name: string;
  address: string;
  selected: boolean;
  perpAuto: boolean;
};

type HyzrUIState = {
  chain: ChainId;
  setChain: (c: ChainId) => void;
  region: Region;
  setRegion: (r: Region) => void;
  preset: number;
  setPreset: (p: number) => void;
  filterOpen: boolean;
  setFilterOpen: (v: boolean) => void;
  modal: "deposit" | "withdraw" | "quicksell" | "blacklist" | null;
  setModal: (m: HyzrUIState["modal"]) => void;
  pumpLive: boolean;
  setPumpLive: (v: boolean) => void;
  eyeOff: boolean;
  setEyeOff: (v: boolean) => void;
  surgeMetric: string;
  setSurgeMetric: (v: string) => void;
  refreshInterval: string;
  setRefreshInterval: (v: string) => void;
  tab: DiscoverTab;
  setTab: (t: DiscoverTab) => void;
  page: PlatformPage;
  setPage: (p: PlatformPage) => void;
  surgeSource: SurgeSource;
  setSurgeSource: (s: SurgeSource) => void;
  /** index into SURGE_CAPS */
  surgeCapIdx: number;
  setSurgeCapIdx: (i: number) => void;
  wallets: WalletEntry[];
  setWallets: (w: WalletEntry[]) => void;
  quickBuy: Record<number, QuickBuyValue>;
  setQuickBuy: (preset: number, v: QuickBuyValue) => void;
  /** footer eye — hides/shows the top price strip */
  tickerHidden: boolean;
  setTickerHidden: (v: boolean) => void;
};

const Ctx = createContext<HyzrUIState | null>(null);

export function HyzrUIProvider({ children }: { children: ReactNode }) {
  /* ---- page is DERIVED from the URL (refresh/back/forward all work) ---- */
  const router = useRouter();
  const pathname = usePathname();
  const page = pathnameToPage(pathname);
  const setPage = useCallback(
    (p: PlatformPage) => {
      router.push(pathForPage(p));
    },
    [router],
  );

  const [chain, setChain] = useState<ChainId>("SOL");
  const [region, setRegion] = useState<Region>("GLOBAL");
  const [preset, setPreset] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [modal, setModal] = useState<HyzrUIState["modal"]>(null);
  const [pumpLive, setPumpLive] = useState(false);
  const [eyeOff, setEyeOff] = useState(true);
  const [surgeMetric, setSurgeMetric] = useState("Price");
  const [refreshInterval, setRefreshInterval] = useState("Off");
  const [tab, setTab] = useState<DiscoverTab>("trending");
  const [surgeSource, setSurgeSource] = useState<SurgeSource>("surge");
  const [surgeCapIdx, setSurgeCapIdx] = useState(3);
  const [wallets, setWallets] = useState<WalletEntry[]>([
    {
      id: "hyzr-main",
      name: "HYZR Vault",
      address: "BCCbE",
      selected: true,
      perpAuto: false,
    },
  ]);
  const [quickBuy, setQuickBuyState] = useState<
    Record<number, QuickBuyValue>
  >({ 1: "0.001", 2: "0.01", 3: "20%" });
  const [tickerHidden, setTickerHidden] = useState(false);

  const setQuickBuy = (p: number, v: QuickBuyValue) =>
    setQuickBuyState((s) => ({ ...s, [p]: v }));

  return (
    <Ctx.Provider
      value={{
        chain,
        setChain,
        region,
        setRegion,
        preset,
        setPreset,
        filterOpen,
        setFilterOpen,
        modal,
        setModal,
        pumpLive,
        setPumpLive,
        eyeOff,
        setEyeOff,
        surgeMetric,
        setSurgeMetric,
        refreshInterval,
        setRefreshInterval,
        tab,
        setTab,
        page,
        setPage,
        surgeSource,
        setSurgeSource,
        surgeCapIdx,
        setSurgeCapIdx,
        wallets,
        setWallets,
        tickerHidden,
        setTickerHidden,
        quickBuy,
        setQuickBuy,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useHyzrUI() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHyzrUI must be used inside HyzrUIProvider");
  return ctx;
}
