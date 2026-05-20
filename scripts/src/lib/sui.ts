// scripts/src/lib/sui.ts
//
// Centralized Sui client construction with RPC failover and rate-limit retry.

import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';

const RPC_CANDIDATES: string[] = [
  process.env.SUI_RPC_URL,
  'https://fullnode.testnet.sui.io:443',
  'https://sui-testnet.public.blastapi.io',
  'https://sui-testnet-rpc.publicnode.com',
  'https://sui-testnet.nodeinfra.com',
  'https://sui-testnet-endpoint.blockvision.org',
  'https://rpc.testnet.suiscan.xyz',
  'https://api.blockeden.xyz/sui/testnet',
  getFullnodeUrl('testnet'),
].filter((u): u is string => typeof u === 'string' && u.length > 0);

async function pingRpc(url: string, timeoutMs = 4000): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0', id: 1, method: 'sui_getChainIdentifier', params: [],
      }),
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export async function resolveRpcUrl(): Promise<string> {
  for (const url of RPC_CANDIDATES) {
    if (await pingRpc(url)) {
      console.log(`✓ Using RPC: ${url}`);
      return url;
    }
    console.log(`✗ RPC unreachable: ${url}`);
  }
  throw new Error('No working Sui testnet RPC found.');
}

/**
 * SuiClient subclass that auto-retries on rate-limit errors with backoff,
 * and falls back through the RPC candidate list if a node goes down mid-session.
 */
class RetryingSuiClient extends SuiClient {
  private currentUrl: string;
  private maxRetries = 4;

  constructor(url: string) {
    super({ url });
    this.currentUrl = url;
  }

  async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err: any) {
        lastErr = err;
        const status = err?.status ?? err?.cause?.status;
        const isRateLimit = status === 429;
        const isServerErr = status >= 500 && status < 600;
        const isNetworkErr = err?.message?.includes('fetch failed') || err?.cause?.code === 'ENOTFOUND';

        if (!isRateLimit && !isServerErr && !isNetworkErr) throw err;

        const backoffMs = Math.min(1000 * 2 ** attempt, 8000);
        console.warn(`  Retry ${attempt + 1}/${this.maxRetries} after ${backoffMs}ms (status=${status ?? 'network'})`);
        await new Promise((r) => setTimeout(r, backoffMs));
      }
    }
    throw lastErr;
  }
}

export async function makeSuiClient(): Promise<SuiClient> {
  const url = await resolveRpcUrl();
  const client = new RetryingSuiClient(url);

  // Wrap only methods that actually exist on the client. Method names
  // shift across SDK versions; skip silently rather than crash on missing.
  const methodsToWrap = [
    'getNormalizedMoveFunction',
    'getCoins',
    'getObject',
    'multiGetObjects',
    'signAndExecuteTransaction',
    'devInspectTransactionBlock',
  ] as const;

  for (const method of methodsToWrap) {
    const orig = (client as any)[method];
    if (typeof orig !== 'function') continue;
    const bound = orig.bind(client);
    (client as any)[method] = (...args: any[]) =>
      (client as RetryingSuiClient).withRetry(() => bound(...args));
  }
  return client;
}