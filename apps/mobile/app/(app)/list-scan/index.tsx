import { Redirect } from "expo-router";
import ListScanIntakeScreen from "@/src/screens/listScan/ListScanIntakeScreen";
import { useAuth } from "@/src/providers/AuthProvider";

export default function ListScanRoute() {
  const { hasPrivateBetaFeatureAccess } = useAuth();

  if (!hasPrivateBetaFeatureAccess) {
    return <Redirect href="/(app)/feed" />;
  }

  return <ListScanIntakeScreen />;
}
