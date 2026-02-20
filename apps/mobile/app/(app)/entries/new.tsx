import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { router } from "expo-router";
import {
  createEntryInputSchema,
  getTodayLocalYmd,
  toWineEntryInsertPayload,
} from "@cellarsnap/shared";
import { supabase } from "@/src/lib/supabase";
import { useAuth } from "@/src/providers/AuthProvider";

type EntryFormState = {
  wine_name: string;
  producer: string;
  vintage: string;
  rating: string;
  notes: string;
  consumed_at: string;
};

export default function NewEntryScreen() {
  const { user } = useAuth();
  const defaultConsumedDate = useMemo(() => getTodayLocalYmd(), []);
  const [form, setForm] = useState<EntryFormState>({
    wine_name: "",
    producer: "",
    vintage: "",
    rating: "",
    notes: "",
    consumed_at: defaultConsumedDate,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const updateField = (field: keyof EntryFormState, value: string) => {
    setForm((previous) => ({ ...previous, [field]: value }));
  };

  const goBackToEntries = () => {
    router.replace("/(app)/entries");
  };

  const submit = async () => {
    if (!user) {
      setErrorMessage("You must be signed in.");
      return;
    }

    const parsed = createEntryInputSchema.safeParse({
      wine_name: form.wine_name,
      producer: form.producer,
      vintage: form.vintage,
      rating: form.rating,
      notes: form.notes,
      consumed_at: form.consumed_at,
    });

    if (!parsed.success) {
      const firstMessage =
        parsed.error.issues[0]?.message ?? "Please correct the highlighted fields.";
      setErrorMessage(firstMessage);
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    const payload = toWineEntryInsertPayload(parsed.data, user.id);
    const { error } = await supabase.from("wine_entries").insert(payload);
    setIsSubmitting(false);

    if (error) {
      setErrorMessage(error.message);
      return;
    }

    router.replace("/(app)/entries");
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      style={styles.screen}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.navRow}>
          <Text style={styles.navBrand}>CellarSnap</Text>
          <Pressable style={styles.backButton} onPress={goBackToEntries}>
            <Text style={styles.backButtonText}>Back</Text>
          </Pressable>
        </View>

        <View style={styles.pageHeader}>
          <Text style={styles.eyebrow}>New entry</Text>
          <Text style={styles.title}>Add a bottle to your cellar.</Text>
          <Text style={styles.subtitle}>
            Capture the essentials now and refine tasting details later.
          </Text>
        </View>

        <View style={styles.formCard}>
          <Field
            label="Wine name"
            value={form.wine_name}
            onChange={(value) => updateField("wine_name", value)}
            placeholder="Required"
          />
          <Field
            label="Producer"
            value={form.producer}
            onChange={(value) => updateField("producer", value)}
          />
          <Field
            label="Vintage"
            value={form.vintage}
            onChange={(value) => updateField("vintage", value)}
          />
          <Field
            label="Rating (1-100)"
            value={form.rating}
            onChange={(value) => updateField("rating", value)}
            keyboardType="number-pad"
          />
          <Field
            label="Consumed date (YYYY-MM-DD)"
            value={form.consumed_at}
            onChange={(value) => updateField("consumed_at", value)}
            autoCapitalize="none"
          />
          <Field
            label="Notes"
            value={form.notes}
            onChange={(value) => updateField("notes", value)}
            multiline
            placeholder="Optional tasting notes"
          />

          {errorMessage ? <Text style={styles.errorText}>{errorMessage}</Text> : null}

          <View style={styles.actionRow}>
            <Pressable style={styles.cancelButton} onPress={goBackToEntries}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => void submit()}
              disabled={isSubmitting}
              style={[styles.submitButton, isSubmitting ? styles.submitDisabled : null]}
            >
              {isSubmitting ? (
                <ActivityIndicator color="#09090b" />
              ) : (
                <Text style={styles.submitButtonText}>Create Entry</Text>
              )}
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboardType?:
    | "default"
    | "number-pad"
    | "phone-pad"
    | "email-address"
    | "numeric";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        multiline={multiline}
        style={[
          styles.fieldInput,
          multiline ? styles.fieldInputMultiline : null,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: "#0f0a09",
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.06)",
    paddingBottom: 16,
  },
  navBrand: {
    color: "#fafafa",
    fontSize: 22,
    fontWeight: "700",
  },
  backButton: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backButtonText: {
    color: "#e4e4e7",
    fontSize: 12,
    fontWeight: "700",
  },
  pageHeader: {
    marginTop: 4,
    gap: 6,
  },
  eyebrow: {
    color: "#fcd34d",
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: "#fafafa",
    fontSize: 29,
    fontWeight: "700",
  },
  subtitle: {
    color: "#d4d4d8",
    fontSize: 14,
    lineHeight: 20,
  },
  formCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9,
  },
  fieldBlock: {
    gap: 6,
  },
  fieldLabel: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  fieldInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.1)",
    backgroundColor: "rgba(0, 0, 0, 0.3)",
    color: "#f4f4f5",
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  fieldInputMultiline: {
    minHeight: 108,
    textAlignVertical: "top",
  },
  errorText: {
    color: "#fda4af",
    fontSize: 13,
  },
  actionRow: {
    marginTop: 2,
    flexDirection: "row",
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.12)",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
  },
  cancelButtonText: {
    color: "#e4e4e7",
    fontSize: 14,
    fontWeight: "600",
  },
  submitButton: {
    flex: 1,
    borderRadius: 12,
    backgroundColor: "#fbbf24",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    minHeight: 46,
  },
  submitDisabled: {
    opacity: 0.55,
  },
  submitButtonText: {
    color: "#09090b",
    fontSize: 14,
    fontWeight: "700",
  },
});
