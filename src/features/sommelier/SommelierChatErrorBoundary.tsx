"use client";

import { Component, type ReactNode } from "react";

/**
 * Scoped crash guard for Pocket Sommelier (P0 feedback round 2: a
 * "cannot read properties of undefined" crash was reported while typing,
 * but was not reproducible after extensive investigation — every code
 * path a keystroke can reach was audited and hardened, and the two
 * strongest hypotheses (an invalid audience_mode value, an undefined
 * wine.grapes array) were structurally ruled out: audience_mode is a
 * NOT NULL + CHECK-constrained DB column (supabase/sql/080_audience_mode.sql)
 * and grapes is always normalized to string[] server-side before it ever
 * reaches the client (src/server/labelAutofill/extractWineLabel.ts).
 *
 * This boundary exists as defense in depth regardless of root cause: if a
 * render-phase error ever does slip through, it should take down only the
 * chat pane — not the whole /sommelier page (header, bottom tab bar stay
 * usable) — and it should recover with a normal reset rather than forcing
 * a full page reload. React error boundaries only catch render/lifecycle
 * errors, not errors inside event handlers or async callbacks (those are
 * already caught by streamSommelierReply's own try/catch in
 * SommelierChat.tsx), so this specifically guards against an unexpected
 * throw during rendering.
 */
type Props = { children: ReactNode };
type State = { hasError: boolean };

export default class SommelierChatErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("[Pocket Sommelier] chat pane crashed:", error);
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex h-full min-h-0 flex-1 flex-col items-center justify-center gap-3 rounded-2xl border border-rose-300/30 bg-rose-500/10 px-6 py-10 text-center">
          <p className="text-sm font-medium text-rose-100">
            Pocket Sommelier hit a snag.
          </p>
          <p className="text-xs text-rose-100/70">
            Your conversation wasn&apos;t lost on the server — restarting the
            chat pane should pick back up cleanly.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-full border border-rose-200/25 px-4 py-1.5 text-xs font-medium text-rose-100 transition hover:border-rose-100/40 hover:bg-rose-200/10 focus:outline-none focus:ring-2 focus:ring-rose-200/40"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
