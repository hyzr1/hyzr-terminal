"use client";
/**
 * Hyperliquid L1 action signing (EIP-712 "Exchange" domain, chainId 1337).
 * Used for live trading when the user supplies an API/agent private key.
 * Reference: Hyperliquid "Signing Details" docs + python/js SDKs.
 */
import { Wallet, keccak256, toUtf8Bytes, Signature, toBeHex, zeroPadValue } from "ethers";

type Prim = string | number | boolean | null | Prim[] | { [k: string]: Prim };

/* ------------------------- minimal RLP ---------------------------- */

function bigIntToBytes(n: bigint): Uint8Array {
  if (n === BigInt(0)) return new Uint8Array(0);
  const hex = n.toString(16);
  const even = hex.length % 2 ? `0${hex}` : hex;
  const out = new Uint8Array(even.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(even.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function withLen(payload: Uint8Array, offset: number, scalarSingle = false): Uint8Array {
  // scalar single byte < 0x80 encodes as itself; strings always length-prefixed
  if (scalarSingle && payload.length === 1 && payload[0] < 0x80) return payload;
  if (payload.length < 56) {
    const out = new Uint8Array(payload.length + 1);
    out[0] = offset + payload.length;
    out.set(payload, 1);
    return out;
  }
  const lenBytes = bigIntToBytes(BigInt(payload.length));
  const out = new Uint8Array(1 + lenBytes.length + payload.length);
  out[0] = offset + 55 + lenBytes.length;
  out.set(lenBytes, 1);
  out.set(payload, 1 + lenBytes.length);
  return out;
}

function rlpEncode(item: Prim): Uint8Array {
  if (item === null) return new Uint8Array([0x80]);
  if (typeof item === "boolean") return new Uint8Array(item ? [0x01] : [0x80]);
  if (typeof item === "number") {
    const bytes = bigIntToBytes(BigInt(item));
    if (bytes.length === 0) return new Uint8Array([0x80]);
    return withLen(bytes, 0x80, true);
  }
  if (typeof item === "string") {
    // HL encodes strings as UTF-8 bytes (price/size decimal strings)
    return withLen(toUtf8Bytes(item), 0x80);
  }
  if (Array.isArray(item)) {
    const payload = concatChunks(item.map(rlpEncode));
    return withLen(payload, 0xc0);
  }
  // object → list of [key, value] pairs sorted by key (HL canonical form)
  const keys = Object.keys(item).sort();
  const pairs: Prim[] = keys.map((k) => [k, (item as { [kk: string]: Prim })[k]]);
  const payload = concatChunks(pairs.map(rlpEncode));
  return withLen(payload, 0xc0);
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) { out.set(c, o); o += c.length; }
  return out;
}

/* ------------------------- EIP-712 signing ------------------------ */

const EXCHANGE_DOMAIN = { name: "Exchange", version: "1", chainId: 1337 };
const AGENT_TYPES = {
  Agent: [
    { name: "source", type: "string" },
    { name: "connectionId", type: "bytes32" },
  ],
};

export async function signL1Action(
  agentKey: string,
  action: unknown,
  nonce: number,
  isMainnet: boolean,
): Promise<{ r: string; s: string; v: number }> {
  const wallet = new Wallet(agentKey.startsWith("0x") ? agentKey : `0x${agentKey}`);
  const encoded = rlpEncode([action as Prim, nonce]);
  const hash = keccak256(encoded);
  const sig = await wallet.signTypedData(
    EXCHANGE_DOMAIN,
    AGENT_TYPES,
    { source: isMainnet ? "a" : "b", connectionId: hash },
  );
  const parsed = Signature.from(sig);
  return {
    r: zeroPadValue(toBeHex(parsed.r), 32),
    s: zeroPadValue(toBeHex(parsed.s), 32),
    v: parsed.v,
  };
}

/* ------------------------- order helpers -------------------------- */

export interface LiveOrderArgs {
  agentKey: string;
  testnet: boolean;
  coin: string;
  assetIndex: number;
  isBuy: boolean;
  sz: number;
  px: number;
  tif: "Gtc" | "Ioc";
  reduceOnly: boolean;
  meta: { name: string; maxLeverage: number; szDecimals: number };
}

/** Round price per HL rule: ≤5 significant figures, ≤(6 - szDecimals) decimals. */
function hlPx(px: number, szDecimals: number): string {
  const maxDec = Math.max(0, 6 - szDecimals);
  const intDigits = Math.max(1, Math.floor(Math.log10(Math.abs(px)) + 1));
  const d = Math.max(0, Math.min(maxDec, 5 - intDigits));
  return px.toFixed(d);
}

export async function sendLiveOrder(a: LiveOrderArgs): Promise<{ ok: boolean; error?: string }> {
  const { hlExchange } = await import("./api");
  const order = {
    a: a.assetIndex,
    b: a.isBuy,
    p: hlPx(a.px, a.meta.szDecimals),
    s: a.sz.toFixed(a.meta.szDecimals),
    r: a.reduceOnly,
    t: { limit: { tif: a.tif } },
  };
  const action = { type: "order", orders: [order], grouping: "na" };
  const nonce = Date.now();
  const signature = await signL1Action(a.agentKey, action, nonce, !a.testnet);
  const res = await hlExchange({ action, nonce, signature }, a.testnet);
  const status = (res as { response?: { data?: { statuses?: Array<{ error?: string; resting?: { oid: number } }> } } })
    ?.response?.data?.statuses?.[0];
  if (status?.error) return { ok: false, error: status.error };
  return { ok: true };
}

export async function sendLiveLeverage(
  agentKey: string,
  testnet: boolean,
  assetIndex: number,
  isCross: boolean,
  leverage: number,
): Promise<{ ok: boolean; error?: string }> {
  const { hlExchange } = await import("./api");
  const action = { type: "updateLeverage", asset: assetIndex, isCross, leverage };
  const nonce = Date.now();
  const signature = await signL1Action(agentKey, action, nonce, !testnet);
  await hlExchange({ action, nonce, signature }, testnet);
  return { ok: true };
}

export function agentAddressFromKey(key: string): string {
  const wallet = new Wallet(key.startsWith("0x") ? key : `0x${key}`);
  return wallet.address;
}

/* ------------------------------------------------------------------ */
/* browser-wallet → Hyperliquid agent connection (fx24)                */
/*                                                                     */
/* Hyperliquid live trading signs orders with an AGENT key. The real   */
/* connect flow: generate an agent keypair locally, have the user's    */
/* browser wallet approve it by signing the HyperliquidSignTransaction */
/* "Agent" typed data (source + connectionId = agent address bytes32), */
/* then POST the approval to /api/approveAgent. From then on the       */
/* existing sendLiveOrder path works with the generated key.           */
/* ------------------------------------------------------------------ */

const HL_SIGN_DOMAIN = { name: "HyperliquidSignTransaction", version: "1", chainId: 1337 };

export function createAgentKeypair(): { key: string; address: string } {
  const wallet = Wallet.createRandom();
  return { key: wallet.privateKey, address: wallet.address };
}

/**
 * Asks the connected EVM wallet to approve `agentAddress` as a Hyperliquid
 * agent for the user's account. `userAddress` must be the wallet account the
 * signature is requested from.
 */
export async function approveAgentWithBrowserWallet(args: {
  userAddress: string;
  agentAddress: string;
  testnet: boolean;
  /** EIP-1193 request fn from the connected wallet's own provider */
  request: (args2: { method: string; params?: unknown[] | object }) => Promise<unknown>;
}): Promise<{ ok: boolean; error?: string }> {
  const connectionId = zeroPadValue(toBeHex(args.agentAddress), 32);
  const typedData = {
    // wallets derive EIP712Domain from `domain` — never include it in types
    types: { Agent: AGENT_TYPES.Agent },
    primaryType: "Agent",
    domain: HL_SIGN_DOMAIN,
    message: { source: args.testnet ? "b" : "a", connectionId },
  };

  let rawSig: string;
  try {
    rawSig = (await args.request({
      method: "eth_signTypedData_v4",
      params: [args.userAddress, JSON.stringify(typedData)],
    })) as string;
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err?.code === 4001) return { ok: false, error: "Agent approval was rejected" };
    return { ok: false, error: err?.message || "Signing failed in the wallet" };
  }

  try {
    const parsed = Signature.from(rawSig);
    const signature = {
      r: zeroPadValue(toBeHex(parsed.r), 32),
      s: zeroPadValue(toBeHex(parsed.s), 32),
      v: parsed.v,
    };

    const { hlBase } = await import("./api");
    const res = await fetch(`${hlBase(args.testnet)}/api/approveAgent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agentAddress: args.agentAddress, agentName: null, signature }),
    });
    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      response?: string | { error?: string };
    };
    if (!res.ok || json.status !== "ok") {
      const detail =
        typeof json.response === "string" ? json.response : json.response?.error || `HTTP ${res.status}`;
      return { ok: false, error: `Hyperliquid rejected the approval: ${detail}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "approveAgent request failed" };
  }
}
