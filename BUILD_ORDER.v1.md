## AGENT LAYER (Tier 3) — folded into the phases, not a separate track
Decision: ONE attenuated execution-authority capability (ExecCap). Agents hold a mandated
(attenuated) instance; rebalancer holds the full instance. Grounded in capability-security
attenuation + 2025-26 agent-delegation convergence (Entrust/WSO2/Tenuo). See V3_ARCHITECTURE.md.

Where it lands:
- Phase 1 (contract v3): ExecCap + Mandate + authorize_agent/revoke_agent + AgentRegistry
  built INTO the capability model from the start (not bolted on). Attenuation is structural.
- Phase 3 (@floe/sdk): SDK supports deploying a vault operated by an agent (issue ExecCap
  with mandate); agent-side helper to run the rebalance loop under a mandate.
- Phase 4 (proof vaults): 4a human-curator 2nd vault; 4b AGENT-curator vault ("Floe Agent
  Alpha") — autonomous agent, LLM-authored Strategy, attenuated/attested/revocable mandate,
  live in the directory. The reach proof.
- Phase 7 (Nautilus): per-action attestation fuses with per-action mandate re-evaluation —
  the agent's authority is continuously re-verified, the industry-prescribed model, native.
- Phase 8 (app): AgentRegistry surfaces agent operators in the directory; "Agent" badge +
  the 20-sec demo beat on the agent vault detail page.

NOT a what-next. Built, live, shown on Floe. Bounded so it strengthens (not muddles) the
DeepBook structured-products thesis: the layer is general enough that agents build on it too.

## Note (Phase 3 SDK): adopt coin_registry::new_currency_with_otw for templated share modules
## COMMITTED FIXES (all three, by end of project — not optional)
1. Provable NAV / Nautilus attestation (THE MOAT) — Phase 7. update_plp_price currently
   ignores its _attestation arg; register_enclave's PCR is unverified. Fix: enclave signs
   the PLP valuation, Move verifies attestation vs registered PCR before accepting. At
   minimum ONE genuinely attested NAV update on chain for the demo.
2. PLP valuation (the unattested half of the moat) — near-term (exercise pass / Phase 2).
   update_plp_price is operator-set; nothing pushes it, so is_price_fresh soft-locks the
   vault ~1h after PLP is held. Fix: rebalancer computes PLP value from Predict vault state
   and pushes update_plp_price every cycle. Same logic the enclave later runs attested (#1).
3. Delta hedge real greeks — quality pass before demo. Currently a geometric proxy; upgrade
   to exact SVI/BS delta for the vertical-range position. Labeled v1 until then.

## Note: position MTM (mark_position) — same valuation rigor as PLP price
mark_position currently takes a hand-supplied mark; in production the rebalancer should
compute each range position's MTM from the SVI oracle (position value given spot/vol/strikes)
and push it each cycle, exactly like the PLP price heartbeat. Attested version = Phase 7
(Nautilus). For now marks are set to premium_paid (no assumed gain) = honest placeholder.

## SEQUENCING CHANGE (custody-driven)
Nautilus PULLED FORWARD: was Phase 7 (last), now runs RIGHT AFTER Phase 3 (SDK).
Reason: the enclave is the real custody owner of PredictManager funds (non-custodial
endpoint), so it must land early enough to derisk — but not block foundational
provisioning/SDK. New order: P1 ✅ -> P2 (provisioning + v3.2 custody) -> P3 (SDK + v3.1
agent caps) -> NAUTILUS (was P7) -> P4 (2nd vault + agent vault) -> Walrus -> Seal ->
app -> backtest -> submission.

## CUSTODY MODEL — VERIFIED against live testnet ABI (supersedes earlier 3-cap notes)
Testnet balance_manager (0xfb28c4...) is the TWO-tier model (owner + TradeCap), NOT the
3-cap (Withdraw/Deposit/Trade) model in main-branch docs. Verified from chain ABI.

- PLP (MAJORITY of capital): FULLY non-custodial NOW. Vault holds Balance<PLP> dynamic field
  (store_plp), redeems via predict::withdraw (needs no owner). PROVEN on chain (tx HnQvMr3N).
- BalanceManager TRADE authority: delegable via a vault-held TradeCap -> built WITH the real
  hedge (deferred; hedge is the only BM trader, still a stub). mint_trade_cap returns nothing
  (transfers cap to sender), so: mint -> then store TradeCap in vault as a dynamic field.
- BalanceManager + PredictManager DEPOSIT/WITHDRAW: owner-only, NO cap delegation (DeepBook's
  design). = the interim attested-operator surface -> becomes the Nautilus enclave address.
  predict_operator field (v3.2 struct) already holds this.

NOTE: v3.2 shipped provision_caps + borrow_withdraw_cap + borrow_deposit_cap assuming the
3-cap model — UNUSED on this testnet API (harmless, function-only, never called). Use a
1-cap provision_trade_cap when wiring the hedge, or revisit if DeepBook App-auth/newer pkg lands.

## DEMO CLAIM (honest, verified)
"Curator-non-custodial with progressive custody minimization: the curator can NEVER withdraw
principal (enforced on-chain). PLP — the majority of assets — is fully non-custodial, redeemed
by the vault itself. Fund-movement (deposit/withdraw) is operated by an attested operator that
becomes a hardware enclave (no human key) at Nautilus. Custody only shrinks."

## LESSON BANKED (standing): verify the LIVE chain ABI before integration code
README, main-branch source, and SDK docs described a NEWER DeepBook than what's deployed on
testnet. getNormalizedMoveModulesByPackage(pkg) is the only ground truth. Check it FIRST for
every external package we integrate (coin_registry, Walrus, Seal, Nautilus, Predict).

## Reusable references from Mysten predict-workshop (db-predict-workshop, branch tlee/predict-workshop)
- portfolio.html — reference UI reading oracle/position/portfolio state from the indexer.
  Reuse for: the app's position + NAV display (Phase 8).
- listPositions.ts / listMarkets.ts — how to read oracles, positions, SVI/strike grids from
  predict-server. Reuse for: Phase 7 mark-position-from-SVI (gap #3) and the app's market list.
- Custody note: a positive DeepBook App-auth reply is a non-breaking UPGRADE to Option 1+3 —
  swap BM creation to new_with_custom_owner_caps<FloeApp> in the provisioning fn only. No struct
  change, no execution-fn change, no republish. Caps-as-dynamic-fields makes the source swappable.

## COMMITTED: real hedge (Stratum C) — no longer a stub
Wire LIVE Spot/Margin order placement for delta-neutralization (currently a Margin-borrow
stub w/ geometric-proxy delta). Makes Stratum C genuine and uses DEEP (vault BM holds DEEP +
collateral via DepositCap from Stage 2). Sequencing: AFTER Stage 2 cap custody lands (the
hedge needs the vault-held TradeCap/DepositCap to place orders non-custodially). So:
Stage 2 (cap custody) -> real hedge wiring -> then SDK/Nautilus per plan. Real greeks (gap #3)
fold into this hedge work.
