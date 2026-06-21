import { NextRequest, NextResponse } from "next/server";
import { EnokiClient } from "@mysten/enoki";

// Server-side gas sponsorship (step 2 of 2): submit the user-signed sponsored transaction through
// the Enoki gas station with the PRIVATE key. The client signs the bytes returned by /sponsor and
// posts back the digest + signature; Enoki co-signs (gas) and executes.
const KEY = process.env.ENOKI_PRIVATE_KEY ?? "";

export async function POST(req: NextRequest) {
  if (!KEY) {
    return NextResponse.json({ error: "sponsorship not configured (set ENOKI_PRIVATE_KEY)" }, { status: 503 });
  }
  try {
    const { digest, signature } = await req.json();
    if (!digest || !signature) {
      return NextResponse.json({ error: "missing digest or signature" }, { status: 400 });
    }
    const enoki = new EnokiClient({ apiKey: KEY });
    const res = await enoki.executeSponsoredTransaction({ digest, signature });
    return NextResponse.json(res); // { digest }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
