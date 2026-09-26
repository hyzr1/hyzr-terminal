"use client";

import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from "react";
import { ASSETS } from "@/lib/hyzr-data";
import { useHyzrUI } from "./ui/HyzrUI";
import { Popover } from "./ui/Popover";
import { IconPill } from "./HyzrIcons";
import {
  PresetMenuContent,
  RegionMenuContent,
  SettingsMenuContent,
  NotificationsContent,
  AvatarMenuContent,
} from "./menus/SmallMenus";
import { ActiveWalletsMenuContent } from "./menus/ActiveWalletsMenu";
import { SolPricePopoverContent } from "./menus/SolPricePopover";
import { AvatarTile } from "./TopNav";
import { useLive } from "./live/LiveProvider";
import { usePerpsData } from "@/lib/hyperliquid/perpsStore";
import { toast, useTradeStore, unrealizedPnl } from "@/lib/hyperliquid/tradeStore";
import { fetchAllMids } from "@/lib/hyperliquid/api";

export const HYZR_X_URL = "https://x.com/hyzrtrade";

/* ---------------------------------------------------------------------------
   fx15 — floating footer, "a better version of the original footer".

   Always expanded (no island collapse): every control is one click away.
   Slim pill (40px) floating 8px above the bottom edge; page content scrolls
   BEHIND it. fx17: the pill ITSELF carries the glass fill (rgba(24,24,30,
   0.55) + blur) so it reads as one floating object on every page — while
   the area AROUND it carries nothing: no reserved band, no panel behind it,
   just the page continuing to the bottom edge (fx16's transparent fill was
   wrong: content bleeding through the pill read as "background inside the
   footer"). Uniform rhythm: one flex row, fixed 3px gaps, single hairline
   dividers between clusters (responsive clusters carry their own dividers
   so two dividers can never sit adjacent). Hover is a gentle veil — no
   magnification, so items never dig into their neighbours.

   Every menu, click handler and live binding is unchanged from the
   original footer (preset/wallet/settings/region/socials/notifications/
   palette/avatar popovers, PnL -> portfolio, tickers -> /trade).
--------------------------------------------------------------------------- */

/* compact item — same height & padding for every interactive control */
const DOCK_ITEM =
  "flex h-[28px] shrink-0 cursor-pointer select-none items-center gap-[5px] rounded-[8px] px-[7px] text-[12px] font-medium whitespace-nowrap transition-colors duration-150 hover:bg-white/[0.07]";

/* chip variant — same metrics, plus a quiet pill background.
   (Chips that need a different fill pass it explicitly — no bg classes
   are ever stacked, so CSS-order can't flip the intended color.) */
const DOCK_CHIP = `${DOCK_ITEM} rounded-full bg-white/[0.04] px-[10px]`;
const CHIP_BORDER = { border: "1px solid rgba(255,255,255,0.10)" } as CSSProperties;
const CHIP_BLUE = `${DOCK_ITEM} rounded-full bg-primaryBlue/20 px-[10px] text-primaryBlue hover:bg-primaryBlue/30`;

/* hairline cluster divider — the uniform 3px flex gap pads it on both sides */
function DockDivider({ wide }: { wide?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`h-[16px] w-[1px] shrink-0 bg-white/10 ${wide ? "hidden 2xl:block" : ""}`}
    />
  );
}

/* Friends / referral popover — copyable invite link + counts */
function FriendsMenuContent({ close }: { close: () => void }) {
  const invite = `https://hyzr.trade/r/0xHyZR`;
  return (
    <div className="w-[260px] rounded-[12px] border border-primaryStroke bg-backgroundTertiary p-[12px] shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
      <p className="text-[13px] font-semibold text-textPrimary">Invite friends</p>
      <p className="mt-[4px] text-[11px] leading-[16px] text-textTertiary">
        Earn 10% of your friends' trading fees — forever.
      </p>
      <div className="mt-[10px] flex items-center gap-[6px]">
        <div className="flex h-[30px] min-w-0 flex-1 items-center overflow-hidden rounded-[8px] border border-primaryStroke bg-backgroundSecondary px-[8px]">
          <span className="truncate font-GeistMono text-[11px] text-textSecondary">{invite}</span>
        </div>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(invite).catch(() => {});
            toast("Invite link copied", "success");
            close();
          }}
          className="flex h-[30px] shrink-0 items-center gap-[4px] rounded-[8px] bg-primaryBlue px-[10px] text-[12px] font-bold text-background hover:bg-primaryBlueHover"
        >
          <i className="ri-file-copy-line text-[13px]" />
          Copy
        </button>
      </div>
      <div className="mt-[10px] flex items-center justify-between border-t border-primaryStroke/60 pt-[8px] text-[11px] text-textTertiary">
        <span>
          <span className="font-semibold text-textSecondary">3</span> invited
        </span>
        <span>
          <span className="font-semibold text-primaryGreen">$12.40</span> earned
        </span>
      </div>
    </div>
  );
}

