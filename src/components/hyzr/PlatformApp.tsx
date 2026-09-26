"use client";

import TopNav from "./TopNav";
import TickerBar from "./TickerBar";
import MobileDiscover from "./MobileDiscover";
import DesktopDiscover from "./DesktopDiscover";
import PerpsPage from "./perps/PerpsPage";
import TrackerPage from "./tracker/TrackerPage";
import PortfolioPage from "./portfolio/PortfolioPage";
import RewardsPage from "./rewards/RewardsPage";
import FooterBar from "./FooterBar";
import { useHyzrUI } from "./ui/HyzrUI";

/* Full-viewport platform shell — mirrors the original
   `.platform-app-shell h-screen-safe flex flex-col overflow-hidden`.
   Providers live in the root layout so client state (WS/SSE, stores)
   survives client-side navigation between page URLs. */
function Shell() {
  const { page, tickerHidden } = useHyzrUI();
  /* fx17 — NO page reserves a band for the dock, on ANY route (incl. the
     trade terminal): the footer pill carries its own glass fill, and the
     area around it is always just the page continuing to the bottom edge.
     Trade panels keep controls clear of the dock with internal padding
     (TradePanel lg:pb, positions-row scroll pb, mobile column pb) instead
     of a full-width spacer strip. */
  return (
    <div className="platform-app-shell h-screen-safe flex flex-col overflow-hidden">
      <div id="platform-layout">
        <TopNav />
      </div>
      {!tickerHidden &&
      (page === "perpetuals" || page === "trackers" || page === "portfolio") ? null : !tickerHidden ? (
        <TickerBar />
      ) : null}
      <div className="relative flex min-h-0 flex-1 flex-row overflow-hidden">
        <div
          id="platform-layout-container"
          className="relative flex min-h-0 flex-1 overflow-auto"
        >
          {page === "rewards" ? (
            <RewardsPage />
          ) : page === "perpetuals" ? (
            <PerpsPage />
          ) : page === "trackers" ? (
            <TrackerPage />
          ) : page === "portfolio" ? (
            <PortfolioPage />
          ) : (
            <>
              <MobileDiscover />
              <DesktopDiscover />
            </>
          )}
        </div>
      </div>
      <FooterBar />
    </div>
  );
}

export default function PlatformApp() {
  return (
    <>
      <Shell />
    </>
  );
}
