import { FloeClient } from "@floe/sdk/browser";

let _client: FloeClient | null = null;

/** Shared read-only Floe client (testnet). Action calls use the wallet signer separately.
 *  Uses a dedicated RPC when NEXT_PUBLIC_SUI_RPC_URL is set (a paid/regional endpoint avoids the
 *  public fullnode's rate limits under load); falls back to the public testnet fullnode otherwise. */
export function floeClient(): FloeClient {
  if (!_client) {
    const rpcUrl = process.env.NEXT_PUBLIC_SUI_RPC_URL || undefined;
    _client = new FloeClient({ network: "testnet", rpcUrl });
  }
  return _client;
}
