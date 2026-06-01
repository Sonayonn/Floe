import { Transaction } from '@mysten/sui/transactions';
import { makeClients } from './engine/deepbook-clients.ts';
import { FLOE, DEEPBOOK, PREDICT } from './config.ts';

const { sui, signer, address } = makeClients();

const DEEPBOOK_PKG = '0xfb28c4cbc6865bd1c897d26aecbe1f8792d1509a20ffec692c800660cbec6982';
const BM = DEEPBOOK.balanceManagerId;
const DUSDC = PREDICT.quoteType;
const SHARE = FLOE.shareType;

// concrete cap types (for provision_caps type args)
const WCAP = `${DEEPBOOK_PKG}::balance_manager::WithdrawCap`;
const DCAP = `${DEEPBOOK_PKG}::balance_manager::DepositCap`;
const TCAP = `${DEEPBOOK_PKG}::balance_manager::TradeCap`;

const tx = new Transaction();

// 1. mint the three caps from the BM (owner-only; we own the BM)
const [wcap] = tx.moveCall({ target: `${DEEPBOOK_PKG}::balance_manager::mint_withdraw_cap`, arguments: [tx.object(BM)] });
const [dcap] = tx.moveCall({ target: `${DEEPBOOK_PKG}::balance_manager::mint_deposit_cap`, arguments: [tx.object(BM)] });
const [tcap] = tx.moveCall({ target: `${DEEPBOOK_PKG}::balance_manager::mint_trade_cap`, arguments: [tx.object(BM)] });

// 2. store all three in the vault (OwnerCap-gated)
tx.moveCall({
  target: `${FLOE.packageId}::${FLOE.moduleName}::provision_caps`,
  typeArguments: [DUSDC, SHARE, WCAP, DCAP, TCAP],
  arguments: [tx.object(FLOE.vaultId), tx.object(FLOE.ownerCapId), wcap, dcap, tcap],
});

const res = await sui.signAndExecuteTransaction({ signer, transaction: tx, options: { showEffects: true, showObjectChanges: true } });
console.log('provision_caps tx:', res.digest, res.effects?.status?.status);
if (res.effects?.status?.status !== 'success') {
  console.error('FAILED:', JSON.stringify(res.effects?.status));
}
