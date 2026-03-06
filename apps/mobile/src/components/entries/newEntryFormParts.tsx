import { Children, useRef, useState, type ReactNode } from "react";
import { Dimensions, Modal, Pressable, ScrollView, View } from "react-native";
import { PRIVACY_LEVEL_LABELS, type PrivacyLevel } from "@cellarsnap/shared";
import { DoneTextInput } from "@/src/components/DoneTextInput";
import { AppText } from "@/src/components/AppText";
import {
  FIELD_ROW_GAP,
  formatYmd,
  formatYmdDisplay,
  getPrivacyBadgeTone,
  MONTH_LABELS,
  parseYmd,
  WEEKDAY_LABELS,
} from "@/src/lib/entryFlow/newEntryUtils";
import { styles } from "./newEntryStyles";

type ChipOption = {
  value: string;
  label: string;
};

export function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboardType = "default",
  autoCapitalize = "sentences",
  multiline = false,
  required = false,
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
    | "numeric"
    | "decimal-pad";
  autoCapitalize?: "none" | "sentences" | "words" | "characters";
  multiline?: boolean;
  required?: boolean;
}) {
  return (
    <View style={styles.block}>
      <View style={styles.labelRow}>
        <AppText style={styles.label}>{label}</AppText>
        {required ? <AppText style={styles.requiredStar}>*</AppText> : null}
      </View>
      <DoneTextInput
        value={value}
        onChangeText={onChange}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        autoCorrect={false}
        placeholder={placeholder}
        placeholderTextColor="#71717a"
        multiline={multiline}
        style={[styles.input, multiline ? styles.inputMultiline : null]}
      />
    </View>
  );
}

export function AdaptiveFieldRow({
  children,
  minColumnWidth,
}: {
  children: ReactNode;
  minColumnWidth: number;
}) {
  const [rowWidth, setRowWidth] = useState(0);
  const items = Children.toArray(children);
  const canUseTwoColumns =
    items.length === 2 &&
    rowWidth > 0 &&
    (rowWidth - FIELD_ROW_GAP) / 2 >= minColumnWidth;
  const twoColWidth = canUseTwoColumns ? (rowWidth - FIELD_ROW_GAP) / 2 : 0;

  return (
    <View
      style={styles.adaptiveRow}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        setRowWidth((current) => (current === nextWidth ? current : nextWidth));
      }}
    >
      {items.map((item, index) => (
        <View
          key={`adaptive-field-${index}`}
          style={[
            styles.adaptiveCol,
            canUseTwoColumns && twoColWidth > 0
              ? { width: twoColWidth }
              : styles.adaptiveColFull,
          ]}
        >
          {item}
        </View>
      ))}
    </View>
  );
}

