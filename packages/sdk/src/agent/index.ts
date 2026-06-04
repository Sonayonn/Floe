/**
 * Agent — attenuated, attested, revocable agent authority over a Floe vault.
 *
 * A curator authorizes an agent to operate a vault under an on-chain Mandate
 * (expiry, max_cycles, optional tighter policy, revocable). The agent holds a
 * real attenuated ExecCap — not a key — attributed to the issuing curator. The
 * vault re-evaluates the mandate on every action; the curator can revoke instantly
 * (the kill-switch). This is the agent-authority control plane the agentic-enterprise
 * industry bolts onto OAuth — native on Sui, because a capability is a first-class object.
 */
import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';

export interface AuthorizeAgentOpts {
  vaultId: string;
  /** CuratorCap object id (the curator authorizes their agent). */
  curatorCap: string;
  /** the agent's address — receives the attenuated ExecCap. */
  agent: string;
  /** mandate expiry (unix ms). */
  expiryMs: bigint;
  /** max rebalance cycles the agent may run. */
  maxCycles: bigint;
  /** optional Seal-encrypted tighter policy id; omit for vault-policy default. */
  mandatePolicy?: string | null;
}

/** Curator authorizes an agent under a bounded mandate (requires curator signer). */
export async function authorizeAgent(floe: FloeClient, o: AuthorizeAgentOpts): Promise<string> {
  if (!floe.signer) throw new Error('authorizeAgent requires the curator signer');
  const a = floe.addresses;
  const types = await resolveVaultTypes(floe, o.vaultId);
  const tx = new Transaction();
  // mandate_policy: Option<PolicyConfig> — None for v1 (vault policy governs)
  const policyArg = tx.moveCall({ target: '0x1::option::none', typeArguments: [`${a.package}::${a.module}::PolicyConfig`] });
  tx.moveCall({
    target: `${a.package}::${a.module}::authorize_agent`,
    typeArguments: types,
    arguments: [
      tx.object(o.vaultId),
      tx.object(o.curatorCap),
      tx.object(a.agentRegistry),
      tx.pure.address(o.agent),
      tx.pure.u64(o.expiryMs),
      tx.pure.u64(o.maxCycles),
      policyArg,
    ],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true, showObjectChanges: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`authorize_agent failed: ${res.effects?.status?.error}`);
  }
  return res.digest;
}

export interface RevokeAgentOpts {
  vaultId: string;
  curatorCap: string;
  /** the agent's ExecCap object id to revoke (the kill-switch target). */
  agentCapId: string;
}

/** Curator revokes an agent (instant kill-switch — vault rejects the cap thereafter). */
export async function revokeAgent(floe: FloeClient, o: RevokeAgentOpts): Promise<string> {
  if (!floe.signer) throw new Error('revokeAgent requires the curator signer');
  const a = floe.addresses;
  const types = await resolveVaultTypes(floe, o.vaultId);
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.package}::${a.module}::revoke_agent`,
    typeArguments: types,
    arguments: [
      tx.object(o.vaultId),
      tx.object(o.curatorCap),
      tx.object(a.agentRegistry),
      tx.pure.id(o.agentCapId),
    ],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') {
    throw new Error(`revoke_agent failed: ${res.effects?.status?.error}`);
  }
  return res.digest;
}

export interface AgentEntry {
  agentCapId: string;
  vaultId: string;
  authorizedBy: string;
  active: boolean;
}

/** Read the on-chain AgentRegistry — the directory of authorized agents. */
export async function listAgents(floe: FloeClient, vaultId?: string): Promise<AgentEntry[]> {
  const o = await floe.sui.getObject({
    id: floe.addresses.agentRegistry, options: { showContent: true },
  });
  const raw = ((o.data?.content as any)?.fields?.agents ?? []) as any[];
  const all = raw.map((e) => {
    const f = e.fields ?? e;
    return {
      agentCapId: f.agent_id,
      vaultId: f.vault_id,
      authorizedBy: f.authorized_by,
      active: !!f.active,
    } as AgentEntry;
  });
  return vaultId ? all.filter((a) => a.vaultId === vaultId) : all;
}

/** Consume one mandate cycle (agent calls this per rebalance; enforces expiry+budget). */
export async function consumeMandateCycle(floe: FloeClient, execCapId: string): Promise<string> {
  if (!floe.signer) throw new Error('consumeMandateCycle requires the agent signer');
  const a = floe.addresses;
  const tx = new Transaction();
  tx.moveCall({
    target: `${a.package}::${a.module}::consume_mandate_cycle`,
    arguments: [tx.object(execCapId), tx.object(a.clock)],
  });
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx, options: { showEffects: true },
  });
  return res.digest;
}

/** Resolve a vault's <Q, S> type arguments from its on-chain type (call before authorize/revoke). */
export async function resolveVaultTypes(floe: FloeClient, vaultId: string): Promise<[string, string]> {
  const o = await floe.sui.getObject({ id: vaultId, options: { showType: true } });
  const t = (o.data as any)?.type as string; // floe::Vault<Q, S>
  const m = t?.match(/<(.+),\s*(.+)>$/);
  if (!m) throw new Error(`could not parse vault type args from ${t}`);
  return [m[1].trim(), m[2].trim()];
}
