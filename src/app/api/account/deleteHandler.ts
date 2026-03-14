import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  RequestAuthError,
  requireRequestAuth,
} from "@/server/auth/requestAuth";
import { deleteUserAccount } from "@/server/account/deleteAccount";

type AccountDeleteHandlerDependencies = {
  requireRequestAuth: typeof requireRequestAuth;
  createSupabaseAdminClient: typeof createSupabaseAdminClient;
  deleteUserAccount: typeof deleteUserAccount;
};

const defaultAccountDeleteHandlerDependencies: AccountDeleteHandlerDependencies = {
  requireRequestAuth,
  createSupabaseAdminClient,
  deleteUserAccount,
};

export function createAccountDeleteHandler(
  dependencies: Partial<AccountDeleteHandlerDependencies> = {}
) {
  const resolvedDependencies = {
    ...defaultAccountDeleteHandlerDependencies,
    ...dependencies,
  };

  return async function DELETE(request: Request) {
    let authResult: Awaited<ReturnType<typeof requireRequestAuth>>;

    try {
      authResult = await resolvedDependencies.requireRequestAuth(request);
    } catch (error) {
      if (error instanceof RequestAuthError) {
        return NextResponse.json({ error: error.message }, { status: error.status });
      }

      const message =
        error instanceof Error ? error.message : "Unable to verify your session.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    let supabaseAdmin: ReturnType<typeof createSupabaseAdminClient>;
    try {
      supabaseAdmin = resolvedDependencies.createSupabaseAdminClient();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Account deletion is temporarily unavailable.";
      return NextResponse.json({ error: message }, { status: 503 });
    }

    try {
      const result = await resolvedDependencies.deleteUserAccount(
        supabaseAdmin,
        authResult.user.id
      );

      return NextResponse.json(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Unable to delete your account right now.";
      return NextResponse.json({ error: message }, { status: 500 });
    }
  };
}
