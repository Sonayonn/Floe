/**
 * Seal — strategy-parameter privacy for Floe vaults.
 *
 * A curator's StrategyConfig (strike width, hedge band, rebalance cadence — the alpha)
 * is Seal-encrypted under threshold IBE; the ciphertext is stored on-chain in the vault's
 * strategy_config_blob. Decryption is gated by an on-chain seal_approve_* policy: ONLY a
 * holder of the vault's CuratorCap (or a non-revoked authorized agent's ExecCap) can decrypt.
 *
 * This is the SAME capability system that gates execution, now gating secrets — revoke an
 * agent and it loses both. Private alpha + provable execution, composed: only on Sui.
 */
import { SealClient, SessionKey } from '@mysten/seal';
import { Transaction } from '@mysten/sui/transactions';
import { fromHex, toHex } from '@mysten/sui/utils';
import type { FloeClient } from '../client.ts';

/** Build a SealClient from the verified testnet open-mode key servers. */
function sealClient(floe: FloeClient): SealClient {
  const ks = floe.addresses.seal.keyServers;
  return new SealClient({
    suiClient: floe.sui as any,
    serverConfigs: ks.map((objectId) => ({ objectId, weight: 1 })),
    verifyKeyServers: false, // open-mode testnet servers; skip extra round-trips
  });
}

/** The Seal identity for a vault = its id bytes (matches seal_id_matches on-chain). */
function vaultSealId(vaultId: string): string {
  // id arg to encrypt/seal_approve is a hex string of the vault id's raw bytes
  return toHex(fromHex(vaultId.replace(/^0x/, '')));
}

/** Encrypt a curator StrategyConfig. Returns ciphertext bytes (store via setStrategyBlob). */
export async function encryptStrategy(
  floe: FloeClient,
  vaultId: string,
  config: Record<string, unknown>,
): Promise<Uint8Array> {
  const client = sealClient(floe);
  const data = new TextEncoder().encode(JSON.stringify(config));
  const { encryptedObject } = await client.encrypt({
    threshold: floe.addresses.seal.threshold,
    packageId: floe.addresses.packageOriginal,
    id: vaultSealId(vaultId),
    data,
  });
  return encryptedObject;
}

/** Store the Seal ciphertext on-chain in the vault (CuratorCap-gated). */
export async function setStrategyBlob(
  floe: FloeClient,
  opts: { vaultId: string; curatorCap: string; ciphertext: Uint8Array; types: [string, string] },
): Promise<string> {
  if (!floe.signer) throw new Error('setStrategyBlob requires the curator signer');
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.package}::${a.module}::set_strategy_blob`,
    typeArguments: opts.types,
    arguments: [
      tx.object(opts.vaultId),
      tx.object(opts.curatorCap),
      tx.pure.vector('u8', Array.from(opts.ciphertext)),
    ],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`set_strategy_blob failed: ${res.effects?.status?.error}`);
  }
  return res.digest;
}

/** Read the stored ciphertext back from the vault. */
export async function getStrategyBlob(floe: FloeClient, vaultId: string): Promise<Uint8Array> {
  const o = await floe.sui.getObject({ id: vaultId, options: { showContent: true } });
  const bytes = ((o.data?.content as any)?.fields?.strategy_config_blob ?? []) as number[];
  return new Uint8Array(bytes);
}

/**
 * Decrypt as the curator. Builds a SessionKey (curator signer), a PTB invoking
 * seal_approve_curator, and decrypts. Returns the parsed StrategyConfig.
 */
export async function decryptStrategyAsCurator(
  floe: FloeClient,
  opts: { vaultId: string; curatorCap: string; ciphertext: Uint8Array; types: [string, string] },
): Promise<Record<string, unknown>> {
  if (!floe.signer) throw new Error('decryptStrategyAsCurator requires the curator signer');
  const a = floe.addresses;
  const client = sealClient(floe);

  const sessionKey = await SessionKey.create({
    address: floe.signer.toSuiAddress(),
    packageId: a.packageOriginal,
    ttlMin: 10,
    signer: floe.signer,
    suiClient: floe.sui as any,
  });

  // PTB the key servers dry-run: seal_approve_curator(id, vault, curatorCap)
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.package}::${a.module}::seal_approve_curator`,
    typeArguments: opts.types,
    arguments: [
      tx.pure.vector('u8', Array.from(fromHex(vaultSealId(opts.vaultId)))),
      tx.object(opts.vaultId),
      tx.object(opts.curatorCap),
    ],
  });
  const txBytes = await tx.build({ client: floe.sui, onlyTransactionKind: true });

  const plaintext = await client.decrypt({ data: opts.ciphertext, sessionKey, txBytes });
  return JSON.parse(new TextDecoder().decode(plaintext));
}

export const SEAL_TESTNET = {
  keyServers: undefined as unknown as string[], // filled from addresses at runtime
};
