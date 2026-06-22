"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SuiClientProvider, WalletProvider, createNetworkConfig } from "@mysten/dapp-kit";
import { getJsonRpcFullnodeUrl } from "@mysten/sui/jsonRpc";
import { useState } from "react";
import { RegisterEnokiWallets } from "@/components/auth/RegisterEnokiWallets";
import { ToastProvider } from "@/components/ui/Toast";
import "@mysten/dapp-kit/dist/index.css";

// Prefer a dedicated RPC (NEXT_PUBLIC_SUI_RPC_URL) when set — same endpoint the read-only
// floeClient() uses — so the whole app shares one rate-limit budget; else the public fullnode.
const TESTNET_RPC = process.env.NEXT_PUBLIC_SUI_RPC_URL || getJsonRpcFullnodeUrl("testnet");

const { networkConfig } = createNetworkConfig({
  // SuiJsonRpcClientOptions requires both `url` and `network` (the latter was missing).
  testnet: { url: TESTNET_RPC, network: "testnet" },
  mainnet: { url: getJsonRpcFullnodeUrl("mainnet"), network: "mainnet" },
});

export function Providers({ children }: { children: React.ReactNode }) {
  const [qc] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={qc}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <RegisterEnokiWallets />
        <WalletProvider autoConnect>
          <ToastProvider>{children}</ToastProvider>
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
