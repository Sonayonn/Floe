/**
 * Floe engine — configured clients.
 *
 * One construction site for SuiClient + DeepBookClient + SuiPythClient.
 * The DeepBookClient inherits testnetCoins (SUI/DBUSDC PriceInfoObjects already
 * populated) and testnetPythConfigs from the SDK — which is what unblocks
 * Stratum C's margin borrow.
 */

import { SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { DeepBookClient } from '@mysten/deepbook-v3';
import { SuiPythClient } from '@pythnetwork/pyth-sui-js/client';
import { SuiPriceServiceConnection } from '@pythnetwork/pyth-sui-js/SuiPriceServiceConnection';

import { RPC_URL, SUI_PRIVATE_KEY, DEEPBOOK, PYTH } from '../config';

export interface Clients {
  sui: SuiClient;
  deepbook: DeepBookClient;
  pyth: SuiPythClient;
  hermes: SuiPriceServiceConnection;
  signer: Ed25519Keypair;
  address: string;
}

export function makeClients(): Clients {
  const sui = new SuiClient({ url: RPC_URL });

  const { secretKey } = decodeSuiPrivateKey(SUI_PRIVATE_KEY);
  const signer = Ed25519Keypair.fromSecretKey(secretKey);
  const address = signer.toSuiAddress();

  // No `coins` arg → inherits testnetCoins (SUI/DBUSDC have priceInfoObjectId
  // populated). No `pools` arg → inherits testnetPools (SUI_DBUSDC etc).
  // This is the detail the Day-6 wall came down to.
  const deepbook = new DeepBookClient({
    client: sui,
    address,
    env: 'testnet',
    balanceManagers: {
      FLOE: { address: DEEPBOOK.balanceManagerId },
    },
    marginManagers: {
      FLOE_HEDGE: {
        address: DEEPBOOK.marginManagerId,
        poolKey: 'SUI_DBUSDC',
      },
    },
  });

  const pyth = new SuiPythClient(sui, PYTH.stateId, PYTH.wormholeStateId);
  const hermes = new SuiPriceServiceConnection(PYTH.hermesUrl);

  return { sui, deepbook, pyth, hermes, signer, address };
}