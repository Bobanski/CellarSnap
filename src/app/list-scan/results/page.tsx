import { Suspense } from "react";
import { assertPrivateBetaFeatureAccessAsync } from "@/lib/access/privateBetaFeatures";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ListScanResultsScreen from "@/features/listScan/ListScanResultsScreen";

function ListScanResultsPageFallback() {
  return (
    <div className="min-h-screen bg-[var(--color-screen-bg)] px-6 py-10 text-[var(--color-text-primary)]">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface-primary)] p-8">
          <div className="h-3 w-24 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
          <div className="mt-4 h-8 w-72 animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
          <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded-full bg-[var(--color-surface-hover)]" />
        </div>
      </div>
    </div>
  );
}

export default async function ListScanResultsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await assertPrivateBetaFeatureAccessAsync(supabase, user);

  return (
    <Suspense fallback={<ListScanResultsPageFallback />}>
      <ListScanResultsScreen />
    </Suspense>
  );
}
