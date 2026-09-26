"use client";

import { ASSETS } from "@/lib/hyzr-data";
import { useHyzrUI, type ChainId } from "../ui/HyzrUI";
import { Popover } from "../ui/Popover";

export const CHAINS: {
  id: ChainId;
  label: string;
  img: string;
  imgSize: number;
}[] = [
  { id: "SOL", label: "Crypto", img: ASSETS.sol, imgSize: 20 },
  { id: "HOOD", label: "Equities", img: ASSETS.robinhood, imgSize: 20 },
  { id: "BNB", label: "Commodities", img: ASSETS.bnb, imgSize: 20 },
  { id: "ETH", label: "Forex", img: ASSETS.eth, imgSize: 18 },
];

/* Dropdown content — 188px panel, 52px rows, active row highlighted. */
export function ChainMenuContent({ close }: { close: () => void }) {
  const { chain, setChain } = useHyzrUI();
  return (
    <div className="w-[188px] p-[8px]">
      {CHAINS.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => {
            setChain(c.id);
            close();
          }}
          className={`flex h-[52px] w-full flex-row items-center gap-[12px] rounded-[8px] px-[12px] text-left transition-colors duration-150 ${
            chain === c.id
              ? "bg-white/[0.055]"
              : "hover:bg-white/[0.035]"
          }`}
        >
          <img
            src={c.img}
            alt={c.label}
            width={c.imgSize}
            height={c.imgSize}
          />
          <span className="text-[16px] font-semibold text-textPrimary">
            {c.label}
          </span>
        </button>
      ))}
    </div>
  );
}

/* Top-nav chain pill — SOL / HOOD / BNB / ETH dropdown. */
export function ChainSelector({ mobile = false }: { mobile?: boolean }) {
  const { chain } = useHyzrUI();
  const active = CHAINS.find((c) => c.id === chain)!;
  return (
    <Popover
      align={mobile ? "end" : "start"}
      gap={10}
      content={(close) => <ChainMenuContent close={close} />}
      button={({ open, toggle }) => (
        <button

          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={`flex h-[32px] flex-shrink-0 flex-row items-center justify-center gap-[6px] rounded-full border-[2px] pl-[8px] pr-[6px] transition-all duration-150 ease-in-out hover:brightness-125 active:scale-[0.96] ${
            open ? "brightness-125" : ""
          } ${mobile ? "" : ""}`}
          style={{ borderColor: "rgb(var(--primary-color) / 0.15)" }}
        >
          <img src={active.img} alt={active.label} width={16} height={16} />
          <span className="text-[14px] font-medium text-textPrimary">
            {active.label}
          </span>
          <i
            className={`ri-arrow-down-s-line text-[18px] text-textPrimary transition-transform duration-150 ${
              open ? "rotate-180" : ""
            }`}
          />
        </button>
      )}
    />
  );
}
