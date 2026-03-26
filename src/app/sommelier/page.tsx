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
          <header className="space-y-1">
            <span
              className="block"
              style={{
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "3px",
                color: "var(--color-accent-secondary)",
              }}
            >
              Pocket Sommelier
            </span>
            <h1
              className="font-serif"
              style={{
                fontSize: "28px",
                fontWeight: 300,
                color: "var(--color-text-primary)",
              }}
            >
              Your personal wine brain.
            </h1>
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}
            >
              Powered by your palate, your cellar, and wine knowledge.
            </p>
          </header>
          <SommelierChat />
        </div>
      </div>
    </AppShell>
  );
}
