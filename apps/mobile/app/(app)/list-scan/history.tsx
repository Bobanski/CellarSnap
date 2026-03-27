import { Redirect } from "expo-router";
import ListScanHistoryScreen from "@/src/screens/listScan/ListScanHistoryScreen";
import { useAuth } from "@/src/providers/AuthProvider";

export default function ListScanHistoryRoute() {
  const { hasPrivateBetaFeatureAccess } = useAuth();

  if (!hasPrivateBetaFeatureAccess) {
    return <Redirect href="/(app)/home" />;
  }

  return <ListScanHistoryScreen />;
}
