import { NextResponse } from "next/server";
import { createPrivateBetaFeatureDeniedResponse, userHasPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { RequestAuthError, requireRequestAuth } from "@/server/auth/requestAuth";
import { getSavedListScanResult } from "@/server/listScan/persistence";

export async function GET(
  request: Request,
  context: { params: Promise<{ scanId: string }> }
) {
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

  const { scanId } = await context.params;

  try {
    const result = await getSavedListScanResult(auth.supabase, auth.user.id, scanId);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to load this saved scan right now.",
      },
      { status: 500 }
    );
  }
}
