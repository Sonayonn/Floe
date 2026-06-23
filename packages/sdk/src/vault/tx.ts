// Browser-safe Transaction builders for wallet signing (no in-process signer).
// dApps call these, then hand the Transaction to dapp-kit's useSignAndExecuteTransaction.
import { Transaction } from '@mysten/sui/transactions';
import type { FloeClient } from '../client.ts';
import { FLOE_ADDRESSES, type FloeNetwork } from '../constants.ts';
import { CETUS_TESTNET } from '../venues/cetus-config.ts';
import { encodeTickU32 } from '../venues/cetus.ts';
import { SHARE_MODULE } from '../share/bytecode.ts';

const CLOCK = '0x6';
const DEEPBOOK_PKG = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';

export interface VaultTxBase {
  network?: FloeNetwork;
  vaultId: string;
  qType: string;   // quote/deposit asset type
  sType: string;   // share type
  sender: string;
}

/** Deposit: split `amount` from the user's quote coin, call deposit, return shares to sender. */
export function buildDepositTx(o: VaultTxBase & { paymentCoinId: string; amount: bigint }): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const tx = new Transaction();
  const [pay] = tx.splitCoins(tx.object(o.paymentCoinId), [tx.pure.u64(o.amount)]);
  const shares = tx.moveCall({
    target: `${a.package}::${a.module}::deposit`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), pay, tx.object(CLOCK)],
  });
  tx.transferObjects([shares], o.sender);
  return tx;
}

/**
 * Deploy idle → PLP (Stratum A base yield), the 4-call atomic PTB the rebalancer's
 * `supply_plp` action composes. Oracle-independent: works even when the SVI oracle
 * has expired. Requires the vault's ExecCap (held by the curator/operator) — so this
 * is the owner-triggered "activate my vault" action, never silent fund movement.
 *
 *   deploy_idle(vault, execCap, amount) -> (Coin<Q>, DeployReceipt)
 *   predict::supply<Q>(predict, coin, clock) -> Coin<PLP>   // mint LP from the global pool
 *   store_plp<Q,S,PLP>(vault, execCap, plp)                 // custody stays IN the vault
 *   confirm_deploy(vault, receipt, amount)
 */
export function buildDeployPlpTx(o: VaultTxBase & { execCapId: string; amount: bigint }): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const p = a.predict;
  const tx = new Transaction();
  const [coin, receipt] = tx.moveCall({
    target: `${a.package}::${a.module}::deploy_idle`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), tx.pure.u64(o.amount)],
  });
  const [plp] = tx.moveCall({
    target: `${p.package}::predict::supply`,
    typeArguments: [o.qType],
    arguments: [tx.object(p.object), coin, tx.object(CLOCK)],
  });
  tx.moveCall({
    target: `${a.package}::${a.module}::store_plp`,
    typeArguments: [o.qType, o.sType, p.plpType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), plp],
  });
  tx.moveCall({
    target: `${a.package}::${a.module}::confirm_deploy`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), receipt, tx.pure.u64(o.amount)],
  });
  return tx;
}

/**
 * Deploy idle → a Cetus CLMM position custodied IN the vault (Archetype 2: Position NFT),
 * the multi-venue analogue of {@link buildDeployPlpTx}. ExecCap-gated — owner-triggered, never
 * silent fund movement.
 *
 * Opens a SINGLE-SIDED position: the tick range sits entirely on one side of the pool's current
 * price so the position is 100% the vault's quote asset Q — the other side owes 0, settled with a
 * zero coin. This conserves NAV: exactly the dUSDC that left idle becomes the position's marked
 * value, with no counter-asset funding required. `qIsA` says whether Q sorts as the pool's coin A
 * (type-string order); pick a range ABOVE current price when Q is A, BELOW when Q is B.
 *
 *   deploy_idle(vault, execCap, amount) -> (Coin<Q>, DeployReceipt)
 *   pool::open_position(config, pool, lower, upper) -> Position
 *   pool::add_liquidity_fix_coin(config, pool, position, amount, fix_a, clock) -> receipt
 *   pool::repay_add_liquidity(config, pool, Balance<A>, Balance<B>, receipt)   // Q + zero
 *   confirm_deploy_cetus<Q,S,Position>(vault, execCap, receipt, position, amount)  // custody + NAV
 */
