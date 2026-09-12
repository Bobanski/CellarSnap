import { ActivityIndicator, Image, Modal, Pressable, View } from "react-native";
import { SelectField } from "@/src/components/entries/newEntryFormParts";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { selectionTap } from "@/src/lib/haptics";
import {
  formatSurveyWineMeta,
  formatSurveyWineTitle,
  formatYmdDisplay,
} from "@/src/lib/entryFlow/newEntryUtils";
import type {
  ComparisonResponse,
  PendingPostSaveSurvey,
  SurveyEnjoymentIntentResponse,
  SurveyExpectationsResponse,
  SurveyHowWasItResponse,
} from "@/src/lib/entryFlow/usePostSaveSurveyFlow";
import { styles } from "./newEntryStyles";

type ChipOption = {
  value: string;
  label: string;
};

export function PostSaveSurveyModal({
  pendingPostSaveSurvey,
  postSaveSurveyStep,
  surveyHowWasIt,
  surveyExpectations,
  surveyEnjoymentIntent,
  surveyErrorMessage,
  isSubmittingSurvey,
  canSubmitPostSaveSurvey,
  howWasItOptions,
  expectationsOptions,
  enjoymentIntentOptions,
  onSurveyHowWasItChange,
  onSurveyExpectationsChange,
  onSurveyEnjoymentIntentChange,
  onSubmitPostSaveSurvey,
  onSkipPostSaveComparison,
  onSubmitPostSaveComparison,
}: {
  pendingPostSaveSurvey: PendingPostSaveSurvey | null;
  postSaveSurveyStep: "survey" | "comparison";
  surveyHowWasIt: SurveyHowWasItResponse | "";
  surveyExpectations: SurveyExpectationsResponse | "";
  surveyEnjoymentIntent: SurveyEnjoymentIntentResponse | "";
  surveyErrorMessage: string | null;
  isSubmittingSurvey: boolean;
  canSubmitPostSaveSurvey: boolean;
  howWasItOptions: ReadonlyArray<ChipOption>;
  expectationsOptions: ReadonlyArray<ChipOption>;
  enjoymentIntentOptions: ReadonlyArray<ChipOption>;
  onSurveyHowWasItChange: (value: SurveyHowWasItResponse | "") => void;
  onSurveyExpectationsChange: (value: SurveyExpectationsResponse | "") => void;
  onSurveyEnjoymentIntentChange: (value: SurveyEnjoymentIntentResponse | "") => void;
  onSubmitPostSaveSurvey: () => Promise<void>;
  onSkipPostSaveComparison: () => void;
  onSubmitPostSaveComparison: (response: ComparisonResponse) => Promise<void>;
}) {
  return (
    <Modal
      visible={Boolean(pendingPostSaveSurvey)}
      transparent
      animationType="fade"
      onRequestClose={() => undefined}
    >
      <View style={styles.surveyModalRoot}>
        <View
          style={[
            styles.surveyCard,
            postSaveSurveyStep === "comparison" ? styles.surveyCardComparison : null,
          ]}
        >
          {postSaveSurveyStep === "survey" ? (
            <>
              <View style={styles.surveyHeader}>
                <AppText style={styles.eyebrow}>Required survey</AppText>
                <AppText style={styles.surveyTitle}>Quick check-in</AppText>
              </View>

              <SelectField
                label="How was it?"
                value={surveyHowWasIt}
                options={howWasItOptions}
                onChange={(value) => {
                  selectionTap();
                  onSurveyHowWasItChange(value as SurveyHowWasItResponse | "");
                }}
                placeholderLabel="Select one"
                tone="accent"
                hideModalCloseAction
              />
              <SelectField
                label="How did it compare to your expectations?"
                value={surveyExpectations}
                options={expectationsOptions}
                onChange={(value) =>
                  onSurveyExpectationsChange(value as SurveyExpectationsResponse | "")
                }
                placeholderLabel="Select one"
                tone="accent"
                hideModalCloseAction
              />
              <SelectField
                label="Would you seek this out again?"
                value={surveyEnjoymentIntent}
                options={enjoymentIntentOptions}
                onChange={(value) =>
                  onSurveyEnjoymentIntentChange(value as SurveyEnjoymentIntentResponse | "")
                }
                placeholderLabel="Select one"
                tone="accent"
                hideModalCloseAction
              />

              {surveyErrorMessage ? (
                <AppText style={styles.error}>{surveyErrorMessage}</AppText>
              ) : null}

              <Pressable
                style={[
                  styles.surveySubmitButton,
                  !canSubmitPostSaveSurvey || isSubmittingSurvey
                    ? styles.submitButtonDisabled
                    : null,
                ]}
                onPress={() => void onSubmitPostSaveSurvey()}
                disabled={!canSubmitPostSaveSurvey || isSubmittingSurvey}
              >
                {isSubmittingSurvey ? (
                  <ActivityIndicator color={colors.screenBg} />
                ) : (
                  <AppText style={styles.submitButtonText}>Save and continue</AppText>
                )}
              </Pressable>
            </>
          ) : pendingPostSaveSurvey?.candidate ? (
            <>
              <View style={styles.surveyCompareHeader}>
                <AppText style={styles.surveyCompareTitleHeading}>
                  Which wine did you like more?
                </AppText>
                <Pressable
                  style={styles.surveySkipButton}
                  onPress={onSkipPostSaveComparison}
                  disabled={isSubmittingSurvey}
                >
                  <AppText style={styles.surveySkipText}>Skip</AppText>
                </Pressable>
              </View>

              {surveyErrorMessage ? (
                <AppText style={styles.error}>{surveyErrorMessage}</AppText>
              ) : null}

              <View style={styles.surveyCompareSection}>
                <View style={styles.surveyCompareRow}>
                  <Pressable
                    style={styles.surveyCompareCard}
                    onPress={() => void onSubmitPostSaveComparison("more")}
                    disabled={isSubmittingSurvey}
                  >
                    <View style={styles.surveyCompareImageWrap}>
                      {pendingPostSaveSurvey.new_wine_image_url ? (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image
                          source={{ uri: pendingPostSaveSurvey.new_wine_image_url }}
                          style={styles.surveyCompareImage}
                        />
                      ) : (
                        <View style={styles.surveyCompareImageFallback}>
                          <AppText style={styles.hint}>No photo</AppText>
                        </View>
                      )}
                    </View>
                    <View style={styles.surveyCompareBody}>
                      <AppText style={styles.surveyCompareTag}>Wine you logged</AppText>
                      <AppText style={styles.surveyCompareTitle} numberOfLines={2}>
                        {formatSurveyWineTitle(pendingPostSaveSurvey)}
                      </AppText>
                      <AppText style={styles.surveyCompareMeta} numberOfLines={2}>
                        {formatSurveyWineMeta(pendingPostSaveSurvey)}
                      </AppText>
                    </View>
                  </Pressable>

                  <Pressable
                    style={styles.surveyCompareCard}
                    onPress={() => void onSubmitPostSaveComparison("less")}
                    disabled={isSubmittingSurvey}
                  >
                    <View style={styles.surveyCompareImageWrap}>
                      {pendingPostSaveSurvey.candidate.label_image_url ? (
                        // eslint-disable-next-line jsx-a11y/alt-text
                        <Image
                          source={{ uri: pendingPostSaveSurvey.candidate.label_image_url }}
                          style={styles.surveyCompareImage}
                        />
                      ) : (
                        <View style={styles.surveyCompareImageFallback}>
                          <AppText style={styles.hint}>No photo</AppText>
                        </View>
                      )}
                    </View>
                    <View style={styles.surveyCompareBody}>
                      <AppText style={styles.surveyCompareTag}>Previous wine</AppText>
                      <AppText style={styles.surveyCompareTitle} numberOfLines={2}>
                        {formatSurveyWineTitle(pendingPostSaveSurvey.candidate)}
                      </AppText>
                      <AppText style={styles.surveyCompareMeta} numberOfLines={2}>
                        {formatSurveyWineMeta(pendingPostSaveSurvey.candidate)}
                      </AppText>
                      <AppText style={styles.surveyCompareMeta}>
                        Logged {formatYmdDisplay(pendingPostSaveSurvey.candidate.consumed_at)}
                      </AppText>
                    </View>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
