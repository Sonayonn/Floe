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
