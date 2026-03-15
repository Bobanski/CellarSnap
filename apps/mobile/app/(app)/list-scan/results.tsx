import { Redirect } from "expo-router";
import { canAccessPrivateBetaFeatures } from "@cellarsnap/shared";
import ListScanResultsScreen from "@/src/screens/listScan/ListScanResultsScreen";
import { useAuth } from "@/src/providers/AuthProvider";

export default function ListScanResultsRoute() {
  const { user } = useAuth();

  if (!canAccessPrivateBetaFeatures(user?.email)) {
    return <Redirect href="/(app)/home" />;
  }

  return <ListScanResultsScreen />;
}
