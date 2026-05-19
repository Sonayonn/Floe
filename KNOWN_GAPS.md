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