export function buildDeployCetusTx(o: VaultTxBase & {
  execCapId: string;
  amount: bigint;
  poolId: string;
  coinTypeA: string;
  coinTypeB: string;
  positionType: string;   // the Cetus Position struct type (e.g. `${corePackageId}::position::Position`)
  tickLower: number;
  tickUpper: number;
  qIsA: boolean;          // true if Q === coinTypeA (single-sided range above price), else below
}): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const C = CETUS_TESTNET;
  const ta = [o.coinTypeA, o.coinTypeB];
  const tx = new Transaction();

  // 1) pull idle Q out under the vault's floor protection
  const [qCoin, receipt] = tx.moveCall({
    target: `${a.package}::${a.module}::deploy_idle`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), tx.pure.u64(o.amount)],
  });

  // 2) open the position + add liquidity fixing the Q side
  const position = tx.moveCall({
    target: `${C.publishedAt}::pool::open_position`,
    typeArguments: ta,
    arguments: [
      tx.object(C.globalConfigId), tx.object(o.poolId),
      tx.pure.u32(encodeTickU32(o.tickLower)), tx.pure.u32(encodeTickU32(o.tickUpper)),
    ],
  });
  const addReceipt = tx.moveCall({
    target: `${C.publishedAt}::pool::add_liquidity_fix_coin`,
    typeArguments: ta,
    arguments: [
      tx.object(C.globalConfigId), tx.object(o.poolId), position,
      tx.pure.u64(o.amount), tx.pure.bool(o.qIsA), tx.object(CLOCK),
    ],
  });

  // 3) settle: the fixed (Q) side is funded by qCoin; the other side owes 0 → a zero coin.
  const qBal = tx.moveCall({ target: '0x2::coin::into_balance', typeArguments: [o.qType], arguments: [qCoin] });
  const otherType = o.qIsA ? o.coinTypeB : o.coinTypeA;
  const zeroOther = tx.moveCall({ target: '0x2::balance::zero', typeArguments: [otherType] });
  const balA = o.qIsA ? qBal : zeroOther;
  const balB = o.qIsA ? zeroOther : qBal;
  tx.moveCall({
    target: `${C.publishedAt}::pool::repay_add_liquidity`,
    typeArguments: ta,
    arguments: [tx.object(C.globalConfigId), tx.object(o.poolId), balA, balB, addReceipt],
  });

  // 4) custody the Position NFT in the vault + record the sleeve value (= what left idle)
  tx.moveCall({
    target: `${a.package}::${a.module}::confirm_deploy_cetus`,
    typeArguments: [o.qType, o.sType, o.positionType],
    arguments: [tx.object(o.vaultId), tx.object(o.execCapId), receipt, position, tx.pure.u64(o.amount)],
  });
  return tx;
}

/**
 * Resolve the ExecCap the `owner` holds for `vaultId`, or null if they hold none.
 * ExecCaps keep type `${packageOriginal}::floe::ExecCap` across upgrades and carry
 * the `vault_id` they authorize. Drives whether to show the curator-only Deploy action.
 */
export async function resolveExecCap(floe: FloeClient, owner: string, vaultId: string): Promise<string | null> {
  const a = floe.addresses;
  let cursor: string | null | undefined = null;
  for (;;) {
    const r = await floe.sui.getOwnedObjects({
      owner,
      filter: { StructType: `${a.packageOriginal}::floe::ExecCap` },
      options: { showContent: true },
      cursor,
    });
    for (const o of r.data ?? []) {
      const fields = (o.data?.content as any)?.fields;
      if (fields?.vault_id === vaultId) return o.data!.objectId;
    }
    if (!r.hasNextPage) break;
    cursor = r.nextCursor;
  }
  return null;
}

// ─── In-app vault deploy (browser-signed, 3 wallet txs) ──────────────────────
// The curator pipeline that FloeVault.deploy runs server-side, re-expressed as
// browser Transactions for wallet signing. Run in order, reading objectChanges
// from each result to feed the next:
//   1) buildPublishShareTx      -> extractPublishedShare  (sharePackageId, shareType, treasuryCapId)
//   2) buildProvisionManagersTx -> extractManagers        (predictManagerId, balanceManagerId)
//   3) buildDeployVaultTx       -> extractDeployedVault    (vaultId + caps)
// Three signatures because each step's freshly-created objects must be indexed
// before the next can reference them by type/id (the share type for #3 doesn't
// even exist until #1 lands).

