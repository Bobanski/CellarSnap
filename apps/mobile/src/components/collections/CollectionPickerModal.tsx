import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import {
  COLLECTIONS_COPY,
  type CollectionOption,
} from "@cellarsnap/shared";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import { colors } from "@/src/lib/theme";
import { fonts } from "@/src/lib/typography";

type CollectionPickerModalProps = {
  visible: boolean;
  title?: string;
  subtitle?: string | null;
  collections: CollectionOption[];
  selectedIds: string[];
  lockedIds?: string[];
  onToggleCollection: (collectionId: string) => void;
  onClose: () => void;
  onCreateCollection: (name: string) => Promise<void>;
  primaryActionLabel?: string;
  onPrimaryAction?: () => void;
  primaryActionDisabled?: boolean;
  busy?: boolean;
  creating?: boolean;
};

function buildSummary(collections: CollectionOption[], selectedIds: string[]) {
  if (selectedIds.length === 0) {
    return COLLECTIONS_COPY.fieldPlaceholder;
  }

  const selectedNames = collections
    .filter((collection) => selectedIds.includes(collection.id))
    .map((collection) => collection.name);

  if (selectedNames.length === 0) {
    return COLLECTIONS_COPY.fieldPlaceholder;
  }

  if (selectedNames.length === 1) {
    return selectedNames[0];
  }

  if (selectedNames.length === 2) {
    return selectedNames.join(", ");
  }

  return `${selectedNames.slice(0, 2).join(", ")} +${selectedNames.length - 2}`;
}

export function CollectionField({
  label = COLLECTIONS_COPY.sectionTitle,
  description,
  collections,
  selectedIds,
  onPress,
}: {
  label?: string;
  description?: string;
  collections: CollectionOption[];
  selectedIds: string[];
  onPress: () => void;
}) {
  const summary = useMemo(
    () => buildSummary(collections, selectedIds),
    [collections, selectedIds]
  );

  return (
    <View style={styles.fieldBlock}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      {description ? (
        <AppText style={styles.fieldDescription}>{description}</AppText>
      ) : null}
      <Pressable style={styles.fieldTrigger} onPress={onPress}>
        <AppText
          style={[
            styles.fieldTriggerText,
            selectedIds.length === 0 ? styles.fieldTriggerPlaceholder : null,
          ]}
          numberOfLines={2}
        >
          {summary}
        </AppText>
        <AppText style={styles.fieldChevron}>v</AppText>
      </Pressable>
    </View>
  );
}

