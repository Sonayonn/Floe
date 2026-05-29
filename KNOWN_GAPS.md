# Known gaps & SDK quirks

## DeepBook
- **Market-order stake gate (Day 3, E.4)**: non-whitelisted SUI/DBUSDC pool
  requires 100 DEEP staked per `poolTradeParams.stakeRequired`. Limit orders
  bypass this check; market orders don't. Aborts cleanly in
  `order_info::validate_inputs` — no funds moved. Resolution: request DEEP
  from the DeepBook Discord, retry the market-order script.
- **SDK L2 read crash (Day 3, E.1)**: `@mysten/deepbook-v3 0.28.3`'s
  `getLevel2Range` crashes on empty result sets due to a non-null assertion
  in `client.ts:399`. Worked around with try/catch + narrowed price ranges.
  Pattern to re-use in the production rebalancer for all L2 reads.

## DeepBook Predict
- **No live oracles at Day 4 attempt (Phase D)**: All BTC oracles had settled
  ~3 days before, no new ones activated yet. Pivoted to demonstrating the
  PLP supply/withdraw flow against the vault directly — which is Floe's
  actual production mechanism (not a workaround). Will revisit
  `mint`/`mint_range` once a fresh oracle activates and update the demo.
  Oracle monitor script planned to alert on activation.

## Demo artifacts captured (Day 4)
- Live PLP share price drift observed: **1.00066** (vault summary
  `plp_share_price: 1.0006625477684061`, confirmed by 10 DUSDC supply →
  9.993378 PLP minted, ratio 1.00066).
- Supply tx: `BjQNfSqzov7g9pkPNHfBHaLt9YSS9E1c1ZQTZiDqvJzm`
- Withdraw tx: `Hofeg4PkKJhUJKDJx87KMJURPCM9wHbWpiRTdapNbTui`
- Round-trip loss: −0.000001 DUSDC (rounding only, no slippage).

## Resolved Day 4 (May 20, 2026)
- ✅ DeepBook market order: fixed via `minSize: 1` quantity bump, RPC failover helper (`lib/sui.ts`).
- ✅ Predict binary position mint: oracle now active, full `deposit → mint` PTB working. Tx: `ELojQpAZidLTUcsbKwRfbncxevQtGCNgo3HxgdkufCEW`.
- ✅ Indexer status filter corrected: `"active"` not `"activated"`.

## Deliberate v1 choice: geometric delta proxy (not exact BS delta)
- Stratos estimates net delta via drift-from-band-midpoint, not by
  differentiating the Black-Scholes price. Documented + commented in stratos.ts.
- Rationale: the hedge is DEMONSTRATED live on chain (Stratum C proven); the
  trigger logic just needs to be sane and directionally correct for the demo.
- The SVI surface gives us everything to compute exact greeks later if desired.
- NOT a blocker. A refinement, scoped post-hackathon or W4-polish if time allows.

## RESOLVED 2026-05-29 — Full rebalance composition proven (dry-run success)
- supply_plp + open_range compose into ONE atomic PTB, dry-run Status: success.
- Events: Supplied, BalanceEvent x2, RangeMinted. ~10 PLP received, range minted.
- Flags settled:
  - Flag 1 (position id): centralized derivePositionId, Node crypto, no ext dep.
  - Flag 2 (mint_range semantics): NOT a size issue — strikes must align to the
    oracle's tick grid (tick_size=$1, min_strike=$50k). assert_valid_strike code 2
    fired on fractional-dollar strikes. Fixed by snapping in oneSigmaRange
    (floor lower / ceil upper to tick, clamp >= minStrike).
  - Flag 3 (manager withdraw): close_range path not yet exercised (no open
    position in this run); will verify on a cycle with a position to close.
- Contract change: authorize_range now pulls funding from idle + returns coin
  (closed the deploy/record gap the original author flagged as TODO). Republished
  as v2: 0x2f8f55dacfcac4f0b9d56cf3cfc3fd560dc2ee7d70552947fd8aacc384bd4d09.