/**
 * Tx 1 — publish the per-vault SHARE coin package (precompiled generic OTW module).
 * The module's `init` mints the TreasuryCap<SHARE> + MetadataCap to the sender; the
 * publish itself returns an UpgradeCap which we hand back to the sender too.
 */
export function buildPublishShareTx(sender: string): Transaction {
  const tx = new Transaction();
  const upgradeCap = tx.publish({
    modules: [...SHARE_MODULE.modules],
    dependencies: [...SHARE_MODULE.dependencies],
  });
  tx.transferObjects([upgradeCap], sender);
  return tx;
}

/**
 * Tx 2 — provision the vault's venue managers: a Predict PredictManager (create_manager
 * transfers it to the sender) and a DeepBook BalanceManager (returned, so we transfer it).
 * Their ids feed deploy_vault.
 */
export function buildProvisionManagersTx(o: { sender: string; predictPackageId: string }): Transaction {
  const tx = new Transaction();
  tx.moveCall({ target: `${o.predictPackageId}::predict::create_manager`, arguments: [] });
  const bm = tx.moveCall({ target: `${DEEPBOOK_PKG}::balance_manager::new`, arguments: [] });
  tx.moveCall({
    target: '0x2::transfer::public_transfer',
    typeArguments: [`${DEEPBOOK_PKG}::balance_manager::BalanceManager`],
    arguments: [bm, tx.pure.address(o.sender)],
  });
  return tx;
}

export interface DeployVaultPolicyInput {
  allowedOracles: string[];
  maxPositionSize: bigint;   // 6dp quote units
  maxTotalExposure: bigint;  // 6dp
  maxLeverageBps: number;
  enabledStrata: number;     // bitmask: PLP=1 | RANGE=2 | HEDGE=4
  plpFloorBps: number;
}
export interface DeployVaultFeesInput {
  managementBps: number;
  performanceBps: number;
  feeRecipient?: string;     // defaults to curator (sender)
}
export interface DeployVaultTxInput {
  network?: FloeNetwork;
  sender: string;
  curator?: string;          // defaults to sender; OwnerCap/CuratorCap go here
  asset: string;             // quote coin type Q
  shareType: string;         // share type S (from Tx 1)
  treasuryCapId: string;     // TreasuryCap<S> (from Tx 1)
  balanceManagerId: string;  // from Tx 2
  predictManagerId: string;  // from Tx 2
  name: string;
  strategyKind?: string;     // default "stratos"
}

/**
 * Tx 3 — encode policy + fees and call deploy_vault. Returns (OwnerCap, CuratorCap)
 * to the curator; deploy_vault also mints + transfers the ExecCap + GuardianCap to the
 * sender, and shares the Vault. Fee caps (3% / 20%) are enforced on-chain by new_fees.
 */
export function buildDeployVaultTx(
  o: DeployVaultTxInput & { policy: DeployVaultPolicyInput; fees: DeployVaultFeesInput },
): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const fn = (name: string) => `${a.package}::${a.module}::${name}`;
  const curator = o.curator ?? o.sender;
  const tx = new Transaction();

  const policy = tx.moveCall({
    target: fn('new_policy'),
    arguments: [
      tx.makeMoveVec({ type: '0x2::object::ID', elements: o.policy.allowedOracles.map((id) => tx.pure.id(id)) }),
      tx.pure.u64(o.policy.maxPositionSize),
      tx.pure.u64(o.policy.maxTotalExposure),
      tx.pure.u64(BigInt(o.policy.maxLeverageBps)),
      tx.pure.u8(o.policy.enabledStrata),
      tx.pure.u64(BigInt(o.policy.plpFloorBps)),
    ],
  });
  const fees = tx.moveCall({
    target: fn('new_fees'),
    arguments: [
      tx.pure.u64(BigInt(o.fees.managementBps)),
      tx.pure.u64(BigInt(o.fees.performanceBps)),
      tx.pure.address(o.fees.feeRecipient ?? curator),
    ],
  });
  const [ownerCap, curatorCap] = tx.moveCall({
    target: fn('deploy_vault'),
    typeArguments: [o.asset, o.shareType],
    arguments: [
      tx.object(a.registry),
      tx.object(o.treasuryCapId),
      tx.pure.id(o.balanceManagerId),
      tx.pure.id(o.predictManagerId),
      policy,
      fees,
      tx.pure.string(o.name),
      tx.pure.string(o.strategyKind ?? 'stratos'),
      tx.object(CLOCK),
    ],
  });
  tx.transferObjects([ownerCap, curatorCap], curator);
  return tx;
}

