import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { notFound, redirect } from "next/navigation";
import { canAccessPrivateBetaFeatures } from "@shared";

type UserLike = User | null | undefined;
type SupabaseWithPublicProfiles = {
  from: (table: "public_profiles") => {
    select: (columns: string) => {
      eq: (column: "id", value: string) => {
        maybeSingle: () => Promise<{
          data: { is_test_account?: boolean | null } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

function isMissingTestAccountSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("is_test_account") ||
    (lower.includes("column") && lower.includes("does not exist")) ||
    (lower.includes("relation") && lower.includes("does not exist"))
  );
}

export async function userHasPrivateBetaFeatureAccess(
  supabase: SupabaseWithPublicProfiles,
  user: UserLike
) {
  if (!user) {
    return false;
  }

  if (canAccessPrivateBetaFeatures(user.email)) {
    return true;
  }

  const { data, error } = await supabase
    .from("public_profiles")
    .select("is_test_account")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    if (isMissingTestAccountSchemaError(error.message)) {
      return false;
    }
    throw new Error(error.message);
  }

  return Boolean(data?.is_test_account);
}

export async function assertPrivateBetaFeatureAccessAsync(
  supabase: SupabaseWithPublicProfiles,
  user: UserLike
): Promise<void> {
  if (!user) {
    redirect("/login");
  }

  if (!(await userHasPrivateBetaFeatureAccess(supabase, user))) {
    notFound();
  }
}

export async function requirePrivateBetaFeatureUser(
  supabase: SupabaseWithPublicProfiles,
  user: UserLike
): Promise<User> {
  if (!user) {
    redirect("/login");
  }

  if (!(await userHasPrivateBetaFeatureAccess(supabase, user))) {
    notFound();
  }

  return user;
}

export function createPrivateBetaFeatureDeniedResponse() {
  return NextResponse.json(
    {
      error: "This feature is not enabled for this account.",
    },
    { status: 403 }
  );
}
