import { NextResponse } from "next/server";

// Old clients must reload/update to the server-side password/recovery flows.
// A constant response cannot disclose whether any submitted account exists.
export async function POST() {
  return NextResponse.json(
    { error: "Please reload or update the app to sign in or recover your account." },
    { status: 410, headers: { "Cache-Control": "no-store" } }
  );
}
