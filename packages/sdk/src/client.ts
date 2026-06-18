import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import type { Signer } from '@mysten/sui/cryptography';
import { FLOE_ADDRESSES, type FloeNetwork } from './constants.ts';

export interface FloeClientConfig {
  network?: FloeNetwork;
  /** Optional custom RPC; defaults to the network's public fullnode. */
  rpcUrl?: string;
  /** Optional signer — required only for action helpers (deposit/withdraw/deploy). */
  signer?: Signer;
}

/** The Floe SDK entry point. Wraps a SuiJsonRpcClient + the canonical addresses. */
export class FloeClient {
  readonly network: FloeNetwork;
  readonly sui: SuiJsonRpcClient;
  readonly addresses: (typeof FLOE_ADDRESSES)[FloeNetwork];
  readonly signer?: Signer;

  constructor(config: FloeClientConfig = {}) {
    this.network = config.network ?? 'testnet';
    this.sui = new SuiJsonRpcClient({ url: config.rpcUrl ?? getJsonRpcFullnodeUrl(this.network), network: this.network });
    this.addresses = FLOE_ADDRESSES[this.network];
    this.signer = config.signer;
  }

  /** The signer's address, if a signer was provided. */
  get address(): string | undefined {
    return this.signer?.toSuiAddress();
  }

  target(fn: string): string {
    return `${this.addresses.package}::${this.addresses.module}::${fn}`;
  }
}
