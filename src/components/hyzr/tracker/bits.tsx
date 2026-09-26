"use client";
/** Shared atoms for the Trackers page (Hyzr design language). */
import { useMemo } from "react";
import { addrHues, shortAddr } from "@/lib/tracker/trackerStore";
import HlIcon from "@/components/hyzr/perps/HlIcon";
import { baseName } from "@/lib/hyperliquid/types";

/* deterministic gradient wallet avatar (same letter-tile language as the site) */
export function WalletAvatar({
  address,
  size = 32,
  className = "",
  rounded = "rounded-[8px]",
}: {
  address: string;
  size?: number;
  className?: string;
  rounded?: string;
}) {
  const [h1, h2] = useMemo(() => addrHues(address), [address]);
  const initials = address ? address.slice(2, 4).toUpperCase() : "??";
  return (
    <div
      className={`flex shrink-0 select-none items-center justify-center font-medium text-white/90 ${rounded} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.34),
        background: `linear-gradient(135deg, hsl(${h1} 65% 42%), hsl(${h2} 70% 28%))`,
      }}
    >
      {initials}
    </div>
  );
}

/* wallet label: name/label if set, else short address */
export function WalletLabel({
  address,
  name,
  className = "",
}: {
  address: string;
  name?: string | null;
  className?: string;
}) {
  return (
    <span className={`flex min-w-0 items-center gap-[6px] ${className}`}>
      <span className="truncate text-[13px] font-medium text-textPrimary">
        {name || shortAddr(address)}
      </span>
      {name ? (
        <span className="shrink-0 text-[11px] text-textTertiary">{shortAddr(address)}</span>
      ) : null}
    </span>
  );
}

/* pill tab (24px) — exact chrome from the real trackers header */
export function PillTab({
  label,
  active,
  onClick,
  dot,
  icon,
}: {
  label: string;
  active: boolean;
  onClick?: () => void;
  dot?: boolean;
  icon?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative flex h-[24px] cursor-pointer flex-row items-center justify-start gap-[4px] rounded-[4px] px-[6px] border-[1px] ${
        active
          ? "border-primaryStroke bg-primaryStroke/60 hover:bg-primaryStroke/90"
          : "border-transparent hover:border-transparent hover:bg-primaryStroke/60"
      }`}
    >
      {dot ? (
        <div className="absolute right-[-3px] top-[-1px] h-[7px] w-[7px] rounded-full border-[1px] border-solid border-background bg-decrease" />
      ) : null}
      {icon ? <i className={`${icon} text-[14px]`} /> : null}
      <span
        className={`text-[13px] tracking-[-0.02rem] text-nowrap font-medium ${
          active ? "text-textPrimary" : "text-textTertiary group-hover:text-textSecondary"
        }`}
      >
        {label}
      </span>
    </button>
  );
}

/* round 28px icon button (toolbar) */
export function IconBtn({
  icon,
  onClick,
  title,
  active,
  badge,
  className = "",
}: {
  icon: string;
  onClick?: () => void;
  title?: string;
  active?: boolean;
  badge?: number;
  className?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`relative flex h-[26px] w-[26px] cursor-pointer flex-row items-center justify-center rounded-[4px] transition-all duration-150 hover:bg-primaryStroke/60 ${
        active ? "bg-primaryStroke/60" : ""
      } ${className}`}
    >
      <i className={`${icon} text-[15px] ${active ? "text-textPrimary" : "text-textSecondary"}`} />
      {badge ? (
        <span className="absolute right-[-2px] top-[-2px] flex h-[12px] min-w-[12px] items-center justify-center rounded-full bg-decrease px-[3px] text-[9px] font-bold text-white">
          {badge > 9 ? "9+" : badge}
        </span>
      ) : null}
    </button>
  );
}

