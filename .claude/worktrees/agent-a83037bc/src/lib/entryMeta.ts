import {
  PRICE_PAID_CURRENCY_LABELS,
  PRICE_PAID_CURRENCY_VALUES,
  PRICE_PAID_SOURCE_LABELS,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_LABELS,
  QPR_LEVEL_VALUES,
  type PricePaidCurrency,
  type PricePaidSource,
  type QprLevel,
} from "@shared";

export {
  PRICE_PAID_CURRENCY_LABELS,
  PRICE_PAID_CURRENCY_VALUES,
  PRICE_PAID_SOURCE_LABELS,
  PRICE_PAID_SOURCE_VALUES,
  QPR_LEVEL_LABELS,
  QPR_LEVEL_VALUES,
  type PricePaidCurrency,
  type PricePaidSource,
  type QprLevel,
};

export const PRICE_PAID_CURRENCY_SYMBOLS: Record<PricePaidCurrency, string> = {
  usd: "$",
  eur: "€",
  gbp: "£",
  chf: "CHF",
  aud: "A$",
  mxn: "MX$",
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
