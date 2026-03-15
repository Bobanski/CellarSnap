import { Redirect } from "expo-router";
import { canAccessPrivateBetaFeatures } from "@cellarsnap/shared";
import ListScanIntakeScreen from "@/src/screens/listScan/ListScanIntakeScreen";
import { useAuth } from "@/src/providers/AuthProvider";

export default function ListScanRoute() {
  const { user } = useAuth();

  if (!canAccessPrivateBetaFeatures(user?.email)) {
    return <Redirect href="/(app)/home" />;
  }

  return <ListScanIntakeScreen />;
}
