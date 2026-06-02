import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { CetusModule, CETUS_TESTNET } from '@floe/sdk';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);
const addr = kp.toSuiAddress();

const SUI_T = '0x2::sui::SUI';
const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';

// price = DUSDC_raw per SUI_raw. 1 SUI (1e9 raw) ~ 3 DUSDC (3e6 raw) -> 0.003
const priceRaw = 0.003;
const sqrtPriceX64 = BigInt(Math.floor(Math.sqrt(priceRaw) * 2 ** 64));
// current tick for this price
const tickSpacing = 60;
const rawTick = Math.log(priceRaw) / Math.log(1.0001);
const align = (t:number)=> Math.round(t / tickSpacing) * tickSpacing;
const tickLower = align(rawTick) - tickSpacing * 20; // wide band
const tickUpper = align(rawTick) + tickSpacing * 20;
console.log(`price=${priceRaw} sqrtX64=${sqrtPriceX64} rawTick=${rawTick.toFixed(0)} range=[${tickLower},${tickUpper}]`);

// amounts: seed 0.5 SUI (A) + let B float (fix A). 
const amountA = 500_000_000n;  // 0.5 SUI
const amountB = 3_000_000n;    // ~3 DUSDC max
const fixAmountA = true;

const tx = new Transaction();
  tx.setSender(addr);
// split coin A from gas (SUI), coin B from a DUSDC coin
const [coinA] = tx.splitCoins(tx.gas, [tx.pure.u64(amountA)]);
// find a DUSDC coin object
const dusdcCoins = await sui.getCoins({ owner: addr, coinType: DUSDC });
if (!dusdcCoins.data.length) throw new Error('no DUSDC coins');
const dusdcObj = tx.object(dusdcCoins.data[0].coinObjectId);
const [coinB] = tx.splitCoins(dusdcObj, [tx.pure.u64(amountB)]);

CetusModule.createPoolWithLiquidity(tx, {
  coinTypeA: SUI_T, coinTypeB: DUSDC,
  tickSpacing, initSqrtPrice: sqrtPriceX64,
  tickLower, tickUpper,
  coinA, coinB, amountA, amountB, fixAmountA,
  recipient: addr,
});

const r = await sui.dryRunTransactionBlock({
  transactionBlock: await tx.build({ client: sui, onlyTransactionKind: false }),
});
console.log('\n========================================');
console.log('DRY RUN STATUS:', r.effects.status.status);
if (r.effects.status.error) console.log('ERROR:', r.effects.status.error);
console.log('gas:', r.effects.gasUsed.computationCost);
console.log('CREATED OBJECTS:');
for (const c of (r.objectChanges ?? []) as any[]) {
  if (c.type==='created') console.log('  ', (c.objectType||'').replace(/0x[0-9a-f]{6,}/g, m=>m.slice(0,8)+'..'));
}
console.log('========================================');
