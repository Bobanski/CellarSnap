import { NextResponse } from "next/server";
import { createPrivateBetaFeatureDeniedResponse, userHasPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { listSavedListScans } from "@/server/listScan/persistence";

export async function GET(request: Request) {
  let auth: Awaited<ReturnType<typeof requireRequestAuth>>;
  try {
    auth = await requireRequestAuth(request);
  } catch (error) {
    if (error instanceof RequestAuthError) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    throw error;
  }

  if (!(await userHasPrivateBetaFeatureAccess(auth.supabase, auth.user))) {
    return createPrivateBetaFeatureDeniedResponse();
  }

  try {
    const scans = await listSavedListScans(auth.supabase, auth.user.id);
    return NextResponse.json({ scans });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load your saved scans right now.",
      },
      { status: 500 }
    );
  }
}
