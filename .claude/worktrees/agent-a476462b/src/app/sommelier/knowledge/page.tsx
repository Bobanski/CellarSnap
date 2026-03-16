import SommelierKnowledgeAdmin from "@/features/sommelier/SommelierKnowledgeAdmin";
import { assertPrivateBetaFeatureAccessAsync } from "@/lib/access/privateBetaFeatures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SommelierKnowledgePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await assertPrivateBetaFeatureAccessAsync(supabase, user);

  return <SommelierKnowledgeAdmin />;
}