export function SelectField({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  compact = false,
  placeholderLabel = "Not set",
  tone = "default",
  hideModalCloseAction = false,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<ChipOption>;
  onChange: (value: string) => void;
  hideLabel?: boolean;
  compact?: boolean;
  placeholderLabel?: string;
  tone?: "default" | "amber";
  hideModalCloseAction?: boolean;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const triggerRef = useRef<View>(null);
  const selectedLabel =
    options.find((option) => option.value === value)?.label ?? placeholderLabel;
  const hasSelection = value.trim().length > 0;

  const openPopover = () => {
    const trigger = triggerRef.current;
    if (!trigger) {
      setIsOpen(true);
      return;
    }

    requestAnimationFrame(() => {
      trigger.measureInWindow((x, y, width, height) => {
        const screen = Dimensions.get("window");
        const popoverWidth = Math.min(Math.max(width, 220), screen.width - 24);
        const left = Math.min(
          Math.max(12, x),
          Math.max(12, screen.width - popoverWidth - 12)
        );
        const spaceBelow = screen.height - (y + height) - 12;
        const spaceAbove = y - 12;
        const openAbove = spaceBelow < 176 && spaceAbove > spaceBelow;
        const maxHeight = Math.min(
          280,
          Math.max(160, (openAbove ? spaceAbove : spaceBelow) - 10)
        );
        const top = openAbove ? Math.max(12, y - maxHeight - 8) : y + height + 8;

        setPopoverLayout({
          top,
          left,
          width: popoverWidth,
          maxHeight,
        });
        setIsOpen(true);
      });
    });
  };

  return (
    <View style={compact ? styles.selectCompactBlock : styles.block}>
      {hideLabel ? null : <AppText style={styles.label}>{label}</AppText>}
      <Pressable
        ref={triggerRef}
        style={[
          styles.selectTrigger,
          compact ? styles.selectTriggerCompact : null,
          tone === "amber" && hasSelection ? styles.selectTriggerAmber : null,
          compact && tone === "amber" && hasSelection
            ? styles.selectTriggerCompactAmber
            : null,
        ]}
        onPress={openPopover}
      >
        <AppText
          style={[
            styles.selectTriggerText,
            compact ? styles.selectTriggerTextCompact : null,
            tone === "amber" && hasSelection ? styles.selectTriggerTextAmber : null,
          ]}
          numberOfLines={1}
        >
          {selectedLabel}
        </AppText>
        <AppText
          style={[
            styles.selectChevron,
            compact ? styles.selectChevronCompact : null,
            tone === "amber" && hasSelection ? styles.selectChevronAmber : null,
          ]}
        >
          v
        </AppText>
      </Pressable>
      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.popoverRoot}>
          <Pressable style={styles.modalDismissLayer} onPress={() => setIsOpen(false)} />
          {popoverLayout ? (
            <View
              style={[
                styles.selectPopoverCard,
                tone === "amber" ? styles.selectPopoverCardAmber : null,
                {
                  top: popoverLayout.top,
                  left: popoverLayout.left,
                  width: popoverLayout.width,
                  maxHeight: popoverLayout.maxHeight,
                },
              ]}
            >
              <View style={styles.selectModalHeader}>
                <AppText
                  style={[
                    styles.selectModalTitle,
                    tone === "amber" ? styles.selectModalTitleAmber : null,
                  ]}
                >
                  {label}
                </AppText>
                {!hideModalCloseAction ? (
                  <Pressable onPress={() => setIsOpen(false)}>
                    <AppText style={styles.selectModalCloseText}>Close</AppText>
                  </Pressable>
                ) : (
                  <View />
                )}
              </View>
              <ScrollView
                style={styles.selectPopoverList}
                keyboardShouldPersistTaps="handled"
              >
                {options.map((option) => {
                  const selected = option.value === value;
                  return (
                    <Pressable
                      key={`${label}-${option.value || "empty"}`}
                      style={[
                        styles.selectOption,
                        selected ? styles.selectOptionSelected : null,
                        selected && tone === "amber"
                          ? styles.selectOptionSelectedAmber
                          : null,
                      ]}
                      onPress={() => {
                        onChange(option.value);
                        setIsOpen(false);
                      }}
                    >
                      <AppText
                        style={[
                          styles.selectOptionText,
                          selected ? styles.selectOptionTextSelected : null,
                          selected && tone === "amber"
                            ? styles.selectOptionTextSelectedAmber
                            : null,
                        ]}
                      >
                        {option.label}
                      </AppText>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

export function VisibilitySelect({
  title,
  value,
  options,
  onChange,
}: {
  title: string;
  value: PrivacyLevel;
  options: ReadonlyArray<ChipOption>;
  onChange: (value: string) => void;
}) {
  const tone = getPrivacyBadgeTone(value);
  const badgeLabel = (PRIVACY_LEVEL_LABELS[value] ?? value).toUpperCase();

  return (
    <View style={styles.visibilityColumn}>
      <View style={styles.visibilityHeaderRow}>
        <AppText style={styles.visibilityTitle}>{title}</AppText>
        <View
          style={[
            styles.visibilityBadge,
            {
              backgroundColor: tone.backgroundColor,
              borderColor: tone.borderColor,
            },
          ]}
        >
          <AppText style={[styles.visibilityBadgeText, { color: tone.textColor }]}>
            {badgeLabel}
          </AppText>
        </View>
      </View>
      <SelectField
        label={title}
        value={value}
        options={options}
        onChange={onChange}
        hideLabel
      />
    </View>
  );
}

export function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [popoverLayout, setPopoverLayout] = useState<{
    top: number;
    left: number;
    width: number;
    openAbove: boolean;
    anchorX: number;
  } | null>(null);
  const selectedDate = parseYmd(value) ?? new Date();
  const [visibleMonth, setVisibleMonth] = useState(
    new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1)
  );
  const triggerRef = useRef<View>(null);

  const openPopover = () => {
    const nextSelectedDate = parseYmd(value) ?? new Date();
    setVisibleMonth(new Date(nextSelectedDate.getFullYear(), nextSelectedDate.getMonth(), 1));

    const trigger = triggerRef.current;
    if (!trigger) {
      setIsOpen(true);
      return;
    }

    requestAnimationFrame(() => {
      trigger.measureInWindow((x, y, width, height) => {
        const screen = Dimensions.get("window");
        const calendarSize = Math.min(292, screen.width - 24);
        const desiredHeight = calendarSize;
        const popoverWidth = calendarSize;
        const left = Math.min(
          Math.max(12, x),
          Math.max(12, screen.width - popoverWidth - 12)
        );
        const spaceBelow = screen.height - (y + height) - 12;
        const spaceAbove = y - 12;
        const openAbove = spaceBelow < desiredHeight && spaceAbove > spaceBelow;
        const top = openAbove
          ? Math.max(12, y - desiredHeight - 10)
          : Math.min(screen.height - desiredHeight - 12, y + height + 10);
        const triggerCenterX = x + width / 2;
        const anchorX = Math.max(
          18,
          Math.min(popoverWidth - 18, triggerCenterX - left)
        );

        setPopoverLayout({
          top,
          left,
          width: popoverWidth,
          openAbove,
          anchorX,
        });
        setIsOpen(true);
      });
    });
  };

  const year = visibleMonth.getFullYear();
  const month = visibleMonth.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: Array<number | null> = [];
  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(day);
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }

  return (
    <View style={styles.block}>
      <AppText style={styles.label}>{label}</AppText>
      <Pressable ref={triggerRef} style={styles.selectTrigger} onPress={openPopover}>
        <AppText style={styles.selectTriggerText}>{formatYmdDisplay(value)}</AppText>
        <AppText style={styles.selectChevron}>v</AppText>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.popoverRoot}>
          <Pressable style={styles.modalDismissLayer} onPress={() => setIsOpen(false)} />
          {popoverLayout ? (
            <View
              style={[
                styles.calendarPopoverWrap,
                {
                  top: popoverLayout.top,
                  left: popoverLayout.left,
                  width: popoverLayout.width,
                },
              ]}
            >
              {!popoverLayout.openAbove ? (
                <View
                  style={[
                    styles.popoverArrow,
                    styles.popoverArrowTop,
                    { left: popoverLayout.anchorX - 9 },
                  ]}
                />
              ) : null}

              <Pressable style={styles.calendarCard} onPress={() => {}}>
                <View style={styles.calendarHeader}>
                  <Pressable
                    style={styles.calendarNavButton}
                    onPress={() => setVisibleMonth(new Date(year, month - 1, 1))}
                  >
                    <AppText style={styles.calendarNavButtonText}>{"<"}</AppText>
                  </Pressable>
                  <AppText style={styles.calendarTitle}>
                    {MONTH_LABELS[month]} {year}
                  </AppText>
                  <Pressable
                    style={styles.calendarNavButton}
                    onPress={() => setVisibleMonth(new Date(year, month + 1, 1))}
                  >
                    <AppText style={styles.calendarNavButtonText}>{">"}</AppText>
                  </Pressable>
                </View>

                <View style={styles.weekdayRow}>
                  {WEEKDAY_LABELS.map((weekday) => (
                    <AppText key={weekday} style={styles.weekdayText}>
                      {weekday.toUpperCase()}
                    </AppText>
                  ))}
                </View>

                <View style={styles.calendarGrid}>
                  {cells.map((day, index) => {
                    if (day === null) {
                      return <View key={`blank-${index}`} style={styles.calendarSlot} />;
                    }
                    const isSelected =
                      selectedDate.getFullYear() === year &&
                      selectedDate.getMonth() === month &&
                      selectedDate.getDate() === day;
                    return (
                      <View key={`slot-${day}`} style={styles.calendarSlot}>
                        <Pressable
                          style={[
                            styles.calendarCell,
                            isSelected ? styles.calendarCellSelected : null,
                          ]}
                          onPress={() => {
                            onChange(formatYmd(new Date(year, month, day)));
                            setIsOpen(false);
                          }}
                        >
                          <AppText
                            style={[
                              styles.calendarCellText,
                              isSelected ? styles.calendarCellTextSelected : null,
                            ]}
                          >
                            {day}
                          </AppText>
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </Pressable>

              {popoverLayout.openAbove ? (
                <View
                  style={[
                    styles.popoverArrow,
                    styles.popoverArrowBottom,
                    { left: popoverLayout.anchorX - 9 },
                  ]}
                />
              ) : null}
            </View>
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

export function Accordion({
  title,
  description,
  expanded,
  onToggle,
  children,
}: {
  title: string;
  description: string;
  expanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.accordion}>
      <Pressable style={styles.accordionHeader} onPress={onToggle}>
        <View style={styles.accordionTitleRow}>
          <AppText style={styles.accordionChevron}>{expanded ? "\u25BE" : "\u25B8"}</AppText>
          <AppText style={styles.accordionTitle}>{title}</AppText>
        </View>
      </Pressable>
      {expanded ? (
        <View style={styles.accordionBody}>
          <AppText style={styles.hint}>{description}</AppText>
          <View style={styles.accordionFields}>{children}</View>
        </View>
      ) : null}
    </View>
  );
}
