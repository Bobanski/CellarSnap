import { Redirect } from "expo-router";
import ListScanResultsScreen from "@/src/screens/listScan/ListScanResultsScreen";
import { useAuth } from "@/src/providers/AuthProvider";

export default function ListScanResultsRoute() {
  const { hasPrivateBetaFeatureAccess } = useAuth();

  if (!hasPrivateBetaFeatureAccess) {
    return <Redirect href="/(app)/feed" />;
  }

  return <ListScanResultsScreen />;
}
