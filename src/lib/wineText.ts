const ROMAN_NUMERAL_PATTERN =
  /^(?=[MDCLXVI])(M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3}))$/i;

function toNullableTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().replace(/\s+/g, " ");
  return trimmed.length > 0 ? trimmed : null;
}

function toTitleCaseSegment(segment: string) {
  if (!/[A-Za-z]/.test(segment)) {
    return segment;
  }

  if (ROMAN_NUMERAL_PATTERN.test(segment)) {
    return segment.toUpperCase();
  }

  const lower = segment.toLowerCase();
  return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
}

function toTitleCaseWord(word: string) {
  return word
    .split(/([-/'\u2019])/g)
    .map((segment) =>
      segment === "-" || segment === "/" || segment === "'" || segment === "\u2019"
        ? segment
        : toTitleCaseSegment(segment)
    )
    .join("");
}

export function toTitleCaseWineText(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((word) => toTitleCaseWord(word))
    .join(" ");
}

export function normalizeWineNameText(value: unknown) {
  const normalized = toNullableTrimmedString(value);
  return normalized ? toTitleCaseWineText(normalized) : null;
}

export function normalizeProducerText(value: unknown) {
  const normalized = toNullableTrimmedString(value);
  return normalized ? toTitleCaseWineText(normalized) : null;
}
