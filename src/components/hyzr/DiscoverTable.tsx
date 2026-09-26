"use client";

import { useCallback, useState } from "react";
import type { RowModel } from "./live/toRow";
import TableHeader, { type SortState } from "./TableHeader";
import TokenRow from "./TokenRow";

/* The bordered grid: sticky header + scrollable rows (mobile & desktop).
   Rows are built from the live feed and passed in sorted. Hovering a
   bonding-curve row lifts its green "Bonding: XX%" pill into the header
   (Liquidity slot), 1:1 with the reference screenshots. */
export default function DiscoverTable({
  rows,
  sort,
  onSort,
}: {
  rows: RowModel[];
  sort?: SortState;
  onSort?: (s: SortState) => void;
}) {
  const [hoverBond, setHoverBond] = useState<number | null>(null);
  const clearBond = useCallback(() => setHoverBond(null), []);

  return (
    <div
      className="flex h-full w-full min-w-[0px] max-w-[1420px] flex-col items-start justify-start overflow-x-auto overflow-y-hidden rounded-[8px] border-[1px] border-primaryStroke bg-backgroundSecondary sm:rounded-[4px]"
      style={{
        display: "grid",
        gridTemplateRows: "auto minmax(0px, 1fr)",
        gridTemplateColumns: "1fr",
      }}
      onMouseLeave={clearBond}
    >
      <TableHeader bonding={hoverBond} sort={sort} onSort={onSort} />
      <section aria-label="Table content" className="flex h-full w-full flex-1">
        <div className="scroll-gutter-stable flex w-full min-w-0 max-w-[1420px] flex-1 overflow-y-auto overflow-x-hidden sm:min-w-[1088px]">
          <div className="relative w-full">
            {(!rows || rows.length === 0) && (
              /* pre-first-frame skeleton — SSE primes within ~1.5s, never blocks interaction */
              <div aria-hidden className="relative w-full">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-[68px] max-h-[68px] min-h-[68px] w-full items-center border-b border-primaryStroke/40 px-[12px]"
                    style={{ opacity: 1 - i * 0.07 }}
                  >
                    <div className="flex items-center gap-[10px]">
                      <div className="h-[32px] w-[32px] animate-pulse rounded-full bg-primaryStroke/40" />
                      <div className="flex flex-col gap-[6px]">
                        <div className="h-[10px] w-[118px] animate-pulse rounded-[3px] bg-primaryStroke/40" />
                        <div className="h-[8px] w-[74px] animate-pulse rounded-[3px] bg-primaryStroke/25" />
                      </div>
                    </div>
                    <div className="ml-auto flex items-center gap-[28px]">
                      <div className="h-[10px] w-[62px] animate-pulse rounded-[3px] bg-primaryStroke/35" />
                      <div className="h-[10px] w-[54px] animate-pulse rounded-[3px] bg-primaryStroke/35" />
                      <div className="h-[10px] w-[46px] animate-pulse rounded-[3px] bg-primaryStroke/35" />
                      <div className="h-[22px] w-[52px] animate-pulse rounded-[6px] bg-primaryStroke/25" />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {(rows ?? []).map((token) => (
              <TokenRow
                key={token.id}
                token={token}
                onBondingHover={setHoverBond}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
