import NavBar from "@/components/NavBar";
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
    <main className="min-h-screen bg-[#0f0a09] px-6 py-10 text-zinc-100">
      <div className="mx-auto w-full max-w-6xl space-y-8">
        <NavBar activeHrefOverride="/sommelier" />
        <SommelierChat />
      </div>
    </main>
  );
}
