import { FloeClient } from '../client.ts';

export interface VaultSummary {
  vaultId: string;
  curator: string;
  name: string;
  strategyKind: string;
}

function bytesToStr(v: unknown): string {
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return new TextDecoder().decode(new Uint8Array(v as number[]));
  return '';
}

/** Enumerate every deployed vault from the on-chain VaultRegistry.vaults table. */
export async function listVaults(floe: FloeClient): Promise<VaultSummary[]> {
  const reg = await floe.sui.getObject({
    id: floe.addresses.registry,
    options: { showContent: true },
  });
  const fields: any = (reg.data?.content as any)?.fields ?? {};
  const vaults: any[] = fields.vaults ?? [];
  return vaults.map((v: any) => {
    const f = v.fields ?? v;
    return {
      vaultId: typeof f.vault_id === 'string' ? f.vault_id : (f.vault_id?.id ?? f.vault_id),
      curator: f.curator,
      name: bytesToStr(f.name),
      strategyKind: bytesToStr(f.strategy_kind),
    };
  });
}
