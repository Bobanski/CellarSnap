import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { canAccessPrivateBetaFeatures } from "@shared";

type UserLike = User | null | undefined;

export function userHasPrivateBetaFeatureAccess(user: UserLike) {
  return canAccessPrivateBetaFeatures(user?.email);
}

export function assertPrivateBetaFeatureAccess(
  user: UserLike
): asserts user is User {
  if (!user) {
    redirect("/login");
  }

  if (!userHasPrivateBetaFeatureAccess(user)) {
    notFound();
  }
}

export function createPrivateBetaFeatureDeniedResponse() {
  return NextResponse.json(
    {
      error: "This feature is not enabled for this account.",
    },
    { status: 403 }
  );
}
