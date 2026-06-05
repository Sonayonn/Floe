import { SuiClient, getFullnodeUrl } from '@mysten/sui/client';
import { Transaction } from '@mysten/sui/transactions';
import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';

const PKG = '0x7869a58cb2246136a5a00e2d74a59e1b6e3e1f87c8ecd9ea92b210f228f2d6ca'; // V9
const VAULT = '0xea33fe41c7512a1a36be417b0ce400ada0db0d9fe54f2ade75662aaef987de2e';
const EXEC_CAP = '0x453356286d5240164af6fe5973adf9d46c18b9b8c4231ffc80e03dd9ea75c10e';
const CLOCK = '0x6';
const Q = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const S = '0x120c29a65c10ada7619429e46a608531cfcb4affe14439ca6838aaa77dfd029f::share::SHARE';
const POS = [
  { id: '0x799a19d95ef6568398ad9d687280d199793e53676d62e8083e813a0db5f1de62', mark: 900000 },
  { id: '0x198fa1530028c9ffcc982db33744a8cf4f5965b03c388f95b224b69d8373de10', mark: 4500000 },
];
const owner = '0x9a249cb07dbe8bbdf4b880255c72ed103a995bd390a72903b26797f51e366216';

const sui = new SuiClient({ url: getFullnodeUrl('testnet') });
const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const kp = Ed25519Keypair.fromSecretKey(secretKey);

async function exec(tx: Transaction, label: string) {
  try {
    const r = await sui.signAndExecuteTransaction({ signer: kp, transaction: tx, options: { showEffects: true, showEvents: true } });
    const st = r.effects?.status?.status;
    console.log(`${label}: ${st}`, r.effects?.status?.error ?? '', r.digest);
    const guard = r.events?.find(e => e.type.includes('NavGuardTripped'));
    if (guard) console.log('   ↳ NavGuardTripped:', JSON.stringify(guard.parsedJson));
    return st === 'success';
  } catch (e: any) {
    console.log(`${label}: REJECTED — ${String(e.message || e).slice(0, 90)}`);
    return false;
  }
}

async function getCoin(coinType: string) {
  const c = await sui.getCoins({ owner, coinType });
  return c.data[0]?.coinObjectId;
}

console.log('=== ACT 1: vault is divergent — breaker PROTECTS ===');

// 1a) deposit attempt -> must FAIL with EDepositUnsafe (30)
{
  const tx = new Transaction();
  const dusdc = await getCoin(Q);
  const [pay] = tx.splitCoins(tx.object(dusdc!), [tx.pure.u64(1_000_000)]);
  const shares = tx.moveCall({ target: `${PKG}::floe::deposit`, typeArguments: [Q, S],
    arguments: [tx.object(VAULT), pay, tx.object(CLOCK)] });
  tx.transferObjects([shares], owner);
  const ok = await exec(tx, '[1a] deposit during divergence (expect FAIL EDepositUnsafe)');
  console.log('   => deposit', ok ? 'SUCCEEDED (UNEXPECTED)' : 'correctly BLOCKED ✓');
}

// 1b) withdraw -> must SUCCEED at lower bound + emit NavGuardTripped
{
  const tx = new Transaction();
  const share = await getCoin(S);
  const [burn] = tx.splitCoins(tx.object(share!), [tx.pure.u64(1_000_000)]); // 1 share
  const out = tx.moveCall({ target: `${PKG}::floe::withdraw`, typeArguments: [Q, S],
    arguments: [tx.object(VAULT), burn, tx.object(CLOCK)] });
  tx.transferObjects([out], owner);
  await exec(tx, '[1b] withdraw during divergence (expect SUCCESS at lower bound)');
}


console.log('\n=== ACT 2: settle positions -> divergence clears -> breaker PERMITS ===');

// 2a) settle both positions at their mark value (moves marks -> certain tier)
for (const p of POS) {
  const tx = new Transaction();
  tx.moveCall({ target: `${PKG}::floe::settle_position`, typeArguments: [Q, S],
    arguments: [tx.object(VAULT), tx.object(EXEC_CAP), tx.pure.id(p.id), tx.pure.u64(p.mark)] });
  await exec(tx, `[2a] settle_position ${p.id.slice(0,12)}… @ ${p.mark}`);
}

// 2b) deposit now -> must SUCCEED (NAV is provable: lower bound rose to meet NAV)
{
  const tx = new Transaction();
  const dusdc = await getCoin(Q);
  const [pay] = tx.splitCoins(tx.object(dusdc!), [tx.pure.u64(1_000_000)]);
  const shares = tx.moveCall({ target: `${PKG}::floe::deposit`, typeArguments: [Q, S],
    arguments: [tx.object(VAULT), pay, tx.object(CLOCK)] });
  tx.transferObjects([shares], owner);
  const ok = await exec(tx, '[2b] deposit after settlement (expect SUCCESS)');
  console.log('   => deposit', ok ? 'correctly PERMITTED ✓' : 'BLOCKED (UNEXPECTED)');
}

console.log('\n=== circuit breaker demo complete ===');
