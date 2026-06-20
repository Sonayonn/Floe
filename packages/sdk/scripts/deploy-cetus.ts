/**
 * Deploy idle dUSDC -> a Cetus CLMM position custodied INSIDE the Multi-Venue vault.
 *
 * The Cetus analogue of deploy-plp.ts. It composes the exact PTB buildDeployCetusTx builds
 * (vault/tx.ts) and the UI "Deploy to Cetus" button will sign, run here once by the cap holder:
 *
 *   deploy_idle(vault, execCap, amount) -> (Coin<Q>, DeployReceipt)
 *   pool::open_position + add_liquidity_fix_coin + repay_add_liquidity   (single-sided Q)
 *   confirm_deploy_cetus<Q,S,Position>(vault, execCap, receipt, position, amount)  // in-vault custody
 *
 * The position is SINGLE-SIDED (tick range fully on one side of price) so it holds only the vault's
 * own dUSDC — what left idle re-appears as the position's marked value (NAV conserved, no
 * counter-asset funding). After it lands, run attest-all/heartbeat so the attested NAV picks up
 * the new Cetus sleeve (mark_cetus_value keeps it fresh).
 *
 * PREREQUISITES (one-time):
 *   1. Publish the upgraded floe package (this branch adds store_cetus_position /
 *      confirm_deploy_cetus) and set FLOE_ADDRESSES.testnet.package to the new id.
 *   2. A Cetus testnet pool that CONTAINS dUSDC on one side. The sample USDT/CETUS pool does not,
 *      so create one (CetusModule.createPoolWithLiquidity) and pass its id + tick range below.
 *
 *   set -a; . ../../scripts/.env; set +a
 *   POOL_ID=0x… COIN_A=0x…::dusdc::DUSDC COIN_B=0x…::usdc::USDC Q_IS_A=1 \
 *     TICK_LOWER=2 TICK_UPPER=20 AMOUNT=1000000 node scripts/deploy-cetus.ts          # dry-run
 *   POOL_ID=0x… … EXECUTE=1 AMOUNT=1000000 node scripts/deploy-cetus.ts               # send
 */
import { buildDeployCetusTx } from "../src/vault/tx.ts";
import { CETUS_TESTNET } from "../src/venues/cetus-config.ts";
import { DUSDC, clientFor, addrFor, resolveCap, VAULTS } from "./lib-attest.ts";

const EXECUTE = process.env.EXECUTE === "1";
const AMOUNT = BigInt(process.env.AMOUNT ?? "1000000"); // default 1 dUSDC (6dp)

const POOL_ID = process.env.POOL_ID;
const COIN_A = process.env.COIN_A ?? DUSDC;
const COIN_B = process.env.COIN_B ?? CETUS_TESTNET.coinTypeB;
const Q_IS_A = (process.env.Q_IS_A ?? "1") === "1";
const TICK_LOWER = Number(process.env.TICK_LOWER ?? "2");
const TICK_UPPER = Number(process.env.TICK_UPPER ?? "20");
const POSITION_TYPE = process.env.POSITION_TYPE ?? `${CETUS_TESTNET.corePackageId}::position::Position`;

if (!POOL_ID) {
  console.error(
    "POOL_ID is required — a Cetus testnet pool containing dUSDC on one side.\n" +
    "  None ships in cetus-config (sample pool is USDT/CETUS). Create one first via\n" +
    "  CetusModule.createPoolWithLiquidity, then pass POOL_ID + COIN_A/COIN_B/Q_IS_A + ticks.",
  );
  process.exit(1);
}

const v = VAULTS.find((x) => x.name === "Floe Multi-Venue");
if (!v) throw new Error("Floe Multi-Venue vault not found in VAULTS");

const client = clientFor(v.holder);
const sender = addrFor(v.holder);

try {
  const execCap = await resolveCap(client, sender, "ExecCap", v.vaultId);
  const tx = buildDeployCetusTx({
    vaultId: v.vaultId, qType: DUSDC, sType: v.sType, sender,
    execCapId: execCap, amount: AMOUNT,
    poolId: POOL_ID, coinTypeA: COIN_A, coinTypeB: COIN_B, positionType: POSITION_TYPE,
    tickLower: TICK_LOWER, tickUpper: TICK_UPPER, qIsA: Q_IS_A,
  });
  tx.setSender(sender);

  if (!EXECUTE) {
    const built = await tx.build({ client: client.sui });
    const dr = await client.sui.dryRunTransactionBlock({ transactionBlock: built });
    const bc = (dr.balanceChanges ?? []).map((b) => `${b.coinType.split("::").pop()}:${b.amount}`).join(" ");
    console.log(`[dry-run] ${v.name} ${dr.effects.status.status}${dr.effects.status.error ? " — " + dr.effects.status.error : ""}  ${bc}`);
  } else {
    const r = await client.sui.signAndExecuteTransaction({
      signer: client.signer!, transaction: tx, options: { showEffects: true },
    });
    const ok = r.effects?.status?.status;
    console.log(`[exec] ${v.name} ${ok}${ok !== "success" ? " — " + r.effects?.status?.error : ""}  ${r.digest}`);
    if (ok === "success") await client.sui.waitForTransaction({ digest: r.digest });
  }
} catch (e) {
  console.log(`[err] ${v.name} ${(e as Error).message}`);
}
