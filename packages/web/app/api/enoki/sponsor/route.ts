import { NextRequest, NextResponse } from "next/server";
import { EnokiClient } from "@mysten/enoki";

// Server-side gas sponsorship (step 1 of 2): build a sponsored transaction with the Enoki PRIVATE
// key. Sponsorship deliberately requires the private key, so it can only run here — never in the
// browser. The client sends the transaction *kind* bytes + its sender; Enoki returns the full
// sponsored tx bytes (gas owned by the Enoki gas station) for the user to sign.
const KEY = process.env.ENOKI_PRIVATE_KEY ?? "";

export async function GET() {
  // Health probe — lets the client decide whether to attempt the sponsored path or fall back to
  // user-paid gas, without leaking the key.
  return NextResponse.json({ configured: !!KEY });
}

export async function POST(req: NextRequest) {
  if (!KEY) {
    return NextResponse.json({ error: "sponsorship not configured (set ENOKI_PRIVATE_KEY)" }, { status: 503 });
  }
  try {
    const { network, transactionKindBytes, sender, allowedMoveCallTargets, allowedAddresses } = await req.json();
    if (!transactionKindBytes || !sender) {
      return NextResponse.json({ error: "missing transactionKindBytes or sender" }, { status: 400 });
    }
    const enoki = new EnokiClient({ apiKey: KEY });
    const { bytes, digest } = await enoki.createSponsoredTransaction({
      network: network ?? "testnet",
      transactionKindBytes,
      sender,
      // Optional extra guards on top of the portal allowlist; undefined ⇒ portal config governs.
      allowedMoveCallTargets,
      allowedAddresses,
    });
    return NextResponse.json({ bytes, digest });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
