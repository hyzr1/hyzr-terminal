import manifest from "./icons-manifest.json";
import meta from "./icons-meta.json";

/**
 * Local-first icon resolution.
 * The full tradable universe's logos are pre-seeded into /public/icons/hl/
 * (downloaded from Hyperliquid's CDN + generated category badges), so icons
 * render instantly from the same origin — zero runtime upstream fetches.
 */
const SET = new Set<string>(manifest as readonly string[]);
const BACKING = meta as Record<string, string>;

export type IconBacking = "raw" | "dark" | "light";

/**
 * How the icon must be backed to look right on the dark UI:
 *  - "raw":   full-bleed bg or solid disc (SP500 red, BTC orange) — render bare
 *  - "dark":  dark ink on transparency (ETH, XRP, SOL) — needs a white circle
 *  - "light": light ink on transparency (HYPE mint squiggle) — needs a dark circle
 */
export function iconBacking(symbol: string | null | undefined): IconBacking {
  const s = (symbol ?? "").toUpperCase();
  const v = BACKING[s];
  return v === "raw" || v === "dark" || v === "light" ? v : "raw";
}

export function localIcon(symbol: string | null | undefined): string | null {
  const s = (symbol ?? "").toUpperCase();
  if (!s) return null;
  if (SET.has(s)) return `/icons/hl/${s}.svg`;
  // aliases: display symbol -> upstream icon name
  const alias: Record<string, string> = {
    SPX: "SP500",
    NDX: "XYZ100",
    BRENT: "BRENTOIL",
    PLAT: "PLATINUM",
    ALUM: "ALUMINIUM",
    OIL: "CL",
    NATG: "NATGAS",
  };
  const a = alias[s];
  if (a && SET.has(a)) return `/icons/hl/${a}.svg`;
  return null;
}

export default manifest;
