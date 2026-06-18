import { FloeClient } from "@floe/sdk/browser";

let _client: FloeClient | null = null;

/** Shared read-only Floe client (testnet). Action calls use the wallet signer separately. */
export function floeClient(): FloeClient {
  if (!_client) _client = new FloeClient({ network: "testnet" });
  return _client;
}
