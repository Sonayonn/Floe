"use client";
import { useState, useCallback } from "react";
import { useCurrentAccount } from "@mysten/dapp-kit";
import {
  buildPublishShareTx, buildProvisionManagersTx, buildDeployVaultTx,
  extractPublishedShare, extractManagers, extractDeployedVault,
  type DeployVaultPolicyInput, type DeployVaultFeesInput,
} from "@floe/sdk/browser";
import { useFloeExecute } from "@/lib/hooks/useFloeExecute";

export interface DeployVaultConfig {
  asset: string;
  name: string;
  strategyKind?: string;
  predictPackageId: string;
  policy: DeployVaultPolicyInput;
  fees: DeployVaultFeesInput;
}

export interface DeployedVault {
  vaultId: string;
  shareType: string;
  sharePackageId: string;
  treasuryCapId: string;
  predictManagerId: string;
  balanceManagerId: string;
  ownerCapId: string;
  curatorCapId: string;
  execCapId: string;
}

export type StepStatus = "pending" | "active" | "done" | "error";
export type DeployStepKey = "share" | "managers" | "vault";
export interface DeployStep { key: DeployStepKey; status: StepStatus; digest?: string }

const INITIAL: DeployStep[] = [
  { key: "share", status: "pending" },
  { key: "managers", status: "pending" },
  { key: "vault", status: "pending" },
];

/**
 * Drives the 3-signature in-app vault deploy: publish SHARE coin → provision venue
 * managers → deploy_vault. Each step's objectChanges feed the next, so the wallet
 * sees three sequential prompts. Exposes per-step status for the wizard UI.
 */
export function useDeployVault() {
  const account = useCurrentAccount();
  const execute = useFloeExecute();
  const [steps, setSteps] = useState<DeployStep[]>(INITIAL);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DeployedVault | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setSteps(INITIAL);
    setRunning(false);
    setResult(null);
    setError(null);
  }, []);

  const run = useCallback(
    async (cfg: DeployVaultConfig): Promise<DeployedVault | null> => {
      if (!account) { setError("Connect a wallet to deploy."); return null; }
      const sender = account.address;
      setRunning(true);
      setError(null);
      setResult(null);
      setSteps(INITIAL.map((s) => ({ ...s })));

      const mark = (i: number, status: StepStatus, digest?: string) =>
        setSteps((cur) => cur.map((s, j) => (j === i ? { ...s, status, digest: digest ?? s.digest } : s)));

      try {
        // 1 · publish the per-vault SHARE coin
        mark(0, "active");
        const r1 = await execute(buildPublishShareTx(sender), { label: "Publish share coin", collectObjectChanges: true });
        const share = extractPublishedShare((r1.objectChanges ?? []) as never[]);
        mark(0, "done", r1.digest);

        // 2 · provision PredictManager + BalanceManager
        mark(1, "active");
        const r2 = await execute(
          buildProvisionManagersTx({ sender, predictPackageId: cfg.predictPackageId }),
          { label: "Provision managers", collectObjectChanges: true },
        );
        const mgr = extractManagers((r2.objectChanges ?? []) as never[]);
        mark(1, "done", r2.digest);

        // 3 · deploy_vault with the encoded policy + fees
        mark(2, "active");
        const r3 = await execute(
          buildDeployVaultTx({
            sender,
            asset: cfg.asset,
            shareType: share.shareType,
            treasuryCapId: share.treasuryCapId,
            balanceManagerId: mgr.balanceManagerId,
            predictManagerId: mgr.predictManagerId,
            name: cfg.name,
            strategyKind: cfg.strategyKind,
            policy: cfg.policy,
            fees: cfg.fees,
          }),
          { label: "Deploy vault", collectObjectChanges: true },
        );
        const vault = extractDeployedVault((r3.objectChanges ?? []) as never[]);
        mark(2, "done", r3.digest);

        const deployed: DeployedVault = {
          ...vault,
          shareType: share.shareType,
          sharePackageId: share.sharePackageId,
          treasuryCapId: share.treasuryCapId,
          predictManagerId: mgr.predictManagerId,
          balanceManagerId: mgr.balanceManagerId,
        };
        setResult(deployed);
        return deployed;
      } catch (e) {
        setSteps((cur) => cur.map((s) => (s.status === "active" ? { ...s, status: "error" } : s)));
        setError((e as Error)?.message ?? "Deploy failed");
        return null;
      } finally {
        setRunning(false);
      }
    },
    [account, execute],
  );

  return { run, reset, steps, running, result, error };
}
