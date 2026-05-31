/**
 * Floe rebalancer — the loop that ties strategy → engine → chain.
 *
 * Modes (via argv):
 *   (default)  dry-run: compose the PTB, dryRunTransactionBlock, print effects.
 *              Spends nothing. This is how we verify composition before funds move.
 *   --execute  sign + submit for real.
 *   --once     run a single cycle and exit (default loops every INTERVAL_MS).
 *
 * The strategy is hot-swappable: import a different Strategy, the loop is
 * unchanged. That indifference is the platform.
 */

import { Transaction } from '@mysten/sui/transactions';
import { makeClients, type Clients } from './engine/deepbook-clients.ts';
import { composeRebalancePTB } from './engine/ptb.ts';
import { computePlpPrice } from './engine/plp.ts';
import { updatePlpPrice } from './engine/vault.ts';
import { fetchSurface } from './oracle/svi.ts';
import { StratosStrategy } from './strategy/stratos.ts';
import type { MarketState, OpenPosition } from './strategy/types.ts';
import { FLOE, PREDICT } from './config.ts';

const EXECUTE = process.argv.includes('--execute');
const ONCE = process.argv.includes('--once');
const INTERVAL_MS = 60 * 60 * 1000; // 1h

const strategy = new StratosStrategy();

// ─── Read live vault + market state into a MarketState ───────────────────────

async function readMarketState(clients: Clients): Promise<MarketState> {
  const { sui } = clients;

  // Vault fields
  const vaultObj = await sui.getObject({ id: FLOE.vaultId, options: { showContent: true } });
  const f = (vaultObj.data?.content as any)?.fields ?? {};
  const idleRaw = BigInt(f.idle ?? 0);
  const plpHeldRaw = BigInt(f.plp_held ?? 0);
  const plpValuation = await computePlpPrice(sui);   // REAL price from Predict pool state
  const plpPriceRaw = plpValuation.price9;            // 9dp
  const marksTotalRaw = BigInt(f.positions_mark_total ?? 0);
  const plpFloorBps = Number(f.plp_floor_bps ?? 5000);

  // 6dp -> human
  const idle = Number(idleRaw) / 1e6;
  const plpHeld = Number(plpHeldRaw) / 1e6;
  const plpPrice = Number(plpPriceRaw) / 1e9 || 1; // 9dp -> human; bootstrap 1.0
  const marksTotal = Number(marksTotalRaw) / 1e6;
  const nav = idle + plpHeld * plpPrice + marksTotal;

  // Live SVI surface
  const surface = await fetchSurface();

  // Open positions: read from the vault's position table.
  // For v1 dry-run we start with none; reconciliation/reading the Table is a
  // follow-up (positions are re-derivable by RangeKey). Empty is correct for
  // the first rebalance from a fresh vault.
  const openPositions: OpenPosition[] = [];

  return {
    nowMs: Date.now(),
    surface,
    nav,
    idle,
    plpHeld,
    plpPrice,
    openPositions,
    hedgeNotional: 0,
    hedgeIsShort: false,
    plpFloorBps,
    plpPrice9: plpPriceRaw,      // 9dp, for on-chain push
    plpHeldRaw,
  } as any;
}

// ─── One rebalance cycle ─────────────────────────────────────────────────────

async function cycle(clients: Clients) {
  const state = await readMarketState(clients);
  console.log(`\n[${new Date().toISOString()}] NAV=$${state.nav.toFixed(2)} idle=$${state.idle.toFixed(2)} ` +
    `plp=${state.plpHeld.toFixed(2)} surface=${state.surface.length} expiries`);

  // ── PLP price heartbeat: push the real computed price every cycle so the vault
  // stays fresh (is_price_fresh) for users' deposits/withdrawals, even on noop.
  // This is the unattested half of provable NAV; Nautilus attests it in Phase 7.
  if ((state as any).plpHeldRaw > 0n) {
    const ptx = new Transaction();
    updatePlpPrice(ptx, (state as any).plpPrice9, (state as any).plpHeldRaw, []);
    ptx.setSender(clients.address);
    if (EXECUTE) {
      const r = await clients.sui.signAndExecuteTransaction({ signer: clients.signer, transaction: ptx, options: { showEffects: true } });
      console.log(`PLP price refreshed on-chain: ${r.digest} (${r.effects?.status?.status})`);
    } else {
      console.log(`[dry-run] would push PLP price = ${(state as any).plpPrice9} (9dp)`);
    }
  }

  const actions = strategy.decide(state);
  console.log('Decided actions:', actions.map(a => a.kind).join(', ') || '(none)');
  for (const a of actions) console.log('  -', JSON.stringify(a));

  if (actions.length === 1 && actions[0].kind === 'noop') {
    console.log('Nothing to do this cycle.');
    return;
  }

  const tx = await composeRebalancePTB(clients, actions);
  tx.setSender(clients.address);

  if (!EXECUTE) {
    // DRY-RUN: build + simulate, no spend. This settles the contract semantics.
    const built = await tx.build({ client: clients.sui });
    const dr = await clients.sui.dryRunTransactionBlock({ transactionBlock: built });
    console.log('\n── DRY-RUN ──');
    console.log('Status:', dr.effects.status.status);
    if (dr.effects.status.error) console.log('Error:', dr.effects.status.error);
    console.log('Gas used:', dr.effects.gasUsed);
    if (dr.balanceChanges?.length) {
      console.log('Balance changes:');
      for (const b of dr.balanceChanges) {
        console.log(`  ${b.coinType.split('::').pop()?.padEnd(8)} ${b.amount}`);
      }
    }
    if (dr.events?.length) {
      console.log('Events:', dr.events.map(e => e.type.split('::').slice(-1)[0]).join(', '));
    }
    return;
  }

  const res = await clients.sui.signAndExecuteTransaction({
    signer: clients.signer, transaction: tx,
    options: { showEffects: true, showBalanceChanges: true, showEvents: true },
  });
  console.log('\n── EXECUTED ──');
  console.log('Tx:', res.digest);
  console.log('Status:', res.effects?.status?.status);
  console.log('Explorer:', `https://suiscan.xyz/testnet/tx/${res.digest}`);
}

// ─── Main ────────────────────────────────────────────────────────────────────

const clients = makeClients();
console.log(`Floe rebalancer | strategy="${strategy.name}" | mode=${EXECUTE ? 'EXECUTE' : 'DRY-RUN'}`);

if (ONCE) {
  await cycle(clients);
} else {
  await cycle(clients);
  setInterval(() => cycle(clients).catch(e => console.error('cycle error:', e)), INTERVAL_MS);
}
