import { IconChefHat, IconBoxes, IconDexPaid, IconProTrader } from "./HyzrIcons";
import type { InfoBadgeData } from "@/lib/hyzr-data";

const TONE_TEXT = {
  red: "text-primaryRed",
  green: "text-primaryGreen",
  neutral: "",
} as const;

/* Small bordered stat chip used in the "Token Info" column. */
export function InfoBadge({ badge }: { badge: InfoBadgeData }) {
  return (
    <div className="flex h-[16px] max-h-[16px] min-h-[16px] flex-row items-center justify-start gap-[4px] rounded-[4px] border-[1px] border-primaryStroke/50 bg-backgroundSecondary px-[4px] text-textSecondary sm:h-[20px] sm:max-h-[20px] sm:min-h-[20px]">
      <BadgeIcon icon={badge.icon} tone={badge.tone} />
      <span
        className={`font-GeistMono text-[10px] font-medium sm:text-[11px] ${TONE_TEXT[badge.tone]}`}
      >
        {badge.value}
      </span>
    </div>
  );
}

function BadgeIcon({ icon, tone }: { icon: string; tone: string }) {
  const cls = `${tone === "red" ? "text-primaryRed" : tone === "green" ? "text-primaryGreen" : ""} text-[10px] sm:text-[12px]`;
  if (icon === "icon-chef-hat") {
    return <IconChefHat size={10} className={cls} />;
  }
  if (icon === "icon-boxes") {
    return <IconBoxes size={10} className={cls} />;
  }
  return <i className={`${icon} ${cls}`} />;
}

/* DEX paid / unpaid chip */
export function DexPaidBadge({ paid }: { paid: "Paid" | "Unpaid" }) {
  const ok = paid === "Paid";
  return (
    <div className="flex h-[16px] max-h-[16px] min-h-[16px] flex-row items-center justify-start gap-[4px] rounded-[4px] border-[1px] border-primaryStroke/50 bg-backgroundSecondary px-[4px] text-textSecondary sm:h-[20px] sm:max-h-[20px] sm:min-h-[20px]">
      <div className="flex h-[12px] max-h-[12px] min-h-[12px] w-[12px] min-w-[12px] max-w-[12px] items-center justify-center">
        <IconDexPaid
          size={10}
          className={`${ok ? "text-primaryGreen" : "text-primaryRed"}`}
        />
      </div>
      <span
        className={`font-GeistMono text-[10px] font-medium sm:text-[11px] ${
          ok ? "text-primaryGreen" : "text-primaryRed"
        }`}
      >
        {paid}
      </span>
    </div>
  );
}

/* holder / pro-trader counts */
export function CountBadges({
  holders,
  proTraders,
}: {
  holders: string;
  proTraders: string;
}) {
  return (
    <>
      <div className="flex h-[16px] max-h-[16px] min-h-[16px] flex-row items-center justify-start gap-[4px] rounded-[4px] border-[1px] border-primaryStroke/50 bg-backgroundSecondary px-[4px] text-textSecondary sm:h-[20px] sm:max-h-[20px] sm:min-h-[20px]">
        <i className="ri-user-line text-[10px] sm:text-[12px]" />
        <span className="font-GeistMono text-[10px] font-medium sm:text-[11px]">
          {holders}
        </span>
      </div>
      <div className="flex h-[16px] max-h-[16px] min-h-[16px] flex-row items-center justify-start gap-[4px] rounded-[4px] border-[1px] border-primaryStroke/50 bg-backgroundSecondary px-[4px] text-textSecondary sm:h-[20px] sm:max-h-[20px] sm:min-h-[20px]">
        <IconProTrader size={10} className="text-[10px] sm:text-[12px]" />
        <span className="font-GeistMono text-[10px] font-medium sm:text-[11px]">
          {proTraders}
        </span>
      </div>
    </>
  );
}
