"use client";
/** fx19 workspace types — TopstepX/ProjectX panel model. */

export type PanelType =
  | "chart"      // candles + bracket overlay + click-to-place limits
  | "dom"        // price ladder (bid/ask sizes, click-to-trade)
  | "order"      // order entry ticket
  | "positions"  // open positions table
  | "orders"     // working orders table
  | "trades"     // fill history
  | "tas"        // time & sales (market tape)
  | "account";   // account / balance

export type LinkColor = "yellow" | "red" | "blue" | "gold";

export interface PanelInst {
  id: string;
  type: PanelType;
  /** geometry as fractions of the workspace box (0..1) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** link color — panels sharing a color share one market; null = independent */
  link: LinkColor | null;
  /** explicit market for UNLINKED panels (undefined → follow primary coin) */
  coin?: string;
}

export interface SavedLayout {
  name: string;
  panels: PanelInst[];
  groupMarkets: Partial<Record<LinkColor, string>>;
}

export const LINK_COLORS: Array<{ id: LinkColor; label: string; hex: string }> = [
  { id: "yellow", label: "Yellow", hex: "#FFE066" },
  { id: "red", label: "Red", hex: "#FF6B6B" },
  { id: "blue", label: "Blue", hex: "#4DA3FF" },
  { id: "gold", label: "Gold", hex: "#D9A441" },
];

export const PANEL_META: Record<PanelType, { label: string; icon: string; blurb: string }> = {
  chart: { label: "Chart", icon: "ri-candlestick-line", blurb: "Candles · brackets · click-to-place limits" },
  dom: { label: "DOM", icon: "ri-bar-grouped-line", blurb: "Price ladder — click to trade" },
  order: { label: "Order Panel", icon: "ri-edit-box-line", blurb: "Order entry ticket" },
  positions: { label: "Positions", icon: "ri-file-list-3-line", blurb: "Open positions" },
  orders: { label: "Orders", icon: "ri-instance-line", blurb: "Working orders" },
  trades: { label: "Trades", icon: "ri-exchange-dollar-line", blurb: "Fill history" },
  tas: { label: "Time & Sales", icon: "ri-time-line", blurb: "Live trade tape" },
  account: { label: "Account", icon: "ri-wallet-3-line", blurb: "Balance · margin · P&L" },
};

const F = (n: number) => +n.toFixed(4);

/** Built-in presets (TopstepX ships "Standard" + "DOM Only" too). */
export const DEFAULT_LAYOUTS: SavedLayout[] = [
  {
    name: "Standard",
    panels: [
      { id: "std-chart", type: "chart", x: F(0), y: F(0), w: F(0.60), h: F(0.68), link: "yellow" },
      { id: "std-dom", type: "dom", x: F(0.60), y: F(0), w: F(0.22), h: F(0.68), link: "yellow" },
      { id: "std-order", type: "order", x: F(0.82), y: F(0), w: F(0.18), h: F(0.68), link: "yellow" },
      { id: "std-positions", type: "positions", x: F(0), y: F(0.68), w: F(1.0), h: F(0.32), link: null },
    ],
    groupMarkets: {},
  },
  {
    name: "DOM Only",
    panels: [
      { id: "domonly-dom", type: "dom", x: F(0.30), y: F(0), w: F(0.40), h: F(1), link: "yellow" },
      { id: "domonly-order", type: "order", x: F(0.70), y: F(0), w: F(0.30), h: F(1), link: "yellow" },
    ],
    groupMarkets: {},
  },
];

/** min sizes in px (clamped against workspace box at drag/resize time) */
export const MIN_PX: Record<PanelType, { w: number; h: number }> = {
  chart: { w: 360, h: 240 },
  dom: { w: 240, h: 300 },
  order: { w: 236, h: 340 },
  positions: { w: 320, h: 140 },
  orders: { w: 320, h: 140 },
  trades: { w: 320, h: 140 },
  tas: { w: 240, h: 200 },
  account: { w: 240, h: 200 },
};
