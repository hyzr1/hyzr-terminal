"use client";

import { useEffect, useState } from "react";
import { NAV_TABS, ASSETS } from "@/lib/hyzr-data";
import { useHyzrUI, pathForPage, type PlatformPage } from "./ui/HyzrUI";
import { Popover } from "./ui/Popover";
import {
  ChainSelector,
} from "./menus/ChainMenu";
import { WalletMenuContent } from "./menus/WalletMenu";
import {
  NotificationsContent,
  AvatarMenuContent,
  StarPanelContent,
  SearchButton,
  SearchPanelContent,
} from "./menus/SmallMenus";
import { useTradeStore } from "@/lib/hyperliquid/tradeStore";
import { toast } from "@/lib/hyperliquid/tradeStore";
import { useWalletStore, activeWallet } from "@/lib/walletStore";
import { WalletLogo } from "./ui/icons";
import InlineTokenIcon from "./InlineTokenIcon";

/* Hyzr logo mark — vector paths lifted from the snapshot */
export function HyzrMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 36 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <g clipPath="url(#hyzr-mark-clip)">
        <path
          d="M24.1384 17.3876H11.8623L18.0001 7.00012L24.1384 17.3876Z"
          fill="currentColor"
        />
        <path
          d="M31 29.0003L5 29.0003L9.96764 20.5933L26.0324 20.5933L31 29.0003Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="hyzr-mark-clip">
          <rect width="26" height="22" fill="white" transform="translate(5 7)" />
        </clipPath>
      </defs>
    </svg>
  );
}

/* Hyzr wordmark — vector paths lifted from the snapshot */
export function HyzrWordmark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 74 15"
      fill="currentColor"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path d="M10.1591 0.916748L13.2771 6.16728C13.7613 6.98661 13.7613 8.01379 13.2771 8.83312L10.1591 14.0837H6.69072L9.80866 8.83312C10.2929 8.01379 10.2929 6.98661 9.80866 6.16728L6.69072 0.916748H10.1591Z" />
      <path d="M4.35465 1.10876C4.87635 1.39603 5.3116 1.81415 5.62116 2.31648L8.35641 6.98705C8.67856 7.5425 8.67856 8.20842 8.35641 8.76387L5.62116 13.4344C5.3116 13.9368 4.87635 14.3549 4.35465 14.6422C3.83295 14.9294 3.24343 15.0804 2.64427 15.0804H0V13.3797H2.47953C2.90231 13.3797 3.31634 13.2695 3.68087 13.0598C4.0454 12.8501 4.34754 12.5481 4.55718 12.1837L6.90486 8.16464C7.04748 7.91927 7.12367 7.64021 7.12367 7.35612C7.12367 7.07202 7.04748 6.79296 6.90486 6.54759L4.55718 2.52857C4.34754 2.16417 4.0454 1.86214 3.68087 1.65244C3.31634 1.44273 2.90231 1.33258 2.47953 1.33258H0V0.916748" />
      <path d="M16.5142 0.916748C17.5817 0.916748 18.4466 1.78159 18.4466 2.84906C18.4466 3.91653 17.5817 4.78138 16.5142 4.78138C15.4468 4.78138 14.5819 3.91653 14.5819 2.84906C14.5819 1.78159 15.4468 0.916748 16.5142 0.916748Z" />
      <path d="M14.8093 6.09328H18.2191V14.9167H14.8093V6.09328Z" />
      <path d="M25.9324 5.84715C27.3311 5.84715 28.4657 6.98171 28.4657 8.38048V14.9168H25.9324V8.38048C25.9324 8.38048 25.9324 8.38048 25.9324 8.38048C25.9324 8.38048 22.8039 8.38048 22.8039 8.38048V14.9168H20.2706V8.38048C20.2706 6.98171 21.4051 5.84715 22.8039 5.84715H25.9324Z" />
      <path d="M33.9776 5.84715C35.3764 5.84715 36.511 6.98171 36.511 8.38048V14.9168H33.9776V8.38048C33.9776 8.38048 30.8492 8.38048 30.8492 8.38048V14.9168H28.3158V8.38048C28.3158 6.98171 29.4504 5.84715 30.8492 5.84715H33.9776Z" />
      <path d="M43.9282 12.627C43.2337 12.627 42.6704 12.0636 42.6704 11.3692C42.6704 10.6747 43.2337 10.1114 43.9282 10.1114H49.2676C49.2676 7.74705 47.3514 5.83081 44.987 5.83081H43.9282C41.5638 5.83081 39.6476 7.74705 39.6476 10.1114V10.6526C39.6476 13.017 41.5638 14.9332 43.9282 14.9332H49.2435V12.627H43.9282Z" />
      <path d="M55.3138 5.83081C57.6782 5.83081 59.5944 7.74705 59.5944 10.1114V10.6526C59.5944 13.017 57.6782 14.9332 55.3138 14.9332H53.5518C51.1874 14.9332 49.2712 13.017 49.2712 10.6526V10.1114C49.2712 7.74705 51.1874 5.83081 53.5518 5.83081H55.3138ZM54.9255 12.627C55.62 12.627 56.1833 12.0636 56.1833 11.3692V9.39479C56.1833 8.70034 55.62 8.13697 54.9255 8.13697H53.9401C53.2457 8.13697 52.6823 8.70034 52.6823 9.39479V11.3692C52.6823 12.0636 53.2457 12.627 53.9401 12.627H54.9255Z" />
      <path d="M61.7866 0.916748H64.4793V5.83081H66.0793C68.4437 5.83081 70.3599 7.74705 70.3599 10.1114V10.6526C70.3599 13.017 68.4437 14.9332 66.0793 14.9332H61.7866V0.916748ZM65.691 12.627C66.3855 12.627 66.9488 12.0636 66.9488 11.3692C66.9488 10.6747 66.3855 8.13697 65.691 8.13697H64.4793V12.627H65.691Z" />
      <path d="M73.7337 0.916748H71.041V3.60948H73.7337V0.916748Z" />
      <path d="M73.7337 5.83081H71.041V14.9332H73.7337V5.83081Z" />
    </svg>
  );
}

