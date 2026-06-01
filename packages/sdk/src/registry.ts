import type { FloeClient } from './client.ts';

export interface VaultInfo {
  vaultId: string;
  curator: string;
  name: string;
  strategyKind: string;
}

/** List every vault deployed on the layer — the Earn directory. */
export async function listVaults(floe: FloeClient): Promise<VaultInfo[]> {
  const o = await floe.sui.getObject({ id: floe.addresses.registry, options: { showContent: true } });
  const vaults = (o.data?.content as any)?.fields?.vaults ?? [];
  return vaults.map((entry: any) => {
    const e = entry.fields ?? entry;
    return {
      vaultId: e.vault_id,
      curator: e.curator,
      name: decodeBytes(e.name),
      strategyKind: decodeBytes(e.strategy_kind),
    };
  });
}

function decodeBytes(b: number[] | string): string {
  if (typeof b === 'string') return b;
  if (Array.isArray(b)) return new TextDecoder().decode(new Uint8Array(b));
  return '';
}
