/** Shared tracker types (safe to import from client + server). */

export interface WhaleEvent {
  k: "whale" | "tracked";
  w: string; // wallet address
  coin: string;
  side: "B" | "A"; // B = buy, A = sell
  px: number;
  sz: number;
  usd: number;
  dir: string; // "Open Long" | "Close Short" | "Long > Short" | ...
  pnl: number | null; // realized pnl on closes
  t: number;
  taker: boolean;
  tid: number;
}
