export const EVENT_TYPE_OPTIONS = [
  { value: "tasting", label: "Tasting" },
  { value: "blind_tasting", label: "Blind Tasting" },
  { value: "dinner", label: "Dinner" },
  { value: "lunch", label: "Lunch" },
  { value: "breakfast", label: "Breakfast" },
  { value: "happy_hour", label: "Happy Hour" },
  { value: "wine_night", label: "Wine Night with Friends" },
  { value: "date_night", label: "Date Night" },
  { value: "celebration", label: "Celebration" },
  { value: "industry_event", label: "Industry Event" },
  { value: "festival", label: "Festival" },
  { value: "in_store", label: "In-Store" },
  { value: "travel", label: "Travel" },
  { value: "pop_up", label: "Pop-up" },
  { value: "apres", label: "Aprés" },
  { value: "why_not", label: "Why Not" },
] as const;

export type EventTypeValue = (typeof EVENT_TYPE_OPTIONS)[number]["value"];

export const EVENT_TYPE_LABELS: Record<EventTypeValue, string> = Object.fromEntries(
  EVENT_TYPE_OPTIONS.map((opt) => [opt.value, opt.label])
) as Record<EventTypeValue, string>;
