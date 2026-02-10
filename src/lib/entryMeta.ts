export const PRICE_PAID_SOURCE_VALUES = ["retail", "restaurant"] as const;
export type PricePaidSource = (typeof PRICE_PAID_SOURCE_VALUES)[number];

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

export const QPR_LEVEL_LABELS: Record<QprLevel, string> = {
  extortion: "Extortion",
  pricey: "Pricey",
  mid: "Mid",
  good_value: "Good Value",
  absolute_steal: "Absolute Steal",
};

const USD_FORMATTER = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatUsdAmount(amount: number | null | undefined): string | null {
  if (amount === null || amount === undefined || Number.isNaN(amount)) {
    return null;
  }

  return USD_FORMATTER.format(amount);
}
