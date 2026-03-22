# TASK: NLP Extraction from Free-Text Tasting Notes

**Branch:** `feat/nlp-tasting-notes`
**Assigned to:** Codex
**Priority:** Medium — supplements the base profile preference system from the other branch

---

## ⚠️ PARALLEL AGENT WARNING

You are working in parallel with other agents on different branches. **Before every git operation:**

```bash
# Verify you're on the correct branch
git branch --show-current
# Expected output: feat/nlp-tasting-notes

# If not on the right branch:
git checkout feat/nlp-tasting-notes

# NEVER commit to main. NEVER merge into main yourself.
# If you need to pull latest main:
git fetch origin main
git rebase origin/main
```

**Other branches being worked on simultaneously:**
- `feat/back-derive-preferences` (Codex — that's you too, but different worktree!) — modifies `userPreferences.ts`, `handler.ts`
- `feat/composite-enjoyment` (Claude Code) — modifies `scoringEngine.ts`, survey UI, types

**If you're the same Codex agent working both branches**, use git worktrees:
```bash
# Set up worktrees (run once from the repo root)
git worktree add ../CellarSnap-nlp feat/nlp-tasting-notes
git worktree add ../CellarSnap-prefs feat/back-derive-preferences

# Then cd into the appropriate directory for each task
cd ../CellarSnap-nlp    # for this task
cd ../CellarSnap-prefs  # for the other task
```

**Your files (NEW files — should NOT overlap with other branches):**
- `src/server/algorithm/notesNlp.ts` — NEW file, the NLP extraction module
- `src/server/algorithm/notesNlp.test.ts` — NEW file, unit tests
- `src/server/algorithm/noteDescriptors.ts` — NEW file, descriptor lexicon

**Files you MAY READ but should NOT MODIFY (being changed by other branches):**
- `src/server/algorithm/userPreferences.ts` — owned by `feat/back-derive-preferences`
- `src/server/algorithm/scoringEngine.ts` — owned by `feat/composite-enjoyment`
- `src/server/algorithm/types.ts` — owned by `feat/composite-enjoyment` (but you may need to import from it)

**Files you CAN modify (coordination point — see notes below):**
- `src/server/algorithm/types.ts` — ONLY to add the `NlpNotesExtraction` type. Do NOT modify existing types. The orchestrator will handle merge conflicts if any.

---

## Problem Statement

About 50% of wine entries (roughly 59/118) have free-text tasting notes in the `notes` field of `wine_entries`. These contain valuable sensory descriptors that are currently completely ignored by the algorithm. Examples:

- "Dark fruit, leather, tobacco. Full bodied with soft tannins."
- "Citrus and green apple, very crisp. Light body."
- "Rich and jammy, lots of oak. Could age well."

These notes can supplement the base profile preferences (from the other branch) by extracting:
1. **Sensory axis hints** — words that map to specific axes (e.g., "full bodied" → body=5, "crisp" → acidity=4)
2. **Descriptor clusters** — aroma/flavor families (dark fruit, citrus, earthy, etc.)
3. **Sentiment** — overall positive/negative tone

## Architecture

### This is a standalone module
The NLP module should be self-contained with a clean interface. It does NOT modify any existing files except to export types. Integration into the preference pipeline will be done by the orchestrator after all three branches merge.

### Output type
```typescript
export type NlpNotesExtraction = {
  // Sensory axis hints: partial vector with confidence scores
  sensoryHints: Partial<Record<SensoryAxis, { value: number; confidence: number }>>;
  // Detected descriptor clusters
  descriptorClusters: {
    primary: string[];   // dominant descriptors ("dark fruit", "cherry", "leather")
    secondary: string[]; // supporting descriptors ("vanilla", "smoke")
  };
  // Overall sentiment: -1 (very negative) to +1 (very positive)
  sentiment: number;
  // How many meaningful tokens were found
  tokenCount: number;
};
```

## Implementation

### 1. `src/server/algorithm/noteDescriptors.ts` — Descriptor Lexicon

Create a comprehensive keyword→axis mapping. This is a rule-based approach (no ML needed for 118 entries). The lexicon maps tasting descriptors to sensory axes and values.

```typescript
import type { SensoryAxis } from "@/server/algorithm/types";

export type DescriptorMapping = {
  axis: SensoryAxis;
  value: number;        // 1-5 scale
  confidence: number;   // 0-1, how strongly this word implies the value
};

// Each key is a normalized lowercase descriptor phrase
export const DESCRIPTOR_LEXICON: Record<string, DescriptorMapping[]> = {
  // Body indicators
  "full bodied": [{ axis: "body", value: 5, confidence: 0.9 }],
  "full body": [{ axis: "body", value: 5, confidence: 0.9 }],
  "medium bodied": [{ axis: "body", value: 3, confidence: 0.85 }],
  "medium body": [{ axis: "body", value: 3, confidence: 0.85 }],
  "light bodied": [{ axis: "body", value: 1.5, confidence: 0.9 }],
  "light body": [{ axis: "body", value: 1.5, confidence: 0.9 }],
  "heavy": [{ axis: "body", value: 4.5, confidence: 0.6 }],
  "thin": [{ axis: "body", value: 1.5, confidence: 0.6 }],
  "rich": [{ axis: "body", value: 4, confidence: 0.5 }, { axis: "concentration", value: 4, confidence: 0.5 }],
  "dense": [{ axis: "body", value: 4.5, confidence: 0.7 }, { axis: "concentration", value: 4.5, confidence: 0.7 }],
  "elegant": [{ axis: "body", value: 2.5, confidence: 0.4 }, { axis: "complexity", value: 4, confidence: 0.5 }],
  "powerful": [{ axis: "body", value: 4.5, confidence: 0.6 }, { axis: "concentration", value: 4.5, confidence: 0.5 }],

  // Acidity indicators
  "crisp": [{ axis: "acidity", value: 4, confidence: 0.8 }, { axis: "freshness", value: 4, confidence: 0.6 }],
  "bright": [{ axis: "acidity", value: 4, confidence: 0.7 }, { axis: "freshness", value: 4, confidence: 0.5 }],
  "sharp": [{ axis: "acidity", value: 4.5, confidence: 0.7 }],
  "tart": [{ axis: "acidity", value: 4.5, confidence: 0.8 }],
  "zesty": [{ axis: "acidity", value: 4, confidence: 0.7 }, { axis: "freshness", value: 4.5, confidence: 0.6 }],
  "flat": [{ axis: "acidity", value: 1.5, confidence: 0.7 }],
  "flabby": [{ axis: "acidity", value: 1, confidence: 0.8 }],
  "refreshing": [{ axis: "acidity", value: 3.5, confidence: 0.5 }, { axis: "freshness", value: 4, confidence: 0.7 }],
  "lively": [{ axis: "acidity", value: 3.5, confidence: 0.5 }],
  "racy": [{ axis: "acidity", value: 4.5, confidence: 0.7 }],
  "high acid": [{ axis: "acidity", value: 5, confidence: 0.9 }],
  "low acid": [{ axis: "acidity", value: 1.5, confidence: 0.9 }],

  // Tannin indicators
  "tannic": [{ axis: "tannin", value: 4.5, confidence: 0.9 }],
  "soft tannins": [{ axis: "tannin", value: 2, confidence: 0.85 }],
  "firm tannins": [{ axis: "tannin", value: 4, confidence: 0.85 }],
  "grippy": [{ axis: "tannin", value: 4.5, confidence: 0.8 }, { axis: "bitterness_phenolic_grip", value: 4, confidence: 0.6 }],
  "silky": [{ axis: "tannin", value: 2, confidence: 0.7 }],
  "velvety": [{ axis: "tannin", value: 2.5, confidence: 0.7 }],
  "chewy": [{ axis: "tannin", value: 4, confidence: 0.7 }],
  "dusty tannins": [{ axis: "tannin", value: 3.5, confidence: 0.7 }],
  "smooth": [{ axis: "tannin", value: 2, confidence: 0.5 }],
  "astringent": [{ axis: "tannin", value: 5, confidence: 0.85 }, { axis: "bitterness_phenolic_grip", value: 4.5, confidence: 0.7 }],
  "round": [{ axis: "tannin", value: 2.5, confidence: 0.4 }],
  "structured": [{ axis: "tannin", value: 3.5, confidence: 0.6 }],

  // Sweetness indicators
  "dry": [{ axis: "sweetness_perception", value: 1, confidence: 0.8 }],
  "off dry": [{ axis: "sweetness_perception", value: 2.5, confidence: 0.85 }],
  "semi sweet": [{ axis: "sweetness_perception", value: 3.5, confidence: 0.85 }],
  "sweet": [{ axis: "sweetness_perception", value: 4.5, confidence: 0.8 }],
  "residual sugar": [{ axis: "sweetness_perception", value: 3, confidence: 0.7 }],
  "brut": [{ axis: "sweetness_perception", value: 1, confidence: 0.8 }],
  "luscious": [{ axis: "sweetness_perception", value: 4, confidence: 0.6 }],
  "honeyed": [{ axis: "sweetness_perception", value: 4, confidence: 0.7 }],

  // Oak indicators
  "oaky": [{ axis: "oak_presence", value: 4.5, confidence: 0.9 }],
  "lots of oak": [{ axis: "oak_presence", value: 5, confidence: 0.9 }],
  "no oak": [{ axis: "oak_presence", value: 1, confidence: 0.9 }],
  "unoaked": [{ axis: "oak_presence", value: 1, confidence: 0.9 }],
  "vanilla": [{ axis: "oak_presence", value: 3.5, confidence: 0.6 }],
  "toasty": [{ axis: "oak_presence", value: 4, confidence: 0.7 }],
  "cedar": [{ axis: "oak_presence", value: 3.5, confidence: 0.6 }],
  "smoky": [{ axis: "oak_presence", value: 3.5, confidence: 0.5 }],
  "charred": [{ axis: "oak_presence", value: 4, confidence: 0.6 }],
  "buttery": [{ axis: "oak_presence", value: 3, confidence: 0.5 }],

  // Fruit ripeness indicators
  "jammy": [{ axis: "fruit_ripeness", value: 5, confidence: 0.8 }],
  "overripe": [{ axis: "fruit_ripeness", value: 5, confidence: 0.85 }],
  "ripe": [{ axis: "fruit_ripeness", value: 4, confidence: 0.7 }],
  "green": [{ axis: "fruit_ripeness", value: 1.5, confidence: 0.6 }],
  "unripe": [{ axis: "fruit_ripeness", value: 1, confidence: 0.85 }],
  "ripe fruit": [{ axis: "fruit_ripeness", value: 4.5, confidence: 0.8 }],
  "dark fruit": [{ axis: "fruit_ripeness", value: 4, confidence: 0.6 }],
  "red fruit": [{ axis: "fruit_ripeness", value: 3, confidence: 0.4 }],
  "tropical": [{ axis: "fruit_ripeness", value: 4, confidence: 0.5 }],
  "citrus": [{ axis: "fruit_ripeness", value: 2.5, confidence: 0.4 }],

  // Alcohol indicators
  "hot": [{ axis: "alcohol_perception", value: 5, confidence: 0.7 }],
  "boozy": [{ axis: "alcohol_perception", value: 5, confidence: 0.8 }],
  "warming": [{ axis: "alcohol_perception", value: 4, confidence: 0.6 }],
  "low alcohol": [{ axis: "alcohol_perception", value: 1.5, confidence: 0.8 }],
  "high alcohol": [{ axis: "alcohol_perception", value: 5, confidence: 0.8 }],

  // Earthiness / mineral
  "earthy": [{ axis: "earthy", value: 4, confidence: 0.8 }],
  "forest floor": [{ axis: "earthy", value: 4.5, confidence: 0.8 }],
  "mushroom": [{ axis: "earthy", value: 4, confidence: 0.7 }],
  "truffle": [{ axis: "earthy", value: 4.5, confidence: 0.7 }],
  "mineral": [{ axis: "mineral", value: 4, confidence: 0.8 }],
  "minerally": [{ axis: "mineral", value: 4, confidence: 0.8 }],
  "flinty": [{ axis: "mineral", value: 4.5, confidence: 0.7 }],
  "stony": [{ axis: "mineral", value: 4, confidence: 0.7 }],
  "chalky": [{ axis: "mineral", value: 3.5, confidence: 0.6 }],
  "wet stone": [{ axis: "mineral", value: 4, confidence: 0.7 }],
  "petrol": [{ axis: "mineral", value: 4, confidence: 0.6 }],
  "slate": [{ axis: "mineral", value: 4, confidence: 0.7 }],

  // Savory indicators
  "savory": [{ axis: "savory", value: 4, confidence: 0.8 }],
  "umami": [{ axis: "savory", value: 4.5, confidence: 0.8 }],
  "meaty": [{ axis: "savory", value: 4, confidence: 0.7 }],
  "leather": [{ axis: "savory", value: 3.5, confidence: 0.6 }],
  "tobacco": [{ axis: "savory", value: 3.5, confidence: 0.6 }],
  "herbs": [{ axis: "savory", value: 3, confidence: 0.5 }],
  "herbal": [{ axis: "savory", value: 3, confidence: 0.5 }],

  // Complexity / finish
  "complex": [{ axis: "complexity", value: 4.5, confidence: 0.8 }],
  "simple": [{ axis: "complexity", value: 1.5, confidence: 0.7 }],
  "one dimensional": [{ axis: "complexity", value: 1, confidence: 0.8 }],
  "layered": [{ axis: "complexity", value: 4.5, confidence: 0.7 }],
  "nuanced": [{ axis: "complexity", value: 4.5, confidence: 0.7 }],
  "long finish": [{ axis: "finish_length", value: 5, confidence: 0.85 }],
  "short finish": [{ axis: "finish_length", value: 1.5, confidence: 0.85 }],
  "lingering": [{ axis: "finish_length", value: 4.5, confidence: 0.7 }],
  "persistent": [{ axis: "finish_length", value: 4.5, confidence: 0.7 }],
  "fades quickly": [{ axis: "finish_length", value: 1.5, confidence: 0.7 }],

  // Aromatic intensity
  "aromatic": [{ axis: "aromatic_intensity", value: 4, confidence: 0.7 }],
  "fragrant": [{ axis: "aromatic_intensity", value: 4.5, confidence: 0.7 }],
  "perfumed": [{ axis: "aromatic_intensity", value: 4.5, confidence: 0.7 }],
  "muted": [{ axis: "aromatic_intensity", value: 1.5, confidence: 0.7 }],
  "closed": [{ axis: "aromatic_intensity", value: 1.5, confidence: 0.6 }],
  "expressive": [{ axis: "aromatic_intensity", value: 4, confidence: 0.6 }],
  "nose": [{ axis: "aromatic_intensity", value: 3, confidence: 0.3 }],
  "intense": [{ axis: "aromatic_intensity", value: 4.5, confidence: 0.6 }, { axis: "concentration", value: 4, confidence: 0.4 }],
  "concentrated": [{ axis: "concentration", value: 4.5, confidence: 0.8 }],
  "dilute": [{ axis: "concentration", value: 1.5, confidence: 0.8 }],
  "watery": [{ axis: "concentration", value: 1, confidence: 0.8 }],
};

// Descriptor clusters for aroma categorization
export const AROMA_CLUSTERS: Record<string, string[]> = {
  "dark_fruit": ["blackberry", "black cherry", "plum", "cassis", "blackcurrant", "dark fruit", "dark berry", "blueberry"],
  "red_fruit": ["cherry", "raspberry", "strawberry", "cranberry", "red fruit", "red berry", "red currant"],
  "tropical_fruit": ["tropical", "pineapple", "mango", "passion fruit", "lychee", "guava"],
  "citrus": ["citrus", "lemon", "lime", "grapefruit", "orange", "tangerine", "zest"],
  "stone_fruit": ["peach", "apricot", "nectarine", "stone fruit"],
  "floral": ["floral", "rose", "violet", "lavender", "jasmine", "blossom"],
  "spice": ["spice", "pepper", "cinnamon", "clove", "anise", "licorice", "nutmeg"],
  "earth": ["earth", "earthy", "forest floor", "mushroom", "truffle", "soil", "dirt"],
  "oak_vanilla": ["oak", "vanilla", "toast", "cedar", "coconut", "caramel", "butterscotch", "smoke"],
  "herbal": ["herb", "herbal", "thyme", "rosemary", "sage", "mint", "eucalyptus", "tea"],
  "mineral": ["mineral", "chalk", "flint", "slate", "stone", "wet stone", "gravel", "petrol"],
  "savory": ["leather", "tobacco", "meat", "umami", "olive", "soy"],
};

// Sentiment words
export const POSITIVE_SENTIMENT = [
  "excellent", "amazing", "wonderful", "beautiful", "outstanding",
  "incredible", "fantastic", "perfect", "love", "loved", "stunning",
  "delicious", "gorgeous", "brilliant", "exceptional", "impressive",
  "superb", "magnificent", "sublime", "great", "really good", "very good",
  "enjoy", "enjoyed", "favorite", "favourite", "wow",
];

export const NEGATIVE_SENTIMENT = [
  "awful", "terrible", "horrible", "disgusting", "undrinkable",
  "disappointing", "disappointed", "mediocre", "bland", "boring",
  "off", "corked", "oxidized", "vinegar", "bad", "worst", "dislike",
  "unpleasant", "harsh", "rough", "not good", "didn't like",
  "wouldn't buy", "waste", "regret",
];
```

**IMPORTANT:** This lexicon should be comprehensive but not perfect. Expand it based on the actual notes in the database. You can query the `notes` field from `wine_entries` to see what descriptors users actually write.

### 2. `src/server/algorithm/notesNlp.ts` — Extraction Engine

```typescript
import type { SensoryAxis } from "@/server/algorithm/types";
import {
  DESCRIPTOR_LEXICON,
  AROMA_CLUSTERS,
  POSITIVE_SENTIMENT,
  NEGATIVE_SENTIMENT,
  type DescriptorMapping,
} from "@/server/algorithm/noteDescriptors";

export type NlpNotesExtraction = {
  sensoryHints: Partial<Record<SensoryAxis, { value: number; confidence: number }>>;
  descriptorClusters: {
    primary: string[];
    secondary: string[];
  };
  sentiment: number;
  tokenCount: number;
};

/**
 * Extract sensory hints, descriptors, and sentiment from free-text tasting notes.
 * Pure rule-based approach — no ML dependencies.
 */
export function extractFromNotes(notes: string | null | undefined): NlpNotesExtraction | null {
  if (!notes || notes.trim().length < 3) {
    return null;
  }

  const normalized = notes
    .toLowerCase()
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/\n/g, " ")
    .trim();

  // 1. Extract sensory hints via lexicon matching
  const axisAccumulator = new Map<SensoryAxis, { totalValue: number; totalConfidence: number; count: number }>();
  let tokenCount = 0;

  // Sort lexicon entries by length (longest first) to match multi-word phrases first
  const sortedPhrases = Object.keys(DESCRIPTOR_LEXICON).sort((a, b) => b.length - a.length);
  const matched = new Set<string>();

  for (const phrase of sortedPhrases) {
    if (normalized.includes(phrase) && !matched.has(phrase)) {
      matched.add(phrase);
      tokenCount += 1;
      const mappings = DESCRIPTOR_LEXICON[phrase];
      for (const mapping of mappings) {
        const current = axisAccumulator.get(mapping.axis) ?? { totalValue: 0, totalConfidence: 0, count: 0 };
        current.totalValue += mapping.value * mapping.confidence;
        current.totalConfidence += mapping.confidence;
        current.count += 1;
        axisAccumulator.set(mapping.axis, current);
      }
    }
  }

  const sensoryHints: NlpNotesExtraction["sensoryHints"] = {};
  axisAccumulator.forEach((acc, axis) => {
    if (acc.totalConfidence > 0) {
      sensoryHints[axis] = {
        value: Number((acc.totalValue / acc.totalConfidence).toFixed(2)),
        confidence: Number(Math.min(1, acc.totalConfidence / acc.count).toFixed(2)),
      };
    }
  });

  // 2. Detect aroma descriptor clusters
  const clusterScores = new Map<string, number>();
  for (const [cluster, keywords] of Object.entries(AROMA_CLUSTERS)) {
    let score = 0;
    for (const keyword of keywords) {
      if (normalized.includes(keyword)) {
        score += 1;
      }
    }
    if (score > 0) {
      clusterScores.set(cluster, score);
    }
  }

  const sortedClusters = [...clusterScores.entries()].sort((a, b) => b[1] - a[1]);
  const primaryClusters = sortedClusters.slice(0, 3).map(([cluster]) => cluster);
  const secondaryClusters = sortedClusters.slice(3, 6).map(([cluster]) => cluster);

  // 3. Sentiment analysis
  let positiveCount = 0;
  let negativeCount = 0;
  for (const word of POSITIVE_SENTIMENT) {
    if (normalized.includes(word)) positiveCount += 1;
  }
  for (const word of NEGATIVE_SENTIMENT) {
    if (normalized.includes(word)) negativeCount += 1;
  }
  const totalSentimentWords = positiveCount + negativeCount;
  const sentiment = totalSentimentWords > 0
    ? Number(((positiveCount - negativeCount) / totalSentimentWords).toFixed(2))
    : 0;

  if (tokenCount === 0 && primaryClusters.length === 0 && totalSentimentWords === 0) {
    return null; // No meaningful extraction
  }

  return {
    sensoryHints,
    descriptorClusters: {
      primary: primaryClusters,
      secondary: secondaryClusters,
    },
    sentiment,
    tokenCount,
  };
}
```

### 3. `src/server/algorithm/notesNlp.test.ts` — Unit Tests

Write comprehensive tests:

```typescript
import { extractFromNotes } from "./notesNlp";

describe("extractFromNotes", () => {
  it("returns null for empty/short notes", () => {
    expect(extractFromNotes(null)).toBeNull();
    expect(extractFromNotes("")).toBeNull();
    expect(extractFromNotes("ok")).toBeNull();
  });

  it("extracts body hints", () => {
    const result = extractFromNotes("Full bodied with rich dark fruit");
    expect(result?.sensoryHints.body?.value).toBeGreaterThan(3.5);
    expect(result?.sensoryHints.body?.confidence).toBeGreaterThan(0.5);
  });

  it("extracts acidity hints", () => {
    const result = extractFromNotes("Very crisp and bright with high acid");
    expect(result?.sensoryHints.acidity?.value).toBeGreaterThan(3.5);
  });

  it("extracts tannin hints", () => {
    const result = extractFromNotes("Silky smooth tannins, very elegant");
    expect(result?.sensoryHints.tannin?.value).toBeLessThan(3);
  });

  it("detects aroma clusters", () => {
    const result = extractFromNotes("Dark cherry, blackberry, with hints of vanilla and cedar");
    expect(result?.descriptorClusters.primary).toContain("dark_fruit");
    expect(result?.descriptorClusters.primary).toContain("oak_vanilla");
  });

  it("detects positive sentiment", () => {
    const result = extractFromNotes("Amazing wine, absolutely loved it. Fantastic complexity.");
    expect(result?.sentiment).toBeGreaterThan(0.5);
  });

  it("detects negative sentiment", () => {
    const result = extractFromNotes("Disappointing and bland. Wouldn't buy again.");
    expect(result?.sentiment).toBeLessThan(-0.3);
  });

  it("handles multi-word phrases correctly", () => {
    const result = extractFromNotes("soft tannins and long finish with forest floor notes");
    expect(result?.sensoryHints.tannin?.value).toBeLessThan(3);
    expect(result?.sensoryHints.finish_length?.value).toBeGreaterThan(4);
    expect(result?.sensoryHints.earthy?.value).toBeGreaterThan(3.5);
  });
});
```

## Integration Plan (for the orchestrator, not for you)

After all three branches merge, the orchestrator will:
1. Import `extractFromNotes` in `userPreferences.ts`
2. Call it for each entry's `notes` field
3. Merge `sensoryHints` into the preference accumulator alongside base profiles and advanced_notes
4. Use `NlpNotesExtraction.sentiment` as an additional signal in the enjoyment composite

**You don't need to wire this up.** Just make the module clean, well-tested, and ready to import.

## Notes Column Access

The `notes` field is on `wine_entries` but is NOT currently included in the preference entry query in `handler.ts`. The integration step will add it. For now, your module just takes a `string | null | undefined` and returns structured data.

To see what real notes look like, you can query:
```sql
SELECT notes FROM wine_entries WHERE notes IS NOT NULL AND notes != '' LIMIT 20;
```

## Definition of Done
- [ ] `src/server/algorithm/noteDescriptors.ts` — comprehensive descriptor lexicon
- [ ] `src/server/algorithm/notesNlp.ts` — extraction function with clean types
- [ ] `src/server/algorithm/notesNlp.test.ts` — unit tests covering all extraction paths
- [ ] `NlpNotesExtraction` type exported for use by other modules
- [ ] No modifications to existing files (except type addition to types.ts if needed)
- [ ] Lexicon covers at least the 16 sensory axes with multiple descriptor keywords each
- [ ] Aroma cluster detection working
- [ ] Sentiment analysis working
- [ ] Clean TypeScript compilation (`npx tsc --noEmit`)
- [ ] All tests pass
