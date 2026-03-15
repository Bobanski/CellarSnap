import SommelierKnowledgeAdmin from "@/features/sommelier/SommelierKnowledgeAdmin";
import { assertPrivateBetaFeatureAccess } from "@/lib/access/privateBetaFeatures";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function SommelierKnowledgePage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  assertPrivateBetaFeatureAccess(user);

  return <SommelierKnowledgeAdmin />;
}
