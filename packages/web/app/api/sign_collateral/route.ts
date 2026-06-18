import { NextRequest, NextResponse } from "next/server";

// Server-side proxy to the Floe enclave's /sign_collateral (intent-3 CollateralPayload).
// The browser calls this same-origin route — so there is no CORS dependency on the enclave,
// and FLOE_ENCLAVE_URL stays server-only (never shipped to the client).
const ENCLAVE = process.env.FLOE_ENCLAVE_URL?.replace(/\/$/, "");

export async function GET() {
  // health probe — lets the UI show an honest "attester offline" state without a borrow attempt.
  return NextResponse.json({ configured: !!ENCLAVE });
}

export async function POST(req: NextRequest) {
  if (!ENCLAVE) {
    return NextResponse.json({ error: "enclave not configured (set FLOE_ENCLAVE_URL)" }, { status: 503 });
  }
  const body = await req.text();
  try {
    const r = await fetch(`${ENCLAVE}/sign_collateral`, {
      method: "POST", headers: { "content-type": "application/json" }, body,
    });
    const text = await r.text();
    return new NextResponse(text, { status: r.status, headers: { "content-type": "application/json" } });
  } catch (e) {
    return NextResponse.json({ error: `enclave unreachable: ${(e as Error).message}` }, { status: 502 });
  }
}
