import { decodeSuiPrivateKey } from '@mysten/sui/cryptography';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { FloeClient, FloeVault, Policy } from '../src/index.ts';

const { secretKey } = decodeSuiPrivateKey(process.env.SUI_PRIVATE_KEY!);
const signer = Ed25519Keypair.fromSecretKey(secretKey);
const floe = new FloeClient({ network: 'testnet', signer });

const DUSDC = '0xe95040085976bfd54a1a07225cd46c8a2b4e8e2b6732f140a0fc49850ba73e1a::dusdc::DUSDC';
const PREDICT_PKG = process.env.PREDICT_PACKAGE_ID!;
const ORACLE = '0xb79524498a9947307e192d8045772150dc47aade4f9e09bd4b6fe3236b9e3125';

console.log('Deploying a fresh Floe vault entirely via @floe/sdk...\n');
const v = await FloeVault.deploy(floe, {
  asset: DUSDC,
  name: 'Floe SDK Demo Vault',
  symbol: 'flDemo',
  policy: {
    allowedOracles: [ORACLE],
    maxPositionSize: 1_000_000_000n,
    maxTotalExposure: 10_000_000_000n,
    maxLeverageBps: 30_000,
    enabledStrata: Policy.Stratum.PLP | Policy.Stratum.RANGE | Policy.Stratum.HEDGE,
    plpFloorBps: 5_000,
  },
  fees: { managementBps: 200, performanceBps: 2_000 },
  predictPackageId: PREDICT_PKG,
});
console.log('Vault deployed:');
console.log(JSON.stringify(v, null, 2));
