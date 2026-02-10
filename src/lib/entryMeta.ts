export const PRICE_PAID_SOURCE_VALUES = ["retail", "restaurant"] as const;
export type PricePaidSource = (typeof PRICE_PAID_SOURCE_VALUES)[number];

export const PRICE_PAID_CURRENCY_VALUES = [
  "usd",
  "eur",
  "gbp",
  "chf",
  "aud",
  "mxn",
] as const;
export type PricePaidCurrency = (typeof PRICE_PAID_CURRENCY_VALUES)[number];

export const QPR_LEVEL_VALUES = [
  "extortion",
  "pricey",
  "mid",
  "good_value",
  "absolute_steal",
] as const;
export type QprLevel = (typeof QPR_LEVEL_VALUES)[number];

export const PRICE_PAID_SOURCE_LABELS: Record<PricePaidSource, string> = {
  retail: "Retail",
  restaurant: "Restaurant",
};

export const PRICE_PAID_CURRENCY_LABELS: Record<PricePaidCurrency, string> = {
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  chf: "CHF",
  aud: "AUD",
  mxn: "MXN",
};

export const PRICE_PAID_CURRENCY_SYMBOLS: Record<PricePaidCurrency, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  chf: "CHF",
  aud: "A$",
  mxn: "MX$",
};

export const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Mid",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
};

const PRICE_PAID_CURRENCY_INTL_CODES: Record<PricePaidCurrency, string> = {
  usd: "USD",
  eur: "EUR",
  gbp: "GBP",
  chf: "CHF",
  aud: "AUD",
  mxn: "MXN",
};

const CURRENCY_FORMATTER_CACHE = new Map<PricePaidCurrency, Intl.NumberFormat>();

function getCurrencyFormatter(currency: PricePaidCurrency): Intl.NumberFormat {
  const existing = CURRENCY_FORMATTER_CACHE.get(currency);
  if (existing) {
    return existing;
  }

  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: PRICE_PAID_CURRENCY_INTL_CODES[currency],
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  CURRENCY_FORMATTER_CACHE.set(currency, formatter);
  return formatter;
}

export function formatPricePaidAmount(
  amount: number | null | undefined,
  currency: PricePaidCurrency | null | undefined
): string | null {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return null;
  }

  return getCurrencyFormatter(currency ?? "usd").format(amount);
}

export function formatUsdAmount(amount: number | null | undefined): string | null {
  return formatPricePaidAmount(amount, "usd");
}

export const PRICE_PAID_CURRENCY_OPTIONS = PRICE_PAID_CURRENCY_VALUES.map(
  (currency) => ({
    value: currency,
    symbol: PRICE_PAID_CURRENCY_SYMBOLS[currency],
    label: PRICE_PAID_CURRENCY_LABELS[currency],
  })
);
