import { Stack } from "expo-router";
import { TasteSurveyProvider } from "@/src/lib/tasteSurvey/context";

export default function TasteSurveyLayout() {
  return (
    <TasteSurveyProvider>
      <Stack screenOptions={{ headerShown: false, animation: "slide_from_right" }}>
        <Stack.Screen name="index" />
      </Stack>
    </TasteSurveyProvider>
  );
}
