/**
 * Real on-chain balance lookups for connected wallets (fx24).
 *
 * Solana: public mainnet JSON-RPC (CORS-enabled) — getBalance for SOL and
 * getTokenAccountsByOwner for native USDC (mint EPjFW…).
 * EVM: the wallet's own injected provider — eth_getBalance on the current
 * chain plus an ERC-20 balanceOf call for USDC on chains we know the token.
 *
 * Everything fails soft: unavailable balances stay null and the UI renders
 * "—" instead of pretending.
 */
import type { Eip1193Provider, SolanaProvider } from "./walletProviders";

const SOLANA_RPC = "https://api.mainnet-beta.solana.com";
const USDC_MINT_SOLANA = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

/** USDC (6 decimals) per chainId → token address; missing chain = no quote. */
const USDC_EVM: Record<string, string> = {
  "0x1": "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // Ethereum
  "0x2105": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Base
  "0x38": "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d", // BNB Chain
  "0xa": "0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85", // Optimism
  "0x89": "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359", // Polygon
};

const CHAIN_SYMBOL: Record<string, string> = {
  "0x1": "ETH",
  "0x2105": "ETH",
  "0x38": "BNB",
  "0xa": "ETH",
  "0x89": "POL",
  "0xa4b1": "ETH", // Arbitrum
};

export type OnchainBalance = {
  native: string | null;
  usdc: string | null;
  symbol: string;
};

type RpcResponse<T> = { result?: T; error?: { message: string } };

async function solanaRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const res = await fetch(SOLANA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const json = (await res.json()) as RpcResponse<T>;
    return json.error ? null : (json.result ?? null);
  } catch {
    return null;
  }
}

function fmt(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "";
  return value.toLocaleString("en-US", { maximumFractionDigits: decimals });
}

type SolTokenAccount = {
  account: { data: { parsed: { info: { tokenAmount: { uiAmount: number | null } } } } };
};

export async function fetchSolanaBalance(address: string): Promise<OnchainBalance> {
  const [lamports, tokenAccounts] = await Promise.all([
    solanaRpc<{ value: number }>("getBalance", [address]),
    solanaRpc<{ value: SolTokenAccount[] }>(
      "getTokenAccountsByOwner",
      [address, { mint: USDC_MINT_SOLANA }, { encoding: "jsonParsed" }],
    ),
  ]);
  const sol = lamports ? lamports.value / 1e9 : null;
  const usdcUi = tokenAccounts?.value?.[0]?.account?.data?.parsed?.info?.tokenAmount?.uiAmount;
  return {
    native: sol != null ? fmt(sol, 4) : null,
    usdc: usdcUi != null ? fmt(usdcUi, 2) : null,
    symbol: "SOL",
  };
}

export async function fetchEvmBalance(
  provider: Eip1193Provider,
  address: string,
): Promise<OnchainBalance> {
  const [weiHex, chainId] = await Promise.all([
    provider.request({ method: "eth_getBalance", params: [address, "latest"] }) as Promise<string>,
    provider.request({ method: "eth_chainId" }) as Promise<string>,
  ]).catch(() => [null, null] as [string | null, string | null]);

  const native = weiHex != null ? fmt(parseInt(weiHex, 16) / 1e18, 4) : null;
  const symbol = CHAIN_SYMBOL[(chainId ?? "").toLowerCase()] ?? "ETH";

  let usdc: string | null = null;
  const token = USDC_EVM[(chainId ?? "").toLowerCase()];
  if (token && address.startsWith("0x")) {
    try {
      // balanceOf(address) selector 0x70a08231 + padded address
      const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
      const out = (await provider.request({
        method: "eth_call",
        params: [{ to: token, data }, "latest"],
      })) as string;
      usdc = fmt(parseInt(out, 16) / 1e6, 2);
    } catch {
      usdc = null;
    }
  }
  return { native, usdc, symbol };
}

/** Best-effort fetch for any wallet kind; never throws. */
export async function fetchWalletBalance(
  kind: "Phantom" | "Solflare" | "MetaMask" | "Coinbase",
  address: string,
  providers: { solana?: SolanaProvider | null; evm?: Eip1193Provider | null },
): Promise<OnchainBalance> {
  try {
    if (kind === "Phantom" || kind === "Solflare") {
      return await fetchSolanaBalance(address);
    }
    if (providers.evm) {
      return await fetchEvmBalance(providers.evm, address);
    }
  } catch {
    /* fall through to the empty result */
  }
  return { native: null, usdc: null, symbol: kind === "Phantom" || kind === "Solflare" ? "SOL" : "ETH" };
}
