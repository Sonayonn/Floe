import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';
import { encodePolicy, type PolicyInput } from '../config/policy.ts';
import { encodeFees, type FeesInput } from '../config/fees.ts';
import { publishShareModule } from '../share/publish.ts';

const DEEPBOOK_PKG = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';
const CLOCK = '0x6';

export interface DeployVaultOpts {
  curator?: string;            // defaults to signer
  asset: string;               // quote coin type Q (e.g. DUSDC type)
  name: string;
  symbol: string;              // share symbol
  strategyKind?: string;       // default "stratos"
  policy: PolicyInput;
  fees: FeesInput;
  predictPackageId: string;    // for create_manager
}

export interface DeployedVault {
  vaultId: string;
  ownerCapId: string;
  curatorCapId: string;
  execCapId: string;
  shareType: string;
  sharePackageId: string;
  treasuryCapId: string;
  predictManagerId: string;
  balanceManagerId: string;
  deployDigest: string;
}

/**
 * Deploy a complete Floe vault: publish share module -> provision managers ->
 * deploy_vault. Three orchestrated txs behind one config-object call.
 * Requires floe.signer.
 */
export async function deploy(floe: FloeClient, opts: DeployVaultOpts): Promise<DeployedVault> {
  if (!floe.signer) throw new Error('deploy requires a FloeClient with a signer');
  const curator = opts.curator ?? floe.address!;
  const strategyKind = opts.strategyKind ?? 'stratos';

  // ── Tx 1: publish the per-vault share module (coin_registry) ──
  const share = publishShareModule({ symbol: opts.symbol, name: opts.name });
  // The publish (a separate `sui client publish` process) spent the curator's gas
  // coin; wait for the fullnode to index the new version before the SDK reuses it,
  // otherwise Tx 2/3 can grab a stale coin version (-32002 "unavailable for consumption").
  await floe.sui.waitForTransaction({ digest: share.digest });

  // ── Tx 2: provision PredictManager + BalanceManager (both create+transfer to sender) ──
  const mTx = new Transaction();
  mTx.moveCall({ target: `${opts.predictPackageId}::predict::create_manager`, arguments: [] });
  const newBm = mTx.moveCall({ target: `${DEEPBOOK_PKG}::balance_manager::new`, arguments: [] });
  // balance_manager::new RETURNS the BalanceManager -> share it (it's a shared object the vault references by ID)
  mTx.moveCall({ target: '0x2::transfer::public_transfer', typeArguments: [`${DEEPBOOK_PKG}::balance_manager::BalanceManager`], arguments: [newBm, mTx.pure.address(curator)] });
  const mRes = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: mTx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (mRes.effects?.status?.status !== 'success') throw new Error(`manager provisioning failed: ${JSON.stringify(mRes.effects?.status)}`);
  // Settle before Tx 3 reuses the same gas coin (same -32002 race as above).
  await floe.sui.waitForTransaction({ digest: mRes.digest });
  const mChanges: any[] = mRes.objectChanges ?? [];
  const pm = mChanges.find((c) => c.type === 'created' && c.objectType?.endsWith('::predict_manager::PredictManager'));
  const bm = mChanges.find((c) => c.type === 'created' && c.objectType?.endsWith('::balance_manager::BalanceManager'));
  if (!pm || !bm) throw new Error('manager objects not found in objectChanges');
  const predictManagerId = pm.objectId;
  const balanceManagerId = bm.objectId;

  // ── Tx 3: deploy_vault ──
  const tx = new Transaction();
  const policy = encodePolicy(tx, floe, opts.policy);
  const fees = encodeFees(tx, floe, opts.fees, curator);
  const [ownerCap, curatorCap] = tx.moveCall({
    target: floe.target('deploy_vault'),
    typeArguments: [opts.asset, share.shareType],
    arguments: [
      tx.object(floe.addresses.registry),
      tx.object(share.treasuryCapId),
      tx.pure.id(balanceManagerId),
      tx.pure.id(predictManagerId),
      policy,
      fees,
      tx.pure.string(opts.name),
      tx.pure.string(strategyKind),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([ownerCap, curatorCap], curator);
  const res = await floe.sui.signAndExecuteTransaction({
    signer: floe.signer, transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  if (res.effects?.status?.status !== 'success') throw new Error(`deploy_vault failed: ${JSON.stringify(res.effects?.status)}`);

  const changes: any[] = res.objectChanges ?? [];
  const find = (suffix: string) => changes.find((c) => c.type === 'created' && typeof c.objectType === 'string' && c.objectType.endsWith(suffix));
  const vault = changes.find((c) => c.type === 'created' && c.objectType?.includes('::floe::Vault<'));
  const ownerC = find('::floe::OwnerCap');
  const curatorC = find('::floe::CuratorCap');
  const execC = find('::floe::ExecCap');
  if (!vault || !ownerC || !curatorC || !execC) throw new Error('expected vault + 3 caps in objectChanges');

  return {
    vaultId: vault.objectId,
    ownerCapId: ownerC.objectId,
    curatorCapId: curatorC.objectId,
    execCapId: execC.objectId,
    shareType: share.shareType,
    sharePackageId: share.sharePackageId,
    treasuryCapId: share.treasuryCapId,
    predictManagerId, balanceManagerId,
    deployDigest: res.digest,
  };
}
