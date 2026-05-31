/// Per-vault share token for the Floe reference vault (Stratos).
/// One OTW share type -> one TreasuryCap, handed to the deployer to pass into
/// floe::floe::deploy_vault as the vault's share Coin S. Fungible, composable.
///
/// In production the Floe SDK templates + publishes one of these per vault deploy
/// (the share type name varies per vault); this is the hand-published reference.
module floe_share_ref::share;

use sui::coin;

/// One-time witness. Name = module name uppercased.
public struct SHARE has drop {}

#[allow(deprecated_usage)]
fun init(witness: SHARE, ctx: &mut TxContext) {
    let (treasury, metadata) = coin::create_currency(
        witness,
        6,                                  // decimals, match quote (DUSDC 6dp)
        b"flStratos",                       // symbol
        b"Floe Stratos Share",              // name
        b"Share token for the Floe Stratos reference vault",
        option::none(),
        ctx,
    );
    transfer::public_freeze_object(metadata);
    transfer::public_transfer(treasury, ctx.sender()); // deployer -> passes to deploy_vault
}