/* pill action button (Import / Export / Add Wallet style) */
export function PillAction({
  label,
  icon,
  onClick,
  kind = "ghost",
  className = "",
}: {
  label: string;
  icon?: string;
  onClick?: () => void;
  kind?: "ghost" | "blue" | "danger";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[30px] flex-row items-center justify-center gap-[6px] whitespace-nowrap rounded-full px-[14px] text-[13px] font-medium transition-all duration-150 active:scale-[0.97] ${
        kind === "blue"
          ? "bg-primaryBlue text-background hover:bg-primaryBlueHover"
          : kind === "danger"
            ? "bg-decrease/15 text-decrease hover:bg-decrease/25"
            : "bg-primaryStroke text-textPrimary hover:bg-secondaryStroke/80"
      } ${className}`}
    >
      {icon ? <i className={`${icon} text-[14px]`} /> : null}
      {label}
    </button>
  );
}

/* coin chip with real HL icon */
export function CoinChip({ coin, size = 16 }: { coin: string; size?: number }) {
  return (
    <span className="flex shrink-0 items-center gap-[5px]">
      <HlIcon coin={coin} size={size} />
      <span className="text-[12px] font-medium text-textPrimary">{baseName(coin)}</span>
    </span>
  );
}

/* section label */
export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-[16px] pt-[12px] pb-[6px]">
      <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-textTertiary">
        {children}
      </span>
      {right}
    </div>
  );
}

/* modal shell (same dark-panel language as the rest of the site) */
export function TrackerModal({
  open,
  onClose,
  children,
  width = 520,
  title,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
  title?: string;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 p-[6px] backdrop-blur-[2px] sm:p-[16px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-[12px] border border-primaryStroke bg-backgroundSecondary shadow-[0_24px_64px_rgba(0,0,0,0.5)] sm:max-h-[88vh]"
        style={{ maxWidth: width }}
      >
        {title ? (
          <div className="flex h-[44px] shrink-0 items-center justify-between border-b border-primaryStroke px-[16px]">
            <span className="text-[14px] font-semibold text-textPrimary">{title}</span>
            <IconBtn icon="ri-close-line" onClick={onClose} />
          </div>
        ) : null}
        {children}
      </div>
    </div>
  );
}

/* table header cell with sort */
export function Th({
  children,
  sortKey,
  activeSort,
  sortDir,
  onSort,
  className = "",
}: {
  children: React.ReactNode;
  sortKey?: string;
  activeSort?: string;
  sortDir?: "asc" | "desc";
  onSort?: (k: string) => void;
  className?: string;
}) {
  const active = sortKey && activeSort === sortKey;
  return (
    <div
      className={`flex flex-row items-center justify-start gap-[2px] ${className}`}
      onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}
    >
      <span
        className={`text-[12px] leading-[16px] transition-colors ${
          active ? "font-bold text-primaryBlueHover" : "font-regular text-textTertiary"
        } ${sortKey ? "cursor-pointer group-hover:text-textPrimary" : ""}`}
      >
        {children}
        {active ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </span>
    </div>
  );
}

export const pnlClass = (n: number | null | undefined) =>
  n == null || n === 0
    ? "text-textSecondary"
    : n > 0
      ? "text-increase"
      : "text-decrease";

export function fmtUsdCompact(n: number, sign = false): string {
  const s = sign && n > 0 ? "+" : n < 0 ? "-" : "";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `${s}$${(a / 1_000_000_000).toFixed(2)}B`;
  if (a >= 1_000_000) return `${s}$${(a / 1_000_000).toFixed(a >= 10_000_000 ? 1 : 2)}M`;
  if (a >= 1_000) return `${s}$${(a / 1_000).toFixed(a >= 100_000 ? 0 : 1)}K`;
  return `${s}$${a.toFixed(a < 10 ? 2 : 0)}`;
}

export function fmtPctCompact(n: number, sign = true): string {
  const s = sign && n > 0 ? "+" : "";
  return `${s}${(n * 100).toFixed(n > 10 || (n < -10) ? 1 : 2)}%`;
}

export function ageStr(t: number): string {
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
