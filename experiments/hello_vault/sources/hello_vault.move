/// Module: hello_vault
///
/// A throwaway single-asset vault — takes SUI deposits, mints share receipts,
/// allows 1:1 withdrawal. No strategy, no share-price math, no DeepBook.
/// Purpose: feel the publish → call → read cycle on testnet before writing
/// the real Floe vault on Day 5.
module hello_vault::hello_vault;

use sui::balance::{Self, Balance};
use sui::coin::{Self, Coin};
use sui::sui::SUI;

// ─── Errors ──────────────────────────────────────────────────────────────────

const EInsufficientVaultBalance: u64 = 0;

// ─── Objects ─────────────────────────────────────────────────────────────────

/// The shared vault. Anyone can deposit; a holder of a matching VaultShare can
/// withdraw a corresponding amount.
public struct Vault has key {
    id: UID,
    pool: Balance<SUI>,
}

/// Receipt minted on deposit. Owned by the depositor. Burned on withdraw.
public struct VaultShare has key, store {
    id: UID,
    amount: u64,
}

// ─── Initialization ──────────────────────────────────────────────────────────

/// One-time package init. Runs automatically when the package is published.
/// Creates the Vault and shares it so any address can call deposit/withdraw.
fun init(ctx: &mut TxContext) {
    let vault = Vault {
        id: object::new(ctx),
        pool: balance::zero<SUI>(),
    };
    transfer::share_object(vault);
}
// ─── Entry functions ─────────────────────────────────────────────────────────

/// Deposit SUI into the vault. Mints a VaultShare receipt to the sender,
/// recording the amount they deposited. The depositor will later present
/// this share to withdraw the same amount of SUI.
public fun deposit(
    vault: &mut Vault,
    payment: Coin<SUI>,
    ctx: &mut TxContext,
): VaultShare {
    let amount = payment.value();
    let paid_balance = payment.into_balance();
    vault.pool.join(paid_balance);

    VaultShare {
        id: object::new(ctx),
        amount,
    }
}
/// Withdraw SUI by surrendering a VaultShare. Burns the share and returns
/// a fresh Coin<SUI> of the recorded amount to the sender.
public fun withdraw(
    vault: &mut Vault,
    share: VaultShare,
    ctx: &mut TxContext,
): Coin<SUI> {
    let VaultShare { id, amount } = share;
    object::delete(id);

    assert!(vault.pool.value() >= amount, EInsufficientVaultBalance);

    coin::take(&mut vault.pool, amount, ctx)
}
// ─── Views ───────────────────────────────────────────────────────────────────

/// Total SUI sitting in the vault right now.
public fun pool_value(vault: &Vault): u64 {
    vault.pool.value()
}

/// The recorded amount of a share.
public fun share_amount(share: &VaultShare): u64 {
    share.amount
}