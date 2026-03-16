import { assertPrivateBetaFeatureAccessAsync } from "@/lib/access/privateBetaFeatures";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ListScanHistoryScreen from "@/features/listScan/ListScanHistoryScreen";

export default async function ListScanHistoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await assertPrivateBetaFeatureAccessAsync(supabase, user);

  return <ListScanHistoryScreen />;
}