export function CollectionPickerModal({
  visible,
  title = COLLECTIONS_COPY.pickerTitle,
  subtitle = null,
  collections,
  selectedIds,
  lockedIds = [],
  onToggleCollection,
  onClose,
  onCreateCollection,
  primaryActionLabel = COLLECTIONS_COPY.doneActionLabel,
  onPrimaryAction,
  primaryActionDisabled = false,
  busy = false,
  creating = false,
}: CollectionPickerModalProps) {
  const [newCollectionName, setNewCollectionName] = useState("");
  const [showCreateInput, setShowCreateInput] = useState(false);

  const handleCreate = async () => {
    const trimmed = newCollectionName.trim();
    if (!trimmed || creating) {
      return;
    }
    await onCreateCollection(trimmed);
    setNewCollectionName("");
    setShowCreateInput(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <View style={styles.modalHeaderCopy}>
              <AppText style={styles.modalTitle}>{title}</AppText>
              {subtitle ? (
                <AppText style={styles.modalSubtitle}>{subtitle}</AppText>
              ) : null}
            </View>
            <Pressable onPress={onClose}>
              <AppText style={styles.modalCloseText}>Close</AppText>
            </Pressable>
          </View>

          <ScrollView
            style={styles.modalList}
            contentContainerStyle={styles.modalListContent}
            keyboardShouldPersistTaps="handled"
          >
            {collections.length > 0 ? (
              collections.map((collection) => {
                const selected = selectedIds.includes(collection.id);
                const locked = lockedIds.includes(collection.id) && selected;
                return (
                  <Pressable
                    key={collection.id}
                    style={[
                      styles.collectionRow,
                      selected ? styles.collectionRowSelected : null,
                      locked ? styles.collectionRowLocked : null,
                    ]}
                    onPress={() => {
                      if (locked) {
                        return;
                      }
                      onToggleCollection(collection.id);
                    }}
                  >
                    <View style={styles.collectionCheckbox}>
                      {selected ? <View style={styles.collectionCheckboxFill} /> : null}
                    </View>
                    <View style={styles.collectionRowCopy}>
                      <AppText
                        style={[
                          styles.collectionRowText,
                          selected ? styles.collectionRowTextSelected : null,
                        ]}
                      >
                        {collection.name}
                      </AppText>
                      {locked ? (
                        <AppText style={styles.collectionRowMeta}>Already saved</AppText>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })
            ) : (
              <AppText style={styles.emptyText}>{COLLECTIONS_COPY.emptySubtitle}</AppText>
            )}

            <View style={styles.createWrap}>
              {!showCreateInput ? (
                <Pressable
                  style={styles.createButton}
                  onPress={() => setShowCreateInput(true)}
                >
                  <AppText style={styles.createButtonText}>
                    {COLLECTIONS_COPY.addNewLabel}
                  </AppText>
                </Pressable>
              ) : (
                <View style={styles.createInputWrap}>
                  <DoneTextInput
                    value={newCollectionName}
                    onChangeText={setNewCollectionName}
                    placeholder="Collection name"
                    placeholderTextColor={colors.textSecondary}
                    style={styles.createInput}
                    autoCapitalize="words"
                    autoCorrect={false}
                  />
                  <View style={styles.createActions}>
                    <Pressable
                      style={styles.secondaryAction}
                      onPress={() => {
                        setShowCreateInput(false);
                        setNewCollectionName("");
                      }}
                    >
                      <AppText style={styles.secondaryActionText}>Cancel</AppText>
                    </Pressable>
                    <Pressable
                      style={[
                        styles.primaryAction,
                        !newCollectionName.trim() || creating
                          ? styles.primaryActionDisabled
                          : null,
                      ]}
                      onPress={() => {
                        void handleCreate();
                      }}
                      disabled={!newCollectionName.trim() || creating}
                    >
                      {creating ? (
                        <ActivityIndicator color={colors.textOnAccent} />
                      ) : (
                        <AppText style={styles.primaryActionText}>
                          {COLLECTIONS_COPY.createActionLabel}
                        </AppText>
                      )}
                    </Pressable>
                  </View>
                </View>
              )}
            </View>
          </ScrollView>

          <View style={styles.footer}>
            <Pressable style={styles.secondaryAction} onPress={onClose}>
              <AppText style={styles.secondaryActionText}>Cancel</AppText>
            </Pressable>
            <Pressable
              style={[
                styles.primaryAction,
                primaryActionDisabled || busy ? styles.primaryActionDisabled : null,
              ]}
              onPress={onPrimaryAction ?? onClose}
              disabled={primaryActionDisabled || busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <AppText style={styles.primaryActionText}>{primaryActionLabel}</AppText>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fieldBlock: {
    gap: 8,
  },
  fieldLabel: {
    color: colors.textPrimary,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
  },
  fieldDescription: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  fieldTrigger: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  fieldTriggerText: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
  },
  fieldTriggerPlaceholder: {
    color: colors.textSecondary,
  },
  fieldChevron: {
    color: colors.textSecondary,
    fontSize: 14,
    fontWeight: "700",
  },
  modalRoot: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(10, 12, 16, 0.72)",
  },
  modalCard: {
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfacePrimary,
    padding: 18,
    gap: 14,
    maxHeight: "82%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  modalHeaderCopy: {
    flex: 1,
    gap: 6,
  },
  modalTitle: {
    color: colors.textPrimary,
    fontFamily: fonts.serif.regular,
    fontSize: 24,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  modalCloseText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "700",
  },
  modalList: {
    maxHeight: 360,
  },
  modalListContent: {
    gap: 10,
    paddingBottom: 4,
  },
  collectionRow: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  collectionRowSelected: {
    borderColor: colors.accentSecondary,
    backgroundColor: "rgba(123,29,58,0.16)",
  },
  collectionRowLocked: {
    opacity: 0.88,
  },
  collectionCheckbox: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
  },
  collectionCheckboxFill: {
    width: 10,
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.accentSecondary,
  },
  collectionRowText: {
    color: colors.textPrimary,
    fontSize: 14,
  },
  collectionRowTextSelected: {
    color: colors.accentSecondary,
    fontWeight: "700",
  },
  collectionRowCopy: {
    flex: 1,
    gap: 3,
  },
  collectionRowMeta: {
    color: colors.textSecondary,
    fontSize: 11,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
  },
  createWrap: {
    paddingTop: 4,
    gap: 10,
  },
  createButton: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  createButtonText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  createInputWrap: {
    gap: 10,
  },
  createInput: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.textPrimary,
    fontSize: 14,
  },
  createActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
  },
  secondaryAction: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    paddingHorizontal: 16,
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  secondaryActionText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: "700",
  },
  primaryAction: {
    borderRadius: 999,
    backgroundColor: colors.grenache,
    paddingHorizontal: 16,
    paddingVertical: 10,
    minWidth: 132,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryActionDisabled: {
    opacity: 0.55,
  },
  primaryActionText: {
    color: colors.textOnAccent,
    fontSize: 13,
    fontWeight: "700",
  },
});
