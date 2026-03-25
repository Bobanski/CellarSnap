import AppShell from "@/components/AppShell";
import SommelierChat from "@/features/sommelier/SommelierChat";
import { assertPrivateBetaFeatureAccessAsync } from "@/lib/access/privateBetaFeatures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SommelierPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await assertPrivateBetaFeatureAccessAsync(supabase, user);

  return (
    <AppShell>
      <div className="px-6 py-6 text-[var(--color-text-primary)]">
        <div className="mx-auto w-full max-w-6xl space-y-8">
          <SommelierChat />
        </div>
      </div>
    </AppShell>
  );
}
