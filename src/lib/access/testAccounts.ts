import { createSupabaseServerClient } from "@/lib/supabase/server";

type SupabaseClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

function isMissingTestAccountSchemaError(message: string) {
  const lower = message.toLowerCase();
  return (
    lower.includes("is_test_account") ||
    (lower.includes("column") && lower.includes("does not exist")) ||
    (lower.includes("relation") && lower.includes("does not exist"))
  );
}

export async function getTestAccountStatusMap(
  supabase: SupabaseClient,
  userIds: string[]
): Promise<Map<string, boolean>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  const result = new Map<string, boolean>();

  uniqueIds.forEach((id) => result.set(id, false));
  if (uniqueIds.length === 0) {
    return result;
  }

  const { data, error } = await supabase
    .from("public_profiles")
    .select("id, is_test_account")
    .in("id", uniqueIds);

  if (error) {
    if (isMissingTestAccountSchemaError(error.message)) {
      return result;
    }
    throw new Error(error.message);
  }

  (data ?? []).forEach((row) => {
    result.set(row.id, Boolean(row.is_test_account));
  });

  return result;
}

export async function isTestAccount(supabase: SupabaseClient, userId: string) {
  return (await getTestAccountStatusMap(supabase, [userId])).get(userId) ?? false;
}

export function canViewTestAuthoredContent({
  viewerUserId,
  ownerUserId,
  viewerIsTestAccount,
  ownerIsTestAccount,
}: {
  viewerUserId: string;
  ownerUserId: string;
  viewerIsTestAccount: boolean;
  ownerIsTestAccount: boolean;
}) {
  if (viewerUserId === ownerUserId) {
    return true;
  }

  if (!ownerIsTestAccount) {
    return true;
  }

  return viewerIsTestAccount;
}
