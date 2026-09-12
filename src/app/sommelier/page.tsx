import AppShell from "@/components/AppShell";
import SommelierChat from "@/features/sommelier/SommelierChat";
import { requireAuthenticatedPageUser } from "@/lib/access/pageAuth";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import {
  SOMMELIER_EYEBROW,
  SOMMELIER_SUBTITLE,
  SOMMELIER_TITLE,
} from "@shared";

export default async function SommelierPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  requireAuthenticatedPageUser(user);

  return (
    <AppShell>
      <div className="h-full px-6 py-6 text-[var(--color-text-primary)]">
        <div className="mx-auto flex h-full w-full max-w-6xl flex-1 flex-col gap-8">
          <header className="space-y-1">
            <span
              className="block"
              style={{
                fontSize: "9px",
                textTransform: "uppercase",
                letterSpacing: "3px",
                color: "var(--color-accent-secondary)",
              }}
            >
              {SOMMELIER_EYEBROW}
            </span>
            <h1
              className="font-serif"
              style={{
                fontSize: "28px",
                fontWeight: 300,
                color: "var(--color-text-primary)",
              }}
            >
              {SOMMELIER_TITLE}
            </h1>
            <p
              style={{
                fontSize: "12px",
                color: "var(--color-text-secondary)",
              }}
            >
              {SOMMELIER_SUBTITLE}
            </p>
          </header>
          <SommelierChat />
        </div>
      </div>
    </AppShell>
  );
}
