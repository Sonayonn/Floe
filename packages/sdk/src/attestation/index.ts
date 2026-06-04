/**
 * Attestation — Floe's verifiable-NAV moat, surfaced for builders.
 *
 * Floe NAV (and vol) can be hardware-attested: a value is signed inside a registered
 * AWS Nitro enclave, and floe_nav verifies that signature on-chain (enclave::verify_signature)
 * against the live Enclave object before accepting it. This module lets a consumer:
 *   - read the registered enclave + its PCR measurements (enclaveInfo)
 *   - verify an enclave-signed NAV on-chain (verifyNav)
 *   - verify an enclave-signed vol snapshot on-chain (verifyVolAttested)
 *
 * The signature + payload come from the enclave's /process_data endpoint (the rebalancer
 * runs this); these helpers submit the on-chain verification transaction.
 */
import { Transaction } from '@mysten/sui/transactions';
import { fromHex } from '@mysten/sui/utils';
import type { FloeClient } from '../client.ts';

export interface EnclaveInfo {
  /** The live Enclave object id (hardware-attested, registered on-chain). */
  enclaveId: string;
  /** The reproducible PCR0 measurement the EnclaveConfig is bound to. */
  pcr0: string;
  /** The enclave primitive package this composes. */
  enclavePackage: string;
  /** floe_nav package (current/V2). */
  navPackage: string;
}

/** Read the registered attestation surface (the moat's on-chain anchors). */
export function enclaveInfo(floe: FloeClient): EnclaveInfo {
  const n = floe.addresses.nav;
  return {
    enclaveId: n.enclave,
    pcr0: n.pcr0,
    enclavePackage: n.enclavePackage,
    navPackage: n.package,
  };
}

/** Confirm the Enclave object is live + shared on-chain (a quick moat health check). */
export async function isEnclaveLive(floe: FloeClient): Promise<boolean> {
  try {
    const o = await floe.sui.getObject({
      id: floe.addresses.nav.enclave, options: { showOwner: true },
    });
    return !!o.data && !!(o.data.owner as any)?.Shared;
  } catch { return false; }
}

interface AttestedArgs {
  /** value being attested: nav (for NAV) or volBps (for vol). */
  primary: bigint;
  /** second value: plpPrice (NAV) or spot (vol). */
  secondary: bigint;
  /** 32-byte id: vaultId (NAV) or oracleId (vol). */
  subjectId: string;
  timestampMs: bigint;
  /** 64-byte ed25519 signature hex from the enclave. */
  signatureHex: string;
}

async function verify(floe: FloeClient, fn: string, args: AttestedArgs): Promise<string> {
  if (!floe.signer) throw new Error(`${fn} requires a signer`);
  const n = floe.addresses.nav;
  const sig = Array.from(fromHex(args.signatureHex.replace(/^0x/, '')));
  const tx = new Transaction();
  tx.moveCall({
    target: `${n.package}::${n.module}::${fn}`,
    typeArguments: [n.otwType],
    arguments: [
      tx.object(n.enclave),
      tx.pure.u64(args.primary),
      tx.pure.u64(args.secondary),
      tx.pure.address(args.subjectId),
      tx.pure.u64(args.timestampMs),
      tx.pure.vector('u8', sig),
    ],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`${fn} rejected: ${res.effects?.status?.error ?? 'unknown'}`);
  }
  return res.digest;
}

/** Verify an enclave-signed NAV on-chain. Returns the tx digest on success;
 *  throws if the signature does not verify against the registered enclave. */
export function verifyNav(
  floe: FloeClient,
  args: { nav: bigint; plpPrice: bigint; vaultId: string; timestampMs: bigint; signatureHex: string },
): Promise<string> {
  return verify(floe, 'verify_nav', {
    primary: args.nav, secondary: args.plpPrice,
    subjectId: args.vaultId, timestampMs: args.timestampMs, signatureHex: args.signatureHex,
  });
}

/** Verify an enclave-signed VOL snapshot on-chain (distinct intent from NAV). */
export function verifyVolAttested(
  floe: FloeClient,
  args: { volBps: bigint; spot: bigint; oracleId: string; timestampMs: bigint; signatureHex: string },
): Promise<string> {
  return verify(floe, 'verify_vol_attested', {
    primary: args.volBps, secondary: args.spot,
    subjectId: args.oracleId, timestampMs: args.timestampMs, signatureHex: args.signatureHex,
  });
}
