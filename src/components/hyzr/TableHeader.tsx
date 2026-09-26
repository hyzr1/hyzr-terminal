"use client";

/* Table header. While hovering a bonding-curve row, the Liquidity slot
   shows the green "Bonding: XX%" pill exactly like the real board.
   Price / Open Interest / Volume / Trades are clickable sort headers
   (click cycles desc -> asc -> off). */

export type SortKey = "price" | "oi" | "volume" | "trades";
export type SortState = { key: SortKey; dir: 1 | -1 } | null;

import { useCallback, useState } from "react";

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
}: {
  label: string;
  sortKey?: SortKey;
  sort?: SortState;
  onSort?: (s: SortState) => void;
}) {
  const active = sortKey && sort?.key === sortKey ? sort.dir : null;
  if (!sortKey || !onSort) {
    return (
      <span className="contents">
        <button
          type="button"
          className="group flex min-w-0 cursor-pointer flex-row items-center"
        >
          <div>
            <span className="text-[12px] font-normal text-textTertiary transition-colors group-hover:text-textPrimary">
              {label}
            </span>
          </div>
        </button>
      </span>
    );
  }
  return (
    <span className="contents">
      <button
        type="button"
        title={`Sort by ${label.toLowerCase()}`}
        onClick={() => {
          // documented cycle: off -> desc -> asc -> off (was stuck at desc forever)
          if (active === null) onSort({ key: sortKey, dir: -1 });
          else if (active === -1) onSort({ key: sortKey, dir: 1 });
          else onSort(null);
        }}
        className="group flex min-w-0 cursor-pointer flex-row items-center gap-[3px]"
      >
        <div>
          <span
            className={`text-[12px] font-normal transition-colors ${
              active != null ? "text-primaryBlue" : "text-textTertiary group-hover:text-textPrimary"
            }`}
          >
            {label}
          </span>
        </div>
        {active != null ? (
          <i
            className={`text-[12px] leading-none text-primaryBlue ${
              active === -1 ? "ri-arrow-down-s-fill" : "ri-arrow-up-s-fill"
            }`}
          />
        ) : null}
      </button>
    </span>
  );
}

export default function TableHeader({
  bonding,
  sort,
  onSort,
}: {
  /** bonding progress 0..1 of the hovered row (null/undefined = none) */
  bonding?: number | null;
  sort?: SortState;
  onSort?: (s: SortState) => void;
}) {
  return (
    <div className="sticky z-20 flex h-[32px] max-h-[32px] min-h-[32px] w-full min-w-0 flex-grow flex-row items-center justify-start whitespace-nowrap rounded-t-[4px] border-b-[1px] border-primaryStroke bg-backgroundSecondary pl-0 pr-gutter sm:h-[52px] sm:max-h-[52px] sm:min-h-[52px] sm:min-w-[1088px] sm:pl-[14px] sm:pr-[calc(14px_+_var(--scrollbar-gutter))]">
      <div className="flex w-[150px] flex-row items-center justify-start gap-[4px] sm:w-[256px]">
        <div className="flex flex-row items-center justify-start gap-[4px] px-[12px]">
          <span className="text-[12px] font-medium text-textTertiary">
            Market
          </span>
        </div>
      </div>
      {/* chart column */}
      <div className="flex w-[56px] flex-none flex-row items-center justify-start pr-[8px] sm:w-[96px] sm:pr-[12px]">
        <span className="text-[12px] font-medium text-textTertiary" />
      </div>
      <div className="flex min-w-0 flex-1 flex-row items-center justify-start px-[12px] sm:flex-[1.15_1_0%]">
        <SortableHeader label="Price" sortKey="price" sort={sort} onSort={onSort} />
      </div>
      <div className="hidden min-w-0 flex-1 flex-row items-center justify-start px-[12px] sm:flex">
        {bonding != null ? (
          <span className="inline-flex items-center justify-center rounded-[4px] bg-increase/15 px-[8px] py-[3px] font-GeistMono text-[12px] font-semibold text-increase">
            Bonding: {(bonding * 100).toFixed(2)}%
          </span>
        ) : (
          <SortableHeader label="Open Interest" sortKey="oi" sort={sort} onSort={onSort} />
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-row items-center justify-start px-[12px]">
        <SortableHeader label="Volume" sortKey="volume" sort={sort} onSort={onSort} />
      </div>
      <div className="hidden min-w-0 flex-1 flex-row items-center justify-start px-[12px] sm:flex">
        <SortableHeader label="Trades" sortKey="trades" sort={sort} onSort={onSort} />
      </div>
      <div className="hidden min-w-0 flex-row items-center justify-start gap-[4px] px-[12px] sm:flex sm:w-[192px] sm:flex-none">
        <span className="text-[12px] font-medium text-textTertiary">
          Market Info
        </span>
      </div>
      <div className="hidden w-[64px] flex-none flex-row items-center justify-center gap-[4px] sm:flex sm:w-[72px]">
        <span className="text-[12px] font-medium text-textTertiary">Action</span>
      </div>
    </div>
  );
}

/** Sort a built row list by the active header sort (falls through unchanged). */
export function applyRowSort<T extends { mcNum: number; liqNum: number; volNum: number; txNum: number; chNum: number }>(
  rows: T[],
  sort: SortState,
): T[] {
  if (!sort) return rows;
  const keyOf = (r: T): number =>
    sort.key === "price"
      ? r.mcNum
      : sort.key === "oi"
        ? r.liqNum
        : sort.key === "volume"
          ? r.volNum
          : r.txNum;
  // dir = -1 → descending (largest first), dir = 1 → ascending
  return [...rows].sort((a, b) => (keyOf(a) - keyOf(b)) * sort.dir);
}

/** Convenience hook for pages that own the sort state. */
export function useRowSort() {
  const [sort, setSort] = useState<SortState>(null);
  const toggle = useCallback((s: SortState) => setSort(s), []);
  return { sort, setSort: toggle };
}
