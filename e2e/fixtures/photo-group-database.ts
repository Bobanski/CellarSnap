import { readFile } from "node:fs/promises";

export const photoGroupMigration = "supabase/sql/20260912214315_enforce_photo_and_group_metadata_privacy.sql";
export const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Captured catalog is DDL evidence, never user data or executable app input. */
export async function photoGroupBaselineSql() {
  const policies = JSON.parse(await readFile("docs/remediation/evidence/b02b1-live-policies.json", "utf8")) as Array<{
    tablename: string; policyname: string; roles: string[] | string; cmd: string; qual: string | null; with_check: string | null;
  }>;
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  return (await readFile("e2e/fixtures/photo-group-schema.sql", "utf8")) + "\n" + policies
    .filter(p => p.tablename !== "wine_entries")
    .map(p => {
      const roles = Array.isArray(p.roles) ? p.roles : p.roles.slice(1, -1).split(",");
      return `drop policy if exists ${quote(p.policyname)} on public.${quote(p.tablename)};
create policy ${quote(p.policyname)} on public.${quote(p.tablename)} for ${p.cmd} to ${roles.map(quote).join(",")}
${p.qual ? `using (${p.qual})` : ""} ${p.with_check ? `with check (${p.with_check})` : ""};`;
    }).join("\n");
}
