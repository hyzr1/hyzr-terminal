/**
 * Real wallet provider plumbing behind the Fund HYZR modal (fx23).
 *
 * Detection follows what each wallet ACTUALLY injects in 2025+:
 *  - Phantom  → `window.phantom.solana` (legacy fallback `window.solana` when isPhantom)
 *  - Solflare → `window.solflare` (isSolflare) — Solflare does NOT inject window.solana
 *  - MetaMask → EIP-6963 announcement rdns "io.metamask", legacy `window.ethereum.isMetaMask`
 *               or `window.ethereum.providers[]` when several EVM wallets coexist
 *  - Coinbase → EIP-6963 rdns "com.coinbase.wallet", legacy `window.coinbaseWalletExtension`
 *
 * The old code pointed Solflare at window.solana and Coinbase at the generic
 * window.ethereum, so clicking Solflare connected Phantom and clicking Coinbase
 * connected MetaMask. This module gives each button its own real provider plus
 * account-change tracking, silent reconnect semantics and install URLs.
 */
import { useWalletStore, type WalletKind } from "./walletStore";

/* ------------------------------------------------------------------ */
/* provider shapes (minimal, no external deps)                         */
/* ------------------------------------------------------------------ */

export type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
  on?: (event: string, cb: (...args: never[]) => void) => void;
  removeListener?: (event: string, cb: (...args: never[]) => void) => void;
};

export type SolanaProvider = {
  isPhantom?: boolean;
  isSolflare?: boolean;
  isConnected?: boolean;
  connect: (opts?: { onlyIfTrusted?: boolean }) => Promise<{
    publicKey: { toString(): string } | string | null | undefined;
  }>;
  disconnect?: () => Promise<void>;
  publicKey?: { toString(): string } | null;
  on?: (event: string, cb: (...args: never[]) => void) => void;
  removeListener?: (event: string, cb: (...args: never[]) => void) => void;
};

type EvmEntry = Eip1193Provider & {
  isMetaMask?: boolean;
  isCoinbaseWallet?: boolean;
  providers?: EvmEntry[];
};

type ProviderWindow = Window &
  typeof globalThis & {
    phantom?: { solana?: SolanaProvider; ethereum?: Eip1193Provider };
    solana?: SolanaProvider;
    solflare?: SolanaProvider;
    ethereum?: EvmEntry;
    coinbaseWalletExtension?: EvmEntry;
  };

/* ------------------------------------------------------------------ */
/* per-wallet metadata                                                 */
/* ------------------------------------------------------------------ */

export const WALLET_META: Record<WalletKind, { installUrl: string }> = {
  Phantom: { installUrl: "https://phantom.app/download" },
  Solflare: { installUrl: "https://solflare.com/download" },
  MetaMask: { installUrl: "https://metamask.io/download/" },
  Coinbase: { installUrl: "https://www.coinbase.com/wallet/downloads" },
};

/** Error carrying an optional official install URL (not-installed case). */
export class WalletNotInstalledError extends Error {
  installUrl: string;
  constructor(kind: WalletKind) {
    super(`${kind} is not installed in this browser`);
    this.installUrl = WALLET_META[kind].installUrl;
  }
}

/* ------------------------------------------------------------------ */
/* EIP-6963 multi-wallet discovery (MetaMask / Coinbase / others)      */
/* ------------------------------------------------------------------ */

type Eip6963Detail = {
  info: { uuid: string; name: string; icon: string; rdns: string };
  provider: Eip1193Provider;
};

const eip6963 = new Map<string, Eip1193Provider>();
let discoveryRequested = false;

