"use client";

/**
 * Canonical button set — design-audit spec B (docs/audits/design-audit.md).
 *
 * Collapses ~10 ad-hoc button treatments into 5 primitives + 1 segmented
 * control:
 *   - Button (primary | secondary | ghost)
 *   - Chip (filter | tag)
 *   - SegmentedControl (built from Chip/filter)
 *
 * Hard rules baked in here so drift can't creep back in:
 *   - `primary` rests on --color-accent-primary (base Grenache), never
 *     --color-accent-hover. Hover moves *to* accent-hover.
 *   - `ghost` absorbs the uppercase-tracked text-link style (SHOW,
 *     FORGOT PASSWORD?, EXPLORE →) — one look for all of them.
 *   - `Chip/tag` tone="premium" is the only chip allowed to render gold;
 *     default tone is a neutral tint. No more per-taxonomy-category colors.
 */

import Link from "next/link";
import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost";
export type ButtonSize = "md" | "sm" | "xs";

type CommonProps = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  /** Appends a rightward arrow glyph — used by the ghost variant's "EXPLORE →" pattern. */
  arrow?: boolean;
  className?: string;
  children: ReactNode;
};

type ButtonAsButton = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> & {
    href?: undefined;
  };

type ButtonAsLink = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "href"> & {
    href: string;
  };

export type ButtonProps = ButtonAsButton | ButtonAsLink;

const BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition-[background-color,border-color,color,transform] duration-[var(--motion-duration-standard)] ease-[var(--motion-ease-standard)] disabled:cursor-not-allowed disabled:opacity-50 active:scale-[0.98]";

const PILL_VARIANT_CLASSES: Record<"primary" | "secondary", string> = {
  primary:
    "border border-transparent bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)] hover:bg-[var(--color-accent-hover)]",
  secondary:
    "border border-[var(--color-border-strong)] bg-transparent text-[var(--color-text-primary)] hover:border-[var(--color-accent-secondary)]/60 hover:text-[var(--color-accent-secondary)]",
};

const PILL_SIZE_CLASSES: Record<ButtonSize, string> = {
  md: "px-6 py-3 text-sm",
  sm: "px-4 py-2 text-sm",
  xs: "px-3 py-1.5 text-xs",
};

const GHOST_CLASSES =
  "border-none bg-transparent px-0 py-0 text-xs uppercase tracking-[0.16em] text-[var(--color-accent-secondary)] hover:text-[var(--color-text-primary)]";

function buildClassName({
  variant = "primary",
  size = "md",
  fullWidth,
  className = "",
}: Pick<CommonProps, "variant" | "size" | "fullWidth" | "className">) {
  if (variant === "ghost") {
    return `${BASE} ${GHOST_CLASSES} ${fullWidth ? "w-full" : ""} ${className}`.trim();
  }
  return `${BASE} ${PILL_VARIANT_CLASSES[variant]} ${PILL_SIZE_CLASSES[size]} ${
    fullWidth ? "w-full" : ""
  } ${className}`.trim();
}

/** Canonical button. Renders a `<Link>` when `href` is passed, else a `<button>`. */
export default function Button(props: ButtonProps) {
  const { variant, size, fullWidth, arrow, className, children, ...rest } = props;
  const classes = buildClassName({ variant, size, fullWidth, className });
  const content = arrow ? (
    <>
      {children} <span aria-hidden="true">&rarr;</span>
    </>
  ) : (
    children
  );

  if ("href" in props && props.href !== undefined) {
    const anchorRest = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string };
    return (
      <Link className={classes} {...anchorRest}>
        {content}
      </Link>
    );
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button type="button" className={classes} {...buttonRest}>
      {content}
    </button>
  );
}

/* ─── Chip — filter (segmented options, sort/filter/organize) & tag (taxonomy) ─── */

type ChipCommon = {
  className?: string;
  children: ReactNode;
};

type ChipFilterProps = ChipCommon & {
  variant: "filter";
  selected?: boolean;
  onClick?: () => void;
  type?: "button" | "submit";
};

type ChipTagProps = ChipCommon & {
  variant: "tag";
  /** premium is the ONLY tag tone allowed to use gold (design-audit spec D). */
  tone?: "neutral" | "premium";
};

export type ChipProps = ChipFilterProps | ChipTagProps;

const CHIP_BASE =
  "inline-flex items-center justify-center rounded-full border text-xs font-semibold transition-colors duration-[var(--motion-duration-fast)] ease-[var(--motion-ease-standard)] px-3 py-1.5";

export function Chip(props: ChipProps) {
  if (props.variant === "filter") {
    const { selected, onClick, className = "", children, type = "button" } = props;
    return (
      <button
        type={type}
        onClick={onClick}
        aria-pressed={selected}
        className={`${CHIP_BASE} ${
          selected
            ? "border-transparent bg-[var(--color-accent-primary)] text-[var(--color-text-on-accent)]"
            : "border-[var(--color-border)] bg-transparent text-[var(--color-text-secondary)] hover:border-[var(--color-border-strong)] hover:text-[var(--color-text-primary)]"
        } ${className}`.trim()}
      >
        {children}
      </button>
    );
  }

  const { tone = "neutral", className = "", children } = props;
  return (
    <span
      className={`${CHIP_BASE} ${
        tone === "premium"
          ? "border-[var(--color-accent-gold)]/40 bg-[var(--color-accent-gold)]/10 text-[var(--color-accent-gold)]"
          : "border-[var(--color-border)] bg-[var(--color-surface-tinted)] text-[var(--color-text-secondary)]"
      } ${className}`.trim()}
    >
      {children}
    </span>
  );
}

/* ─── SegmentedControl — the ONE segmented-control style (spec B) ─── */

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex flex-wrap items-center gap-2 ${className}`.trim()}
    >
      {options.map((option) => (
        <Chip
          key={option.value}
          variant="filter"
          selected={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </Chip>
      ))}
    </div>
  );
}
