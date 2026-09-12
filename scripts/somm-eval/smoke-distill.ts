/**
 * Smoke test for the palate distillation service — no DB required.
 * Feeds a synthetic PalateSignal (built from real blind-tasting picks) through
 * distillPalateProfile and prints the structured result.
 *
 *   npx tsx scripts/somm-eval/smoke-distill.ts
 */
import { distillPalateProfile, type PalateSignal } from "../../src/server/algorithm/palateDistillation";

const signal: PalateSignal = {
  entries: [
    { id: "1", wine_name: "Chateau Monbousquet", producer: "Chateau Monbousquet", vintage: "2020", wine_type: "red", canonical_region: "Saint-Emilion", canonical_country: "France", region: null, country: null, rating: 4, notes: "loved the plush dark fruit, preferred it over the Gigondas", created_at: "2026-06-20T00:00:00Z" },
    { id: "2", wine_name: "Testamatta", producer: "Bibi Graetz", vintage: "2019", wine_type: "red", canonical_region: "Toscana IGT", canonical_country: "Italy", region: null, country: null, rating: 4, notes: "beat the Heitz cab and the Barolo head to head for me", created_at: "2026-06-20T00:00:00Z" },
    { id: "3", wine_name: "Clos Marcilly", producer: "Les Heritiers Saint Genys", vintage: "2022", wine_type: "red", canonical_region: "Mercurey", canonical_country: "France", region: null, country: null, rating: 2, notes: "thin, lost every matchup", created_at: "2026-06-20T00:00:00Z" },
  ],
  survey: null,
  comparisons: [
    { response: "more", created_at: "2026-06-20T00:00:00Z", new_entry: { wine_name: "Chateau Monbousquet", producer: "Chateau Monbousquet" }, comparison_entry: { wine_name: "Viña Tondonia", producer: "Lopez de Heredia" } },
    { response: "less", created_at: "2026-06-20T00:00:00Z", new_entry: { wine_name: "Clos Marcilly", producer: "Les Heritiers Saint Genys" }, comparison_entry: { wine_name: "La Louisiane", producer: "Domaine Saint-Damien" } },
  ],
};

const started = Date.now();
distillPalateProfile(signal)
  .then((profile) => {
    console.log(`distilled in ${((Date.now() - started) / 1000).toFixed(1)}s\n`);
    console.log(JSON.stringify(profile, null, 2));
  })
  .catch((error) => {
    console.error("FAILED:", error);
    process.exit(1);
  });