function NavTab({
  label,
  pagePath,
  active,
  onClick,
}: {
  label: string;
  pagePath: string;
  active: boolean;
  onClick?: () => void;
}) {
  return (
    <a
      href={pagePath}
      onClick={(e) => {
        e.preventDefault();
        onClick?.();
      }}
      className={`relative flex h-[32px] flex-row items-center justify-start gap-[4px] whitespace-nowrap rounded-[4px] px-[8px] text-[14px] font-medium hover:text-primaryBlue hover:[transition:color_135ms_ease-in-out] xl:px-[14px] ${
        active ? "text-primaryBlue" : "text-textPrimary"
      }`}
    >
      <span className="pointer-events-none absolute inset-0 z-0 rounded-[4px] bg-primaryBlue/20 opacity-0 will-change-transform" />
      <span className="relative z-[1]">{label}</span>
    </a>
  );
}

/* round 32px icon button used across the nav actions */
const roundBtn =
  "flex h-[32px] w-[32px] flex-row items-center justify-center gap-[8px] rounded-full bg-primaryStroke px-[12px] hover:bg-secondaryStroke/80";

/* deterministic identicon avatar tile (gradient "81"), shared mobile + desktop */
export function AvatarTile({ size = 28 }: { size?: number }) {
  return (
    <div
      className="relative overflow-hidden rounded-full"
      style={{ height: size, width: size }}
    >
      <div className="pointer-events-none absolute inset-0 z-[15] h-full w-full rounded-full border-[1px] border-white/[0.1]" />
      <svg viewBox="0 0 120 120" className="h-full w-full object-cover">
        <defs>
          <linearGradient id="avatar-grad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style={{ stopColor: "hsl(262, 90%, 76%)", stopOpacity: 1 }} />
            <stop offset="100%" style={{ stopColor: "hsl(325, 95%, 78%)", stopOpacity: 1 }} />
          </linearGradient>
        </defs>
        <rect width="120" height="120" fill="url(#avatar-grad)" />
        <text
          x="50%"
          y="50%"
          dominantBaseline="central"
          textAnchor="middle"
          fontFamily="system-ui, -apple-system, sans-serif"
          fontSize="48"
          fontWeight="600"
          fill="white"
          opacity="0.95"
        >
          81
        </text>
      </svg>
    </div>
  );
}

