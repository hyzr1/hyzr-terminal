export type InfoBadgeData = { icon: string; value: string; tone: "red" | "green" | "neutral" };

export type TokenPair = {
  image: string; symbol: string; name: string; age: string; viewers: number;
  marketCap: string; changePct: string; changeUp: boolean; liquidity: string;
  volume: string; txns: string; txnsBuy: string; txnsSell: string;
  ringOffset: number | null; dexBadge: "amm" | "pump"; infoBadges: InfoBadgeData[];
  dexPaid: "Paid" | "Unpaid"; holders: string; proTraders: string; tweet?: string;
  community?: boolean; refund?: boolean; sparkSeed: number;
};

export const NAV_TABS = [
  { label: "Markets", href: "#", active: true },
  { label: "Trade", href: "#", active: false },
  { label: "Trackers", href: "#", active: false },
  { label: "Portfolio", href: "#", active: false },
  { label: "Rewards", href: "#", active: false },
] as const;

export const ASSETS = {
  sol: "/icons/hl/SOL.svg",
  usdc: "/icons/usdc.png",
  pump: "/hyzr-logo.png", pumpAmm: "/hyzr-logo.png", robinhood: "/hyzr-logo.png",
  bnb: "/icons/hl/BNB.svg",
  eth: "/icons/hl/ETH.svg",
  btc: "/icons/hl/BTC.svg",
  bonk: "/icons/hl/BONK.svg", virtual: "/icons/hl/VIRTUAL.svg",
} as const;

const makeMarket = (symbol: string, name: string, price: string, change: number, seed: number): TokenPair => ({
  image: `/icons/hl/${symbol}.svg`, symbol, name, age: "24/7", viewers: 120 + seed * 17,
  marketCap: price, changePct: `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`, changeUp: change >= 0,
  liquidity: `$${120 + seed * 83}M`, volume: `$${48 + seed * 27}M`, txns: `${12 + seed}K`,
  txnsBuy: `${7 + seed}K`, txnsSell: `${5 + seed}K`, ringOffset: null, dexBadge: "amm",
  infoBadges: [{ icon: "ri-shield-check-line", value: "A+", tone: "green" }, { icon: "ri-flashlight-line", value: "20x", tone: "neutral" }],
  dexPaid: "Paid", holders: `${1 + seed}.2K`, proTraders: `${120 + seed * 8}`, refund: true, sparkSeed: seed,
});

export const TOKENS: TokenPair[] = [
  makeMarket("BTC", "Bitcoin", "$112,840", 2.42, 11), makeMarket("ETH", "Ethereum", "$4,382", 1.84, 23),
  makeMarket("SOL", "Solana", "$214.72", 4.12, 37), makeMarket("NVDA", "NVIDIA", "$182.64", 1.73, 41),
  makeMarket("TSLA", "Tesla", "$416.38", -0.82, 53), makeMarket("GOLD", "Gold", "$3,588.40", 0.67, 67),
  makeMarket("OIL", "Crude Oil", "$67.44", -1.21, 79),
];

export const GOLD_GRADIENT = "linear-gradient(135deg,#e8eaed 0%,#757b82 45%,#d5d8dc 72%,#4d5258 100%)";