function requestDiscovery() {
  if (discoveryRequested || typeof window === "undefined") return;
  discoveryRequested = true;
  window.addEventListener(
    "eip6963:announceProvider",
    (event) => {
      const detail = (event as CustomEvent<Eip6963Detail>).detail;
      if (detail?.info?.rdns && detail.provider) {
        eip6963.set(detail.info.rdns, detail.provider);
      }
    },
  );
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/** Fires the EIP-6963 request and waits a beat for announcements. */
async function ensureDiscovery(): Promise<void> {
  if (typeof window === "undefined") return;
  requestDiscovery();
  await new Promise((resolve) => setTimeout(resolve, 120));
}

/* ------------------------------------------------------------------ */
/* detection                                                           */
/* ------------------------------------------------------------------ */

export function detectWallet(kind: WalletKind): SolanaProvider | Eip1193Provider | null {
  if (typeof window === "undefined") return null;
  const w = window as ProviderWindow;

  if (kind === "Phantom") {
    if (w.phantom?.solana?.isPhantom) return w.phantom.solana;
    if (w.solana?.isPhantom) return w.solana; // legacy injection
    return null;
  }
  if (kind === "Solflare") {
    return w.solflare?.isSolflare ? w.solflare : null;
  }

  requestDiscovery();
  if (kind === "MetaMask") {
    const announced = eip6963.get("io.metamask");
    if (announced) return announced;
    if (w.ethereum?.isMetaMask) return w.ethereum;
    return w.ethereum?.providers?.find((p) => p.isMetaMask) ?? null;
  }
  // Coinbase
  const announced = eip6963.get("com.coinbase.wallet");
  if (announced) return announced;
  if (w.coinbaseWalletExtension) return w.coinbaseWalletExtension;
  if (w.ethereum?.isCoinbaseWallet) return w.ethereum;
  return w.ethereum?.providers?.find((p) => p.isCoinbaseWallet) ?? null;
}

export function isWalletDetected(kind: WalletKind): boolean {
  return detectWallet(kind) !== null;
}

/* ------------------------------------------------------------------ */
/* account-change watchers (keep the UI honest after connect)          */
/* ------------------------------------------------------------------ */

const unwatchers = new Map<WalletKind, () => void>();

function setWatcher(kind: WalletKind, fn: () => void) {
  unwatchers.get(kind)?.();
  unwatchers.set(kind, fn);
}

function unwatchAllExcept(kind: WalletKind) {
  for (const [other, fn] of unwatchers) {
    if (other !== kind) {
      fn();
      unwatchers.delete(other);
    }
  }
}

export function unwatchWallet(kind: WalletKind) {
  const fn = unwatchers.get(kind);
  if (fn) {
    fn();
    unwatchers.delete(kind);
  }
}

function watchEvmAccount(kind: WalletKind, provider: Eip1193Provider, initial: string) {
  if (!provider.on) return;
  const handler = (...args: never[]) => {
    const accounts = (args[0] as unknown as string[]) ?? [];
    if (accounts.length === 0) {
      useWalletStore.getState().disconnect(initial);
      unwatchWallet(kind);
    } else if (accounts[0] && accounts[0].toLowerCase() !== initial.toLowerCase()) {
      useWalletStore.getState().connect(kind, accounts[0]);
    }
  };
  provider.on("accountsChanged", handler as never);
  setWatcher(kind, () => provider.removeListener?.("accountsChanged", handler as never));
}

function watchSolanaAccount(kind: WalletKind, provider: SolanaProvider, initial: string) {
  if (!provider.on) return;
  const handler = (...args: never[]) => {
    const pk = args[0] as unknown as { toString(): string } | null | undefined;
    if (!pk) {
      useWalletStore.getState().disconnect(initial);
      unwatchWallet(kind);
    } else {
      const next = typeof pk === "string" ? pk : pk.toString();
      if (next && next !== initial) useWalletStore.getState().connect(kind, next);
    }
  };
  provider.on("accountChanged", handler as never);
  setWatcher(kind, () => provider.removeListener?.("accountChanged", handler as never));
}

/* ------------------------------------------------------------------ */
/* connect / disconnect                                                */
/* ------------------------------------------------------------------ */

function normalizeError(kind: WalletKind, error: unknown): Error {
  const err = error as { code?: number; message?: string };
  if (err?.code === 4001) {
    return new Error(`${kind} request was rejected`);
  }
  if (err?.code === -32002) {
    return new Error(`A ${kind} request is already open — check the wallet popup`);
  }
  const message = err?.message || "Wallet connection failed";
  return new Error(message);
}

/**
 * Connects the REAL provider for `kind` and returns the account address.
 * Throws WalletNotInstalledError (with installUrl) when the extension is absent.
 */
export async function connectWallet(
  kind: WalletKind,
): Promise<{ address: string; provider: SolanaProvider | Eip1193Provider }> {
  await ensureDiscovery();
  const provider = detectWallet(kind);
  if (!provider) throw new WalletNotInstalledError(kind);

  try {
    if (kind === "Phantom" || kind === "Solflare") {
      const sol = provider as SolanaProvider;
      const res = await sol.connect();
      const raw = res?.publicKey;
      const address = typeof raw === "string" ? raw : raw?.toString();
      if (!address) throw new Error("No wallet account was returned");
      unwatchAllExcept(kind);
      watchSolanaAccount(kind, sol, address);
      return { address, provider: sol };
    }

    const evm = provider as Eip1193Provider;
    const accounts = (await evm.request({ method: "eth_requestAccounts" })) as string[];
    if (!accounts?.[0]) throw new Error("No wallet account was returned");
    unwatchAllExcept(kind);
    watchEvmAccount(kind, evm, accounts[0]);
    return { address: accounts[0], provider: evm };
  } catch (error) {
    throw normalizeError(kind, error);
  }
}

/** Clears app state and best-effort tells the provider to disconnect too. */
export async function disconnectWallet(kind?: WalletKind | null): Promise<void> {
  if (kind) unwatchWallet(kind);
  if (kind) {
    try {
      const provider = detectWallet(kind);
      if (kind === "Phantom" || kind === "Solflare") {
        await (provider as SolanaProvider | null)?.disconnect?.();
      }
      // EIP-1193 has no dapp-initiated disconnect — clearing local state is the norm.
    } catch {
      /* provider already gone — local state is cleared regardless */
    }
  }
}

/* ------------------------------------------------------------------ */
/* ownership proof (fx24) — real signature challenge                   */
/* ------------------------------------------------------------------ */

export const VERIFY_CHALLENGE_PREFIX = "HYZR — verify wallet ownership\n";

/**
 * Proves the user still controls `address` by signing a challenge with the
 * SAME provider the wallet was paired through. Solana wallets use
 * signMessage(bytes, "utf8"); EVM wallets use personal_sign.
 * Resolves true only when a signature actually came back.
 */
export async function verifyOwnership(kind: WalletKind, address: string): Promise<boolean> {
  await ensureDiscovery();
  const provider = detectWallet(kind);
  if (!provider) throw new WalletNotInstalledError(kind);

  const message = `${VERIFY_CHALLENGE_PREFIX}${address}\nnonce: ${Date.now()}`;
  try {
    if (kind === "Phantom" || kind === "Solflare") {
      const sol = provider as SolanaProvider & {
        signMessage?: (message: Uint8Array, encoding?: string) => Promise<unknown>;
      };
      if (!sol.signMessage) throw new Error(`${kind} did not offer message signing`);
      await sol.signMessage(new TextEncoder().encode(message), "utf8");
      return true;
    }
    const evm = provider as Eip1193Provider;
    const hex = `0x${Array.from(new TextEncoder().encode(message))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")}`;
    await evm.request({ method: "personal_sign", params: [hex, address] });
    return true;
  } catch (error) {
    throw normalizeError(kind, error);
  }
}

/** The raw EIP-1193 provider for an EVM wallet kind (balances / typed-data). */
export function evmProviderFor(kind: WalletKind): Eip1193Provider | null {
  if (kind !== "MetaMask" && kind !== "Coinbase") return null;
  const provider = detectWallet(kind);
  return (provider as Eip1193Provider | null) ?? null;
}

export function isSolanaKind(kind: WalletKind): boolean {
  return kind === "Phantom" || kind === "Solflare";
}