/* Interface accent picker — swaps --primaryBlue live, persisted */
const ACCENTS = [
  { name: "Hyzr Violet", hex: "#b28fff" },
  { name: "Bubblegum", hex: "#ff9ee5" },
  { name: "Sky Pop", hex: "#8fd8ff" },
  { name: "Solar Orange", hex: "#f7931a" },
  { name: "Terminal Green", hex: "#2fe3ac" },
];

export function hexToTriplet(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "178 143 255";
  const n = parseInt(m[1], 16);
  return `${(n >> 16) & 255} ${(n >> 8) & 255} ${n & 255}`;
}

/** Apply a persisted accent on boot (call once after mount). */
export function applyStoredAccent() {
  try {
    const hex = localStorage.getItem("hyzr-accent");
    if (hex) document.documentElement.style.setProperty("--primary-color", hexToTriplet(hex));
  } catch { /* ignore */ }
}

function PaletteMenuContent() {
  const current =
    typeof window !== "undefined"
      ? localStorage.getItem("hyzr-accent") ?? "#b28fff"
      : "#b28fff";
  return (
    <div className="w-[210px] rounded-[12px] border border-primaryStroke bg-backgroundTertiary p-[10px] shadow-[0_16px_48px_rgba(0,0,0,0.55)]">
      <p className="px-[4px] text-[11px] font-semibold uppercase tracking-wider text-textTertiary">
        Accent color
      </p>
      <div className="mt-[8px] flex flex-col gap-[2px]">
        {ACCENTS.map((a) => (
          <button
            key={a.hex}
            type="button"
            onClick={() => {
              document.documentElement.style.setProperty("--primary-color", hexToTriplet(a.hex));
              localStorage.setItem("hyzr-accent", a.hex);
              toast(`Accent set to ${a.name}`, "success");
            }}
            className={`flex h-[32px] items-center gap-[8px] rounded-[8px] px-[8px] text-[12px] transition-colors ${
              current === a.hex
                ? "bg-primaryStroke/60 text-textPrimary"
                : "text-textSecondary hover:bg-primaryStroke/40"
            }`}
          >
            <span className="h-[14px] w-[14px] rounded-full border border-white/20" style={{ background: a.hex }} />
            {a.name}
            {current === a.hex ? (
              <i className="ri-check-line ml-auto text-[14px] text-primaryGreen" />
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* Live PnL chip — real paper-account PnL (realized fills + unrealized marks),
   colored by sign exactly like the Portfolio page's upnlClass(). */
function DockPnl({ onClick }: { onClick: () => void }) {
  const positions = useTradeStore((s) => s.positions);
  const fills = useTradeStore((s) => s.fills);

  /* live marks through the server proxy — polled only while positions are
     open (with a flat account this renders realized PnL with zero requests) */
  const [mids, setMids] = useState<Record<string, number>>({});
  const hasPositions = Object.keys(positions).length > 0;
  useEffect(() => {
    if (!hasPositions) return;
    let alive = true;
    const tick = () =>
      fetchAllMids()
        .then((m) => alive && setMids(m))
        .catch(() => {});
    tick();
    const t = setInterval(tick, 2_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [hasPositions]);

  const total = useMemo(() => {
    let u = 0;
    for (const p of Object.values(positions)) {
      u += unrealizedPnl(p, mids[p.coin] ?? p.entryPx);
    }
    const realized = fills.reduce((s, f) => s + f.closedPnl, 0);
    return realized + u;
  }, [positions, fills, mids]);

  const cls = total > 0 ? "text-increase" : total < 0 ? "text-decrease" : "text-textSecondary";
  const label = `${total >= 0 ? "+" : "-"}$${Math.abs(total).toFixed(2)}`;

  return (
    <button
      type="button"
      title="PnL — open portfolio"
      onClick={onClick}
      className={DOCK_CHIP}
      style={CHIP_BORDER}
    >
      <i className="ri-briefcase-4-line text-[14px] text-textTertiary" />
      <span className="text-[11px] font-semibold uppercase tracking-wider text-textTertiary">PnL</span>
      <span className={`ml-[2px] font-GeistMono text-[12px] font-semibold tabular-nums ${cls}`}>
        {label}
      </span>
    </button>
  );
}

/* Price ticker button (BTC/ETH) — click routes to /trade with that market */
function PriceTicker({
  img,
  alt,
  price,
  color,
  showOn,
}: {
  img: string;
  alt: string;
  price: string;
  color: string;
  showOn: string;
}) {
  return (
    <button
      type="button"
      title={`Trade ${alt} perps`}
      onClick={() => {
        usePerpsData.getState().setCoin(alt);
        window.location.assign("/trade");
      }}
      className={`${DOCK_ITEM} ${showOn} hidden`}
      style={{ color }}
    >
      <img src={img} alt={alt} className="h-[14px] w-[14px] object-contain" />
      <span className="font-GeistMono text-[12px] font-normal tabular-nums">{price}</span>
    </button>
  );
}

/* SOL price ticker button that opens the price chart popover (opens upward) */
function SolPriceTicker({ showOn }: { showOn: string }) {
  const { sol } = useLive();
  const price = sol > 0 ? `$${sol.toFixed(2)}` : "$101.43";
  return (
    <Popover
      side="top"
      align="center"
      gap={10}
      content={() => <SolPricePopoverContent close={() => {}} />}
      button={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className={`${DOCK_ITEM} ${showOn} hidden`}
          style={{ color: "#14F195" }}
        >
          <img src={ASSETS.sol} alt="SOL" className="h-[14px] w-[14px] object-contain" />
          <span className="font-GeistMono text-[12px] font-normal tabular-nums">{price}</span>
        </button>
      )}
    />
  );
}

/* ---------------------------------------------------------------------------
   The bar — fixed, centered, always expanded.
--------------------------------------------------------------------------- */
export default function FooterBar() {
  const { preset, region, wallets, page, setPage, tickerHidden, setTickerHidden } = useHyzrUI();
  const { status } = useLive(); // real connection state drives the GLOBAL dot

  /* live: pulsing green · connecting: static gray · simulated (degraded): static red */
  const live = status === "live";
  const dotColor =
    status === "live"
      ? "rgb(var(--increase))"
      : status === "simulated"
        ? "rgb(var(--decrease))"
        : "rgba(255,255,255,0.35)";

  return (
    <div className="pointer-events-none fixed inset-x-[10px] bottom-[8px] z-[60] flex justify-center">
      <nav
        aria-label="Hyzr dock"
        data-testid="hyzr-dock"
        className="no-scrollbar pointer-events-auto flex h-[40px] max-w-full items-center gap-[3px] overflow-x-auto rounded-[14px] px-[8px]"
        style={{
          /* fx17: glass fill ON the pill itself — one floating object.
            (Around the pill there is nothing: pages carry no reserved band,
            content runs to the bottom edge and scrolls behind the glass.) */
          background: "rgba(24,24,30,0.55)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)",
        } as CSSProperties}
      >
        {/* cluster 1 · Preset + Wallet + Settings */}
        <Popover
          side="top"
          align="start"
          gap={10}
          content={(close) => <PresetMenuContent close={close} />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Layout preset"
              onClick={toggle}
              className={CHIP_BLUE}
            >
              <i className="ri-list-settings-line text-[14px]" />
              <span className="text-[12px] font-semibold tracking-wide">PRESET {preset}</span>
            </button>
          )}
        />

        <Popover
          side="top"
          align="start"
          gap={10}
          content={(close) => <ActiveWalletsMenuContent close={close} />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Active wallets"
              onClick={toggle}
              className={DOCK_CHIP}
              style={CHIP_BORDER}
            >
              <i className="ri-wallet-3-line text-[14px] text-textTertiary" />
              <span className="font-GeistMono text-[12px] font-medium tabular-nums text-textSecondary">
                {wallets.length}
              </span>
              <span aria-hidden="true" className="h-[12px] w-[1px] bg-white/10" />
              <img src={ASSETS.sol} alt="SOL" className="h-[13px] w-[13px] object-contain" />
              <span className="font-GeistMono text-[12px] font-medium tabular-nums text-textSecondary">0</span>
              <i className="ri-arrow-down-s-line text-[13px] text-textTertiary" />
            </button>
          )}
        />

        <Popover
          side="top"
          align="start"
          gap={10}
          content={(close) => <SettingsMenuContent close={close} />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Settings"
              onClick={toggle}
              className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
            >
              <i className="ri-settings-3-line text-[15px]" />
            </button>
          )}
        />

        <DockDivider />

        {/* cluster 2 · PnL + Multi-asset + price tickers (wide screens) */}
        <DockPnl onClick={() => setPage("portfolio")} />

        <div
          title="Multi-asset markets: crypto, stocks, commodities"
          className="flex h-[28px] shrink-0 select-none items-center gap-[5px] whitespace-nowrap rounded-full bg-white/[0.04] px-[10px] text-[11px] font-semibold text-textSecondary"
          style={CHIP_BORDER}
        >
          <i className="ri-bit-coin-line text-[12px] text-[#AEB6C2]" />
          <i className="ri-line-chart-line text-[12px] text-[#D2D7DE]" />
          <i className="ri-oil-line text-[12px] text-[#8E99A8]" />
          <span className="hidden md:inline">Multi-asset</span>
        </div>

        <PriceTicker img={ASSETS.btc} alt="BTC" price="$78.5K" color="#F7931A" showOn="2xl:flex" />
        <PriceTicker img={ASSETS.eth} alt="ETH" price="$2418" color="#497493" showOn="2xl:flex" />
        <SolPriceTicker showOn="lg:flex" />

        <DockDivider />

        {/* cluster 3 · page links — Trade jumps straight into the terminal
            (mobile: lands on the DOM / order-entry view, fx19) */}
        <button
          type="button"
          title="Trade"
          aria-label="Trade"
          onClick={() => setPage("perpetuals")}
          className={`${DOCK_ITEM} ${
            page === "perpetuals" ? "text-primaryBlue" : "text-textTertiary hover:text-textSecondary"
          }`}
        >
          <i className="ri-stock-line text-[15px]" />
        </button>
        <button
          type="button"
          title="Markets"
          onClick={() => setPage("discover")}
          className={`${DOCK_ITEM} ${
            page === "discover" ? "text-primaryBlue" : "text-textTertiary hover:text-textSecondary"
          }`}
        >
          <i className="ri-compass-3-line text-[15px]" />
        </button>
        <button
          type="button"
          title="Rewards"
          onClick={() => setPage("rewards")}
          className={`${DOCK_ITEM} ${
            page === "rewards" ? "text-primaryBlue" : "text-textTertiary hover:text-textSecondary"
          }`}
        >
          <i className="ri-trophy-line text-[15px]" />
        </button>

        <DockDivider />

        {/* cluster 4 · network stats (≥1536px) — its right divider is
            2xl-guarded so it can never sit next to the Rewards divider */}
        <span className="hidden h-[28px] shrink-0 select-none items-center gap-[5px] whitespace-nowrap px-[7px] text-[12px] text-textTertiary 2xl:flex">
          <i className="ri-group-line text-[14px]" />
          <span className="font-GeistMono text-[12px] tabular-nums">12.6K</span>
        </span>
        <span className="hidden h-[28px] shrink-0 select-none items-center gap-[5px] whitespace-nowrap px-[7px] text-[12px] text-textTertiary 2xl:flex">
          <IconPill size={14} />
          <span className="font-GeistMono text-[12px] tabular-nums">$41.7K</span>
        </span>
        <span className="hidden h-[28px] shrink-0 select-none items-center gap-[5px] whitespace-nowrap px-[7px] text-[12px] text-textTertiary 2xl:flex">
          <i className="ri-gas-station-line text-[14px]" />
          <span className="font-GeistMono text-[12px] tabular-nums">
            0.0<sub>4</sub>79
          </span>
        </span>
        <span className="hidden h-[28px] shrink-0 select-none items-center gap-[5px] whitespace-nowrap px-[7px] text-[12px] text-textTertiary 2xl:flex">
          <i className="ri-coin-line text-[14px]" />
          <span className="font-GeistMono text-[12px] tabular-nums">0.004</span>
        </span>
        <DockDivider wide />

        {/* cluster 5 · GLOBAL region — dot driven by the real live status */}
        <Popover
          side="top"
          align="center"
          gap={10}
          content={(close) => <RegionMenuContent close={close} />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Region"
              onClick={toggle}
              className={`${DOCK_ITEM} rounded-full bg-primaryGreen/15 px-[10px]`}
            >
              <span
                data-testid="region-dot"
                className={`h-[7px] w-[7px] shrink-0 rounded-full ${live ? "dock-live-dot" : ""}`}
                style={{ background: dotColor }}
              />
              <span className="text-[12px] font-semibold text-primaryGreen">{region}</span>
              <i className="ri-arrow-down-s-line text-[13px] text-primaryGreen" />
            </button>
          )}
        />

        <DockDivider />

        {/* cluster 6 · Social / Docs / Friends / Bug report */}
        <a
          className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
          href="https://discord.gg/hyzrtrade"
          target="_blank"
          rel="noreferrer"
          title="Discord"
        >
          <i className="ri-discord-fill text-[15px]" />
        </a>
        <a
          className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
          href={HYZR_X_URL}
          target="_blank"
          rel="noreferrer"
          title="X (Twitter)"
        >
          <i className="ri-twitter-x-line text-[15px]" />
        </a>
        <a
          className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
          href="https://docs.hyzr.trade/"
          title="Docs"
        >
          <i className="ri-article-line text-[15px]" />
          <span className="hidden text-[12px] font-medium lg:inline">Docs</span>
        </a>

        <Popover
          side="top"
          align="center"
          gap={10}
          content={(close) => <FriendsMenuContent close={close} />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Friends — invite & earn"
              onClick={toggle}
              className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
            >
              <i className="ri-group-3-line text-[15px]" />
            </button>
          )}
        />

        <button
          type="button"
          title="Report a bug"
          onClick={() => {
            const info = `hyzr bug report\nurl: ${location.href}\nua: ${navigator.userAgent}\ntime: ${new Date().toISOString()}`;
            navigator.clipboard?.writeText(info).catch(() => {});
            toast("Debug info copied — paste it in Discord #bug-reports", "success");
            window.open("https://discord.gg/hyzrtrade", "_blank");
          }}
          className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
        >
          <i className="ri-bug-line text-[15px]" />
        </button>

        <DockDivider />

        {/* cluster 7 · view utilities */}
        <button
          type="button"
          title={tickerHidden ? "Show price bar" : "Hide price bar"}
          onClick={() => {
            setTickerHidden(!tickerHidden);
            toast(tickerHidden ? "Price bar shown" : "Price bar hidden", "info");
          }}
          className={`${DOCK_ITEM} ${
            tickerHidden ? "text-primaryBlue" : "text-textTertiary hover:text-textSecondary"
          }`}
        >
          <i className="ri-layout-top-line text-[15px]" />
        </button>

        <Popover
          side="top"
          align="end"
          gap={10}
          content={() => <NotificationsContent />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Notifications"
              onClick={toggle}
              className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
            >
              <i className="ri-notification-3-line text-[15px]" />
            </button>
          )}
        />

        <Popover
          side="top"
          align="end"
          gap={10}
          content={() => <PaletteMenuContent />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Interface accent"
              onClick={toggle}
              className={`${DOCK_ITEM} text-textTertiary hover:text-textSecondary`}
            >
              <i className="ri-palette-line text-[15px]" />
            </button>
          )}
        />

        <DockDivider />

        {/* cluster 8 · avatar (unchanged menu) */}
        <Popover
          side="top"
          align="end"
          gap={12}
          content={(close) => <AvatarMenuContent close={close} />}
          button={({ toggle }) => (
            <button
              type="button"
              title="Account"
              onClick={toggle}
              className={`${DOCK_ITEM} px-[4px]`}
            >
              <span className="flex h-[28px] w-[28px] items-center justify-center overflow-hidden rounded-full border border-white/25 shadow-[0_2px_8px_rgba(0,0,0,0.45)]">
                <AvatarTile size={28} />
              </span>
            </button>
          )}
        />
      </nav>
    </div>
  );
}