// ── objectChanges extractors (run on each step's result before the next) ──────
type ObjChange = { type?: string; objectType?: string; objectId?: string; packageId?: string };
const created = (changes: ObjChange[], pred: (t: string) => boolean) =>
  changes.find((c) => c.type === 'created' && typeof c.objectType === 'string' && pred(c.objectType));

/** Pull the published package, share type, and TreasuryCap id from Tx 1's objectChanges. */
export function extractPublishedShare(changes: ObjChange[]): {
  sharePackageId: string; shareType: string; treasuryCapId: string; metadataCapId?: string;
} {
  const published = changes.find((c) => c.type === 'published');
  if (!published?.packageId) throw new Error('share publish: no published package in objectChanges');
  const sharePackageId = published.packageId;
  const treasury = created(changes, (t) => t.includes('TreasuryCap') && t.includes('::share::SHARE'));
  if (!treasury?.objectId) throw new Error('share publish: no TreasuryCap<SHARE> in objectChanges');
  const metadata = created(changes, (t) => t.includes('MetadataCap'));
  return {
    sharePackageId,
    shareType: `${sharePackageId}::share::SHARE`,
    treasuryCapId: treasury.objectId,
    metadataCapId: metadata?.objectId,
  };
}

/** Pull the PredictManager + BalanceManager ids from Tx 2's objectChanges. */
export function extractManagers(changes: ObjChange[]): { predictManagerId: string; balanceManagerId: string } {
  const pm = created(changes, (t) => t.endsWith('::predict_manager::PredictManager'));
  const bm = created(changes, (t) => t.endsWith('::balance_manager::BalanceManager'));
  if (!pm?.objectId || !bm?.objectId) throw new Error('manager provisioning: PredictManager/BalanceManager not found in objectChanges');
  return { predictManagerId: pm.objectId, balanceManagerId: bm.objectId };
}

/** Pull the Vault + OwnerCap/CuratorCap/ExecCap ids from Tx 3's objectChanges. */
export function extractDeployedVault(changes: ObjChange[]): {
  vaultId: string; ownerCapId: string; curatorCapId: string; execCapId: string;
} {
  const vault = created(changes, (t) => t.includes('::floe::Vault<'));
  const ownerCap = created(changes, (t) => t.endsWith('::floe::OwnerCap'));
  const curatorCap = created(changes, (t) => t.endsWith('::floe::CuratorCap'));
  const execCap = created(changes, (t) => t.endsWith('::floe::ExecCap'));
  if (!vault?.objectId || !ownerCap?.objectId || !curatorCap?.objectId || !execCap?.objectId)
    throw new Error('deploy_vault: expected Vault + OwnerCap + CuratorCap + ExecCap in objectChanges');
  return {
    vaultId: vault.objectId,
    ownerCapId: ownerCap.objectId,
    curatorCapId: curatorCap.objectId,
    execCapId: execCap.objectId,
  };
}

/** Withdraw: split `shareAmount` from the user's share coin, call withdraw, return quote to sender. */
export function buildWithdrawTx(o: VaultTxBase & { shareCoinId: string; shareAmount: bigint }): Transaction {
  const a = FLOE_ADDRESSES[o.network ?? 'testnet'];
  const tx = new Transaction();
  const [shares] = tx.splitCoins(tx.object(o.shareCoinId), [tx.pure.u64(o.shareAmount)]);
  const out = tx.moveCall({
    target: `${a.package}::${a.module}::withdraw`,
    typeArguments: [o.qType, o.sType],
    arguments: [tx.object(o.vaultId), shares, tx.object(CLOCK)],
  });
  tx.transferObjects([out], o.sender);
  return tx;
}
