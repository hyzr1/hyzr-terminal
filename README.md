# Hyzr Terminal

A cross-asset perpetuals trading workspace built on Hyperliquid. It brings crypto, equity, index, commodity, and forex markets into one terminal with charting, paper trading, wallet-connected execution, and wallet-flow research.

## What it does

- Streams market prices, funding, open interest, and volume from Hyperliquid's main and builder-deployed perpetual markets into a sortable screener.
- Provides a TradingView-style chart built with Lightweight Charts, along with market selection, order entry, positions, portfolio views, and quick execution controls.
- Runs paper orders against live order-book data by default. Live orders require explicit EVM wallet approval of a Hyperliquid agent and are signed locally before submission to Hyperliquid's exchange API.
- Pairs Phantom, Solflare, MetaMask, and Coinbase Wallet; tracks balances and maintains separate trading state for each wallet.
- Tracks large-wallet activity with a whale-flow feed, watchlists, wallet profiles, positioning, and configurable alerts.

The market universe depends on markets available through Hyperliquid's APIs. The app contains both a curated cross-asset screener and dynamic perpetual market selection.

## Stack

Next.js 16, React 19, TypeScript, Tailwind CSS 4, Prisma/SQLite, WebSockets, Server-Sent Events, and Hyperliquid APIs.

## Local setup

Use Node.js 20 or later. The repository does not include a local database, wallet data, or environment secrets.

```bash
npm install
cp .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

On Windows, copy `.env.example` to `.env` with your shell or file manager. Then open [http://localhost:3000](http://localhost:3000).

Paper trading is the default mode. Live trading involves real financial risk and requires wallet connection and agent approval in the app.

## Development

```bash
npx tsc --noEmit
npm run lint
```

The source archive used to publish this repository contained local build artifacts, caches, a development database, and an environment file; those files are deliberately excluded here.
