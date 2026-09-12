import { requireAuthenticatedPageUser } from "@/lib/access/pageAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import ListScanIntakeScreen from "@/features/listScan/ListScanIntakeScreen";

export default async function ListScanPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  requireAuthenticatedPageUser(user);

  return <ListScanIntakeScreen />;
}
