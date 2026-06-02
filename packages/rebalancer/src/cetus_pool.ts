import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { CetusModule } from '@floe/sdk';

const EXECUTE = process.env.EXECUTE === '1';   // dry-run unless EXECUTE=1
const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);
const addr = kp.toSuiAddress();

const SUI_T = '0x2::sui::SUI';
const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';

const priceRaw = 0.003;
const tickSpacing = 60;
const align = (t: number) => Math.round(t / tickSpacing) * tickSpacing;
const rawTick = Math.log(priceRaw) / Math.log(1.0001);
const initTick = align(rawTick);                       // aligned init tick
const sqrtPriceX64 = BigInt(Math.floor(Math.pow(1.0001, initTick / 2) * 2 ** 64)); // sqrtPrice FROM aligned tick
const tickLower = initTick - tickSpacing * 20;
const tickUpper = initTick + tickSpacing * 20;
const amountA = 500_000_000n;   // 0.5 SUI
const amountB = 3_000_000n;     // 3 DUSDC max
console.log(`mode=${EXECUTE ? 'EXECUTE' : 'DRY-RUN'} sqrtX64=${sqrtPriceX64} ticks=[${tickLower},${tickUpper}]`);

const tx = new Transaction();
tx.setSender(addr);
const [coinA] = tx.splitCoins(tx.gas, [tx.pure.u64(amountA)]);
const dusdc = await sui.getCoins({ owner: addr, coinType: DUSDC });
if (!dusdc.data.length) throw new Error('no DUSDC');
const [coinB] = tx.splitCoins(tx.object(dusdc.data[0].coinObjectId), [tx.pure.u64(amountB)]);

CetusModule.createPoolWithLiquidity(tx, {
  coinTypeA: SUI_T, coinTypeB: DUSDC, tickSpacing,
  initSqrtPrice: sqrtPriceX64, tickLower, tickUpper,
  coinA, coinB, amountA, amountB, fixAmountA: true, recipient: addr,
});

if (!EXECUTE) {
  const built = await tx.build({ client: sui });
  const r = await sui.dryRunTransactionBlock({ transactionBlock: built });
  console.log('STATUS:', r.effects.status.status);
  if (r.effects.status.error) console.log('ERROR:', r.effects.status.error);
  for (const c of (r.objectChanges ?? []) as any[]) {
    if (c.type === 'created') {
      const t = (c.objectType || '').replace(/0x[0-9a-f]{6,}/g, (m: string) => m.slice(0, 8) + '..');
      console.log('  created:', t);
    }
  }
} else {
  const r = await sui.signAndExecuteTransaction({
    signer: kp, transaction: tx,
    options: { showObjectChanges: true, showEffects: true },
  });
  console.log('EXECUTED:', r.digest, r.effects?.status?.status);
  for (const c of (r.objectChanges ?? []) as any[]) {
    if (c.type === 'created' && /pool::Pool|position::Position/.test(c.objectType || '')) {
      console.log('  ', c.objectType.includes('Position') ? 'POSITION' : 'POOL', c.objectId);
    }
  }
}
