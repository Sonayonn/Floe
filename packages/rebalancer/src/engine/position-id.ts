/**
 * Deterministic derivation of Floe's internal position-table key.
 *
 * The vault keys its Table<ID, RangePosition> by an ID we control — never
 * passed to Predict (Predict addresses ranges by RangeKey). Same RangeKey
 * components always yield the same ID, so the engine can re-find any position
 * from its parameters. SINGLE definition; import everywhere.
 *
 * Uses Node's built-in crypto (SHA-256 -> 32 bytes = a valid Sui ID). No
 * external hash dependency, so it can never break on a package restructure.
 * This is the vault's own key, not a cryptographic commitment, so SHA-256 of
 * the BCS-serialized components is entirely sufficient.
 */

import { createHash } from 'node:crypto';
import { bcs } from '@mysten/sui/bcs';

export function derivePositionId(
  oracleId: string, expiry: bigint, lower9: bigint, upper9: bigint,
): string {
  const enc = bcs.struct('RangeId', {
    oracle: bcs.Address,
    expiry: bcs.u64(),
    lower: bcs.u64(),
    upper: bcs.u64(),
  }).serialize({ oracle: oracleId, expiry, lower: lower9, upper: upper9 }).toBytes();
  const hash = createHash('sha256').update(Buffer.from(enc)).digest();
  return '0x' + hash.toString('hex'); // 32 bytes -> valid Sui ID
}
