// scripts/src/lib/sui.ts
//
// Centralized Sui client construction. Reads RPC URL from .env with a
// fallback chain of public endpoints, so a single endpoint outage doesn't
// kill the whole workflow.

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

// Ordered by preference. First entry that's reachable wins.
const RPC_CANDIDATES: string[] = [
  process.env.SUI_RPC_URL,
  'https://api.blockeden.xyz/sui/testnet',
  'https://rpc.testnet.suiscan.xyz',
  'https://sui-testnet-endpoint.blockvision.org',
  getFullnodeUrl('testnet'),  // official, last because it's been flaky
].filter((u): u is string => typeof u === 'string' && u.length > 0);

async function pingRpc(url: string, timeoutMs = 3000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'sui_getChainIdentifier',
        params: [],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Resolve a working Sui testnet RPC URL by trying candidates in order.
 * Returns the first one that responds successfully.
 */
export async function resolveRpcUrl(): Promise<string> {
  for (const url of RPC_CANDIDATES) {
    if (await pingRpc(url)) {
      console.log(`✓ Using RPC: ${url}`);
      return url;
    }
    console.log(`✗ RPC unreachable: ${url}`);
  }
  throw new Error(
    'No working Sui testnet RPC found. Check your network or update RPC_CANDIDATES.',
  );
}

/**
 * Construct a SuiClient against the first reachable RPC. Use this everywhere
 * instead of `new SuiClient({ url: getFullnodeUrl('testnet') })`.
 */
export async function makeSuiClient(): Promise<SuiClient> {
  const url = await resolveRpcUrl();
  return new SuiClient({ url });
}