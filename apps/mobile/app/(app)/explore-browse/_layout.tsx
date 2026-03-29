import { Stack } from "expo-router";

export default function ExploreBrowseLayout() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
