"use client";
import { useEffect } from "react";
import { useSuiClientContext } from "@mysten/dapp-kit";
import { registerEnokiWallets, isEnokiNetwork } from "@mysten/enoki";
import { ENOKI_API_KEY, GOOGLE_CLIENT_ID, ENOKI_ENABLED, ENOKI_REDIRECT_PATH } from "@/lib/enoki";

// Registers Enoki zkLogin wallets (Google) into dapp-kit's wallet-standard registry, so they
// surface alongside browser wallets in our AuthModal. Sponsored gas is handled server-side by
// Enoki for allowlisted Move-call targets — no client gas-station wiring needed here.
// Renders nothing; just runs the registration side-effect for the lifetime of the provider tree.
export function RegisterEnokiWallets() {
  const { client, network } = useSuiClientContext();

  useEffect(() => {
    if (!ENOKI_ENABLED) return;
    if (!isEnokiNetwork(network)) return; // Enoki only supports mainnet / testnet / devnet
    // dapp-kit's SuiClient satisfies Enoki's ClientWithCoreApi at runtime; the published types
    // lag, so cast the whole options object once rather than leak `any` across the call.
    const { unregister } = registerEnokiWallets({
      apiKey: ENOKI_API_KEY,
      providers: {
        google: {
          clientId: GOOGLE_CLIENT_ID,
          redirectUrl:
            typeof window !== "undefined" ? `${window.location.origin}${ENOKI_REDIRECT_PATH}` : undefined,
        },
      },
      client,
      network,
    } as unknown as Parameters<typeof registerEnokiWallets>[0]);
    return unregister;
  }, [client, network]);

  return null;
}
