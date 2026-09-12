import { requireAuthenticatedPageUser } from "@/lib/access/pageAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ListScanHistoryScreen from "@/features/listScan/ListScanHistoryScreen";

export default async function ListScanHistoryPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  requireAuthenticatedPageUser(user);

  return <ListScanHistoryScreen />;
}