export default function TopNav() {
  const { setModal, page, setPage } = useHyzrUI();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [pasteQuery, setPasteQuery] = useState("");

  /* live paper-account numbers for the mobile wallet pill */
  const balance = useTradeStore((s) => s.balance);
  const activeWalletEntry = useWalletStore((s) => activeWallet(s));
  const positions = useTradeStore((s) => s.positions);
  const orders = useTradeStore((s) => s.orders);
  const posCount =
    Object.values(positions).filter((p) => p && p.szi !== 0).length +
    orders.length;
  const compactUsd = (v: number) =>
    v >= 1e6
      ? `${(v / 1e6).toFixed(1)}M`
      : v >= 1e4
        ? `${Math.round(v / 1e3)}K`
        : Math.floor(v).toLocaleString();

  /* lock body scroll while the drawer is open */
  useEffect(() => {
    if (!drawerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setDrawerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [drawerOpen]);

  const go = (p: PlatformPage) => {
    setDrawerOpen(false);
    setPage(p);
  };

  /* Paste CA: read the clipboard and drop it straight into search */
  const pasteCa = async () => {
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        toast("Clipboard is empty", "error");
        return;
      }
      setPasteQuery(text);
      setSearchOpen(true);
    } catch {
      toast("Allow clipboard access to paste", "error");
    }
  };

  return (
    <>
      <div className="flex h-[52px] min-h-[48px] w-full flex-row items-center justify-between gap-[8px] overflow-hidden border-b border-primaryStroke px-[10px] sm:h-[64px] sm:min-h-[64px] sm:justify-start sm:gap-[16px] sm:px-[16px] lg:px-[24px]">
        {/* Logo */}
        <div className="flex w-[36px] flex-shrink-0 flex-row items-center justify-start gap-[0px] sm:w-[24px] 2xl:w-[112px]">
          <a href="#" onClick={(e) => { e.preventDefault(); go("discover"); }}>
            <div className="flex flex-row items-center">
              <div className="flex flex-row items-center">
                <span className="hyzr-logo-image h-[34px] w-[34px] shrink-0"><img src="/hyzr-logo.png" alt="HYZR" /></span>
                <span className="hyzr-wordmark hidden 2xl:block">hyzr</span>
              </div>
            </div>
          </a>
        </div>

        {/* Nav tabs — desktop */}
        <div className="relative hidden min-w-[0px] flex-1 lg:flex">
          <div className="no-scrollbar flex overflow-x-auto overflow-y-hidden">
            <div className="flex flex-row items-center justify-start gap-[4px]">
              {NAV_TABS.map((tab) => {
                const p: PlatformPage =
                  tab.label === "Markets"
                    ? "discover"
                    : tab.label === "Trade"
                      ? "perpetuals"
                      : (tab.label.toLowerCase() as PlatformPage);
                return (
                  <NavTab
                    key={tab.label}
                    label={tab.label}
                    pagePath={pathForPage(p)}
                    active={page === p}
                    onClick={() => setPage(p)}
                  />
                );
              })}
            </div>
          </div>
        </div>

        {/* Search + chain — desktop (ml-auto right-aligns when nav tabs are hidden 640–1023px; no-op at lg+ where tabs flex-1) */}
        <div className="ml-auto hidden flex-row items-center justify-start gap-[16px] sm:flex">
          <SearchButton />
          <div className="hidden sm:block">
            <ChainSelector />
          </div>
          {/* hamburger — tablets (nav tabs hidden below lg) */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="Menu"
            className="flex h-[32px] w-[28px] items-center justify-center rounded-full hover:bg-primaryStroke/60 lg:hidden"
          >
            <i className="ri-menu-line text-[20px] text-textPrimary" />
          </button>
        </div>

        {/* Actions — desktop */}
        <div className="hidden items-center gap-[16px] sm:flex">
          <button
            type="button"
            onClick={() => setModal("deposit")}
            className="hyzr-accent-grad hidden h-[32px] flex-row items-center justify-start rounded-full px-[14px] sm:flex"
          >
            <span className="whitespace-nowrap text-[14px] font-bold text-[#0d0a1a]">
              Deposit
            </span>
          </button>

          <div className="flex items-center gap-[16px]">
            <Popover
              align="end"
              content={() => <StarPanelContent />}
              button={({ toggle }) => (
                <button type="button" onClick={toggle} className={roundBtn}>
                  <i className="ri-star-line text-[18px] text-textPrimary" />
                </button>
              )}
            />
            <Popover
              align="end"
              gap={10}
              content={(close) => <WalletMenuContent close={close} />}
              button={({ open, toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="flex h-[32px] w-fit min-w-max flex-row items-center justify-center gap-[8px] rounded-full bg-primaryStroke px-[12px] py-[8px] transition-colors hover:bg-secondaryStroke/80"
                >
                  <i className="ri-wallet-line text-[18px] text-textPrimary" />
                  <div className="hidden flex-shrink-0 flex-row items-center justify-start gap-[4px] whitespace-nowrap xl:flex">
                    <InlineTokenIcon src={ASSETS.sol} symbol="SOL" size={15} alt="SOL" />
                    <span className="text-[14px] font-semibold text-textPrimary">
                      {activeWalletEntry ? <WalletLogo kind={activeWalletEntry.kind} size={15} /> : "0"}
                    </span>
                  </div>
                  <div className="hidden h-full w-[1px] flex-shrink-0 bg-secondaryStroke xl:block" />
                  <div className="hidden flex-shrink-0 flex-row items-center justify-start gap-[4px] whitespace-nowrap xl:flex">
                    <img src={ASSETS.usdc} alt="Hyperliquid USDC" className="h-[15px] w-[15px] object-contain" />
                    <span className="text-[14px] font-semibold text-textPrimary">
                      {compactUsd(balance)}
                    </span>
                  </div>
                  <i
                    className={`ri-arrow-down-s-line text-[18px] text-textPrimary transition-transform duration-150 ${
                      open ? "rotate-180" : ""
                    }`}
                  />
                </button>
              )}
            />
            <Popover
              align="end"
              content={(close) => <AvatarMenuContent close={close} />}
              button={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="relative flex h-[28px] w-[28px] flex-row items-center justify-center overflow-visible rounded-full border border-transparent bg-primaryStroke transition-all duration-150 ease-in-out hover:bg-secondaryStroke/80 active:scale-[0.96]"
                >
                  <AvatarTile size={28} />
                </button>
              )}
            />
          </div>
        </div>

        {/* ============ MOBILE header cluster (mirrors the Hyzr app) ============ */}
        <div className="flex flex-shrink-0 items-center gap-[4px] sm:hidden">
          {/* wallet pill: [copy] [list n] [USDC balance ˅] */}
          <div className="flex h-[32px] items-center overflow-hidden rounded-full bg-primaryStroke">
            <button
              type="button"
              title="Deposit"
              onClick={() => setModal("deposit")}
              className="flex h-full items-center px-[7px] hover:bg-secondaryStroke/60"
            >
              <i className="ri-file-copy-line text-[14px] text-textPrimary" />
            </button>
            <button
              type="button"
              title="Positions & orders"
              onClick={() => go("portfolio")}
              className="flex h-full items-center gap-[2px] px-[6px] hover:bg-secondaryStroke/60"
            >
              <i className="ri-equalizer-line text-[14px] text-textPrimary" />
              <span className="text-[12px] font-semibold text-textPrimary">{posCount}</span>
            </button>
            <Popover
              align="end"
              content={(close) => <WalletMenuContent close={close} />}
              button={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="flex h-full items-center gap-[2px] px-[7px] hover:bg-secondaryStroke/60"
                >
                  <img src={ASSETS.usdc} alt="USDC" className="h-[13px] w-[13px]" />
                  <span className="text-[12px] font-semibold text-textPrimary">{compactUsd(balance)}</span>
                  <i className="ri-arrow-down-s-line text-[12px] text-textPrimary" />
                </button>
              )}
            />
          </div>

          {/* Paste CA */}
          <button
            type="button"
            onClick={pasteCa}
            className="flex h-[32px] items-center gap-[4px] rounded-full border border-primaryStroke px-[8px] hover:bg-primaryStroke/40"
          >
            <i className="ri-clipboard-line text-[13px] text-textPrimary" />
            <span className="whitespace-nowrap text-[12px] font-semibold text-textPrimary">
              Paste CA
            </span>
          </button>

          {/* search */}
          <Popover
            open={searchOpen}
            onOpenChange={setSearchOpen}
            align="end"
            content={(close) => (
              <SearchPanelContent close={close} initialQuery={pasteQuery} />
            )}
            button={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className="flex h-[32px] w-[30px] items-center justify-center rounded-full hover:bg-primaryStroke/60"
              >
                <i className="ri-search-2-line text-[17px] text-textPrimary" />
              </button>
            )}
          />

          {/* avatar */}
          <Popover
            align="end"
            content={(close) => <AvatarMenuContent close={close} />}
            button={({ toggle }) => (
              <button
                type="button"
                onClick={toggle}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-primaryStroke"
              >
                <AvatarTile size={30} />
              </button>
            )}
          />

          {/* hamburger — opens the page drawer */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            title="Menu"
            className="flex h-[32px] w-[28px] items-center justify-center rounded-full hover:bg-primaryStroke/60"
          >
            <i className="ri-menu-line text-[20px] text-textPrimary" />
          </button>
        </div>
      </div>

      {/* mobile drawer */}
      {drawerOpen ? (
        <MobileDrawer
          onClose={() => setDrawerOpen(false)}
          onNavigate={go}
          onDeposit={() => {
            setDrawerOpen(false);
            setModal("deposit");
          }}
        />
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Mobile slide-in drawer — the phone navigation (hamburger menu)      */
/* ------------------------------------------------------------------ */

const DRAWER_LINKS: { id: PlatformPage; label: string; icon: string }[] = [
  { id: "discover", label: "Markets", icon: "ri-compass-3-line" },
  { id: "perpetuals", label: "Trade", icon: "ri-stock-line" },
  { id: "trackers", label: "Trackers", icon: "ri-radar-line" },
  { id: "portfolio", label: "Portfolio", icon: "ri-briefcase-4-line" },
  { id: "rewards", label: "Rewards", icon: "ri-trophy-line" },
];

function MobileDrawer({
  onClose,
  onNavigate,
  onDeposit,
}: {
  onClose: () => void;
  onNavigate: (p: PlatformPage) => void;
  onDeposit: () => void;
}) {
  const { page } = useHyzrUI();
  const balance = useTradeStore((s) => s.balance);

  return (
    <div className="fixed inset-0 z-[90] lg:hidden">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div
        className="absolute inset-y-0 right-0 flex w-[300px] max-w-[86vw] flex-col border-l border-primaryStroke bg-background shadow-[-16px_0_48px_rgba(0,0,0,0.6)]"
        style={{ animation: "hyzr-drawer-in 160ms ease-out" }}
      >
        {/* header */}
        <div className="flex h-[52px] shrink-0 items-center justify-between border-b border-primaryStroke px-[14px]">
          <div className="flex items-center gap-[8px]">
            <span className="hyzr-logo-image h-[28px] w-[28px] shrink-0"><img src="/hyzr-logo.png" alt="HYZR" /></span>
            <span className="hyzr-wordmark">hyzr</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-[32px] w-[32px] items-center justify-center rounded-full hover:bg-primaryStroke/60"
          >
            <i className="ri-close-line text-[18px] text-textPrimary" />
          </button>
        </div>

        {/* account card */}
        <div className="flex items-center gap-[10px] border-b border-primaryStroke/60 px-[14px] py-[12px]">
          <AvatarTile size={38} />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="text-[14px] font-semibold text-textPrimary">
              Hyzr Main
            </span>
            <span className="flex items-center gap-[4px] text-[12px] text-textTertiary">
              <img src={ASSETS.usdc} alt="USDC" className="h-[12px] w-[12px]" />
              {balance.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
            </span>
          </div>
          <button
            type="button"
            onClick={onDeposit}
            className="hyzr-accent-grad flex h-[32px] items-center rounded-full px-[14px] text-[13px] font-bold text-[#0d0a1a]"
          >
            Deposit
          </button>
        </div>

        {/* page links */}
        <nav className="flex flex-1 flex-col gap-[2px] overflow-y-auto p-[8px]">
          {DRAWER_LINKS.map((l) => {
            const active = page === l.id;
            return (
              <a
                key={l.id}
                href={pathForPage(l.id)}
                onClick={(e) => {
                  e.preventDefault();
                  onNavigate(l.id);
                }}
                className={`flex h-[44px] items-center gap-[12px] rounded-[10px] px-[12px] text-[15px] font-medium transition-colors ${
                  active
                    ? "bg-primaryBlue/15 text-primaryBlue"
                    : "text-textSecondary hover:bg-white/[0.05] hover:text-textPrimary"
                }`}
              >
                <i className={`${l.icon} text-[18px]`} />
                {l.label}
                {active ? (
                  <i className="ri-arrow-right-s-line ml-auto text-[16px]" />
                ) : null}
              </a>
            );
          })}

          <div className="mx-[6px] my-[8px] border-t border-white/[0.06]" />

          <div className="flex flex-col gap-[2px]">
            <button
              type="button"
              onClick={onClose}
              className="flex h-[44px] items-center gap-[12px] rounded-[10px] px-[12px] text-[15px] font-medium text-textSecondary hover:bg-white/[0.05] hover:text-textPrimary"
            >
              <i className="ri-notification-3-line text-[18px]" />
              Notifications
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[44px] items-center gap-[12px] rounded-[10px] px-[12px] text-[15px] font-medium text-textSecondary hover:bg-white/[0.05] hover:text-textPrimary"
            >
              <i className="ri-star-line text-[18px]" />
              Favorites
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex h-[44px] items-center gap-[12px] rounded-[10px] px-[12px] text-[15px] font-medium text-textSecondary hover:bg-white/[0.05] hover:text-textPrimary"
            >
              <i className="ri-settings-3-line text-[18px]" />
              Settings
            </button>
          </div>
        </nav>

        {/* footer: region + socials */}
        <div className="flex shrink-0 items-center justify-between border-t border-primaryStroke/60 px-[16px] py-[12px]">
          <span className="flex items-center gap-[6px] text-[12px] font-medium text-textTertiary">
            <i className="ri-global-line text-[14px]" />
            GLOBAL · EN
          </span>
          <div className="flex items-center gap-[10px] text-textTertiary">
            <i className="ri-twitter-x-line text-[16px]" />
            <i className="ri-telegram-line text-[16px]" />
            <i className="ri-discord-line text-[16px]" />
          </div>
        </div>
      </div>
    </div>
  );
}
