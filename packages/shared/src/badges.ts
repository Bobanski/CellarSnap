// ── Badge Types ──────────────────────────────────────────────────────────────

export type BadgeCategory = "taste" | "region" | "milestone" | "social";

export type BadgeTier =
  | "nouveau"
  | "vieilles_vignes"
  | "reserve"
  | "mise_en_cave";

export type BadgeShape =
  | "cluster"
  | "drop"
  | "volcano"
  | "star"
  | "compass"
  | "book"
  | "leaf"
  | "flame"
  | "crown"
  | "lightning"
  | "hourglass";

export type BadgeColor =
  | "grenache"
  | "barolo"
  | "nebbiolo"
  | "rose"
  | "fog"
  | "green";

export type BadgeAccentColor = "champagne" | "viognier" | "rose";

// ── Trigger Specs ────────────────────────────────────────────────────────────

export type BadgeTriggerSpec =
  | { type: "entry_count"; count: number }
  | { type: "region_match"; region: string; count: number }
  | { type: "country_match"; country: string; count: number }
  | {
      type: "grape_match";
      grape: string;
      count: number;
      minRegions?: number;
      ratingFilter?: "love_or_like" | "love";
    }
  | {
      type: "wine_type_match";
      wineType: string;
      count: number;
      ratingFilter?: "love_or_like" | "love";
      minProducers?: number;
    }
  | { type: "rating_ratio"; ratio: number; filter: string }
  | { type: "cross_region_count"; count: number; minTerroirs?: number }
  | { type: "founding_member" }
  | { type: "social_compatibility"; minScore: number }
  | { type: "social_tag_count"; count: number }
  | { type: "sommelier_group_count"; count: number }
  | { type: "compound"; all: BadgeTriggerSpec[] };

// ── Badge Definition ─────────────────────────────────────────────────────────

export type BadgeDefinition = {
  id: string;
  name: string;
  category: BadgeCategory;
  tier: BadgeTier;
  color: BadgeColor;
  accent: BadgeAccentColor;
  shape: BadgeShape;
  trigger: BadgeTriggerSpec;
  toastText: string;
  description: string;
};

// ── Color Constants ──────────────────────────────────────────────────────────

export const BADGE_COLOR_HEX: Record<BadgeColor, string> = {
  barolo: "#4A0E1F",
  grenache: "#7B1D3A",
  rose: "#C4607A",
  nebbiolo: "#4A3060",
  green: "#3D6B4F",
  fog: "#8A8078",
} as const;

export const BADGE_ACCENT_HEX: Record<BadgeAccentColor, string> = {
  champagne: "#F5EDD6",
  viognier: "#C9A84C",
  rose: "#C4607A",
} as const;

export const BADGE_TIER_COLORS: Record<BadgeTier, string> = {
  nouveau: "#C4607A",
  vieilles_vignes: "#7B1D3A",
  reserve: "#C9A84C",
  mise_en_cave: "#2C1A0E",
} as const;

export const BADGE_TIER_ORDER: readonly BadgeTier[] = [
  "nouveau",
  "vieilles_vignes",
  "reserve",
  "mise_en_cave",
] as const;

// ── All Badge Definitions ────────────────────────────────────────────────────

export const BADGE_DEFINITIONS: readonly BadgeDefinition[] = [
  // ── Taste Identity — Natural & Intervention ──────────────────────────
  {
    id: "natural-curious",
    name: "Natural Curious",
    category: "taste",
    tier: "nouveau",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: {
      type: "wine_type_match",
      wineType: "natural",
      count: 3,
      ratingFilter: "love_or_like",
    },
    toastText:
      "You keep reaching for low-intervention wines. Coincidence? We think not.",
    description: "The beginning of a very particular obsession.",
  },
  {
    id: "natural-convert",
    name: "Natural Wine Convert",
    category: "taste",
    tier: "vieilles_vignes",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: {
      type: "compound",
      all: [
        { type: "wine_type_match", wineType: "natural", count: 10 },
        { type: "rating_ratio", ratio: 0.7, filter: "natural_love_or_like" },
      ],
    },
    toastText: "Your palate has made a decision. Welcome to the other side.",
    description:
      "Your palate has made a decision. Low-intervention only from here.",
  },
  {
    id: "biodynamic-devotee",
    name: "Biodynamic Devotee",
    category: "taste",
    tier: "reserve",
    color: "green",
    accent: "viognier",
    shape: "leaf",
    trigger: {
      type: "rating_ratio",
      ratio: 0.73,
      filter: "top_rated_biodynamic_or_organic",
    },
    toastText:
      "73% of your top-rated wines are biodynamic. Your palate has opinions.",
    description: "Farmed with the moon in mind. You can taste the difference.",
  },
  {
    id: "skin-contact",
    name: "Skin Contact Stan",
    category: "taste",
    tier: "vieilles_vignes",
    color: "grenache",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "compound",
      all: [
        { type: "wine_type_match", wineType: "orange", count: 10 },
        { type: "rating_ratio", ratio: 0.7, filter: "orange_positive" },
      ],
    },
    toastText: "Amber alert. You have a type.",
    description: "Tannic whites and hazy sunsets. You found your corner.",
  },
  {
    id: "pet-nat-vet",
    name: "P\u00E9t-Nat Vet",
    category: "taste",
    tier: "vieilles_vignes",
    color: "rose",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "wine_type_match",
      wineType: "petillant_naturel",
      count: 15,
      minProducers: 3,
    },
    toastText:
      "Cloudy, refermented, still going. You've been here a while.",
    description: "Not a phase. P\u00E9t-nat is a lifestyle and you committed.",
  },
  {
    id: "amphora-curious",
    name: "Amphora Curious",
    category: "taste",
    tier: "nouveau",
    color: "fog",
    accent: "champagne",
    shape: "hourglass",
    trigger: { type: "wine_type_match", wineType: "amphora_qvevri", count: 5 },
    toastText:
      "Clay vessels and ancient methods. You went looking for them.",
    description: "Georgian qvevri. Spanish tinaja. You went looking for clay.",
  },
  {
    id: "concrete-thinker",
    name: "Concrete Thinker",
    category: "taste",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "champagne",
    shape: "hourglass",
    trigger: {
      type: "wine_type_match",
      wineType: "concrete",
      count: 10,
      ratingFilter: "love",
    },
    toastText: "No oak. No steel. Concrete. An unexpected favourite.",
    description: "The egg. The tank. The texture only concrete gives.",
  },

  // ── Taste Identity — Structure ───────────────────────────────────────
  {
    id: "acid-head",
    name: "Acid Head",
    category: "taste",
    tier: "vieilles_vignes",
    color: "rose",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "compound",
      all: [
        {
          type: "wine_type_match",
          wineType: "high_acid",
          count: 20,
          ratingFilter: "love",
        },
        { type: "cross_region_count", count: 20, minTerroirs: 3 },
      ],
    },
    toastText: "You keep chasing the pucker. High-acid drinker confirmed.",
    description: "Searingly dry. Bracingly tart. Exactly right.",
  },
  {
    id: "tannin-devotee",
    name: "Tannin Devotee",
    category: "taste",
    tier: "nouveau",
    color: "barolo",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "wine_type_match",
      wineType: "high_tannin",
      count: 15,
      ratingFilter: "love",
    },
    toastText: "You like your reds to grip back. Noted.",
    description:
      "Grip. Structure. The wine equivalent of a firm handshake.",
  },
  {
    id: "grip-obsessed",
    name: "Grip Obsessed",
    category: "taste",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "viognier",
    shape: "drop",
    trigger: {
      type: "wine_type_match",
      wineType: "high_tannin",
      count: 30,
      ratingFilter: "love",
    },
    toastText: "The drier the better. The grippier the better.",
    description:
      "Barolo. Brunello. Tannat. You are not afraid of structure.",
  },
  {
    id: "oak-free",
    name: "Oak Free",
    category: "taste",
    tier: "nouveau",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: {
      type: "wine_type_match",
      wineType: "unoaked",
      count: 20,
      ratingFilter: "love",
    },
    toastText: "You noticed the absence of oak. That's something.",
    description:
      "No vanilla. No toast. Just the fruit, the acid, the truth.",
  },
  {
    id: "oak-obsessed",
    name: "Oak Obsessed",
    category: "taste",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "viognier",
    shape: "flame",
    trigger: {
      type: "wine_type_match",
      wineType: "heavily_oaked",
      count: 25,
      ratingFilter: "love",
    },
    toastText: "Vanilla, toast, new oak. You have committed to this path.",
    description:
      "Vanilla. Toast. New oak. A fully considered lifestyle choice.",
  },
  {
    id: "full-body",
    name: "Body Builder",
    category: "taste",
    tier: "nouveau",
    color: "barolo",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "rating_ratio",
      ratio: 0.7,
      filter: "love_full_bodied",
    },
    toastText: "You don't do half measures. Noted.",
    description:
      "Weight. Richness. Presence. You want a wine that takes up room.",
  },
  {
    id: "featherweight",
    name: "Featherweight",
    category: "taste",
    tier: "nouveau",
    color: "rose",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "rating_ratio",
      ratio: 0.7,
      filter: "love_light_bodied",
    },
    toastText: "Delicate and deliberate. Light is not the same as weak.",
    description: "Pale. Ethereal. More complex than it looks.",
  },
  {
    id: "bone-dry-diva",
    name: "Bone Dry Diva",
    category: "taste",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "champagne",
    shape: "drop",
    trigger: { type: "rating_ratio", ratio: 0.9, filter: "love_dry" },
    toastText: "Sweetness never stood a chance with you.",
    description:
      "Not a trace of sweetness. Zero apologies. A fully held position.",
  },

  // ── Taste Identity — Terroir & Style ─────────────────────────────────
  {
    id: "volcanic-devotee",
    name: "Volcanic Devotee",
    category: "taste",
    tier: "vieilles_vignes",
    color: "nebbiolo",
    accent: "rose",
    shape: "volcano",
    trigger: {
      type: "wine_type_match",
      wineType: "volcanic_terroir",
      count: 8,
    },
    toastText: "Basalt and brine. You keep going back.",
    description:
      "Etna. Santorini. Canary Islands. You found the lava and stayed.",
  },
  {
    id: "terroir-obsessive",
    name: "Terroir Obsessive",
    category: "taste",
    tier: "reserve",
    color: "barolo",
    accent: "viognier",
    shape: "volcano",
    trigger: { type: "cross_region_count", count: 5, minTerroirs: 5 },
    toastText: "It's not the grape. It's never just the grape.",
    description: "It's never just the grape. You know this.",
  },
  {
    id: "old-world",
    name: "Old World Soul",
    category: "taste",
    tier: "nouveau",
    color: "barolo",
    accent: "champagne",
    shape: "compass",
    trigger: {
      type: "rating_ratio",
      ratio: 0.7,
      filter: "european_appellations",
    },
    toastText: "Europe called. Apparently you live there now.",
    description:
      "France. Italy. Spain. The classics. Always the classics.",
  },
  {
    id: "new-world",
    name: "New World Explorer",
    category: "taste",
    tier: "nouveau",
    color: "nebbiolo",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "rating_ratio", ratio: 0.7, filter: "non_european" },
    toastText: "Napa to Central Otago. You're not staying put.",
    description:
      "California. New Zealand. Argentina. The frontier is home.",
  },
  {
    id: "both-worlds",
    name: "Bridge Builder",
    category: "taste",
    tier: "vieilles_vignes",
    color: "nebbiolo",
    accent: "rose",
    shape: "compass",
    trigger: {
      type: "compound",
      all: [
        { type: "rating_ratio", ratio: 0.3, filter: "top_rated_old_world" },
        { type: "rating_ratio", ratio: 0.3, filter: "top_rated_new_world" },
      ],
    },
    toastText:
      "Old World soul. New World spirit. Impossible to pin down.",
    description: "You refuse to pick a side. Good. Sides are boring.",
  },

  // ── Taste Identity — Grape Obsessions ────────────────────────────────
  {
    id: "pinot-obsessive",
    name: "Pinot Problem",
    category: "taste",
    tier: "vieilles_vignes",
    color: "rose",
    accent: "champagne",
    shape: "cluster",
    trigger: {
      type: "grape_match",
      grape: "pinot_noir",
      count: 20,
      minRegions: 3,
      ratingFilter: "love_or_like",
    },
    toastText: "Burgundy. Oregon. Otago. It's always Pinot.",
    description: "Translucent, haunting, infuriating. You can't stop.",
  },
  {
    id: "nebbiolo-head",
    name: "Nebbiolo Head",
    category: "taste",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "viognier",
    shape: "cluster",
    trigger: { type: "grape_match", grape: "nebbiolo", count: 15 },
    toastText: "Tar and roses. You know exactly what that means.",
    description:
      "Tar and roses. The most demanding grape. Your favourite grape.",
  },
  {
    id: "riesling-devotee",
    name: "Riesling Devotee",
    category: "taste",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "grape_match",
      grape: "riesling",
      count: 15,
      minRegions: 3,
    },
    toastText: "Petrol, slate, and zero apologies.",
    description:
      "Petrol, slate, citrus, and the confidence to order it at dinner.",
  },
  {
    id: "chenin-chaser",
    name: "Chenin Chaser",
    category: "taste",
    tier: "vieilles_vignes",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: { type: "grape_match", grape: "chenin_blanc", count: 12 },
    toastText:
      "Dry to luscious, still to sparkling. You're chasing every version.",
    description:
      "You logged every style Chenin makes. There are a lot of styles.",
  },
  {
    id: "gamay-gang",
    name: "Gamay Gang",
    category: "taste",
    tier: "nouveau",
    color: "rose",
    accent: "champagne",
    shape: "cluster",
    trigger: { type: "grape_match", grape: "gamay", count: 10 },
    toastText: "Not just Beaujolais. Way beyond Beaujolais.",
    description:
      "Crunchy, chillable, misunderstood. You got there early.",
  },
  {
    id: "syrah-head",
    name: "Syrah Head",
    category: "taste",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "rose",
    shape: "flame",
    trigger: { type: "grape_match", grape: "syrah", count: 15 },
    toastText: "Smoke, pepper, and something almost animal. Obviously.",
    description:
      "Northern Rh\u00F4ne restraint or Barossa power. You take both.",
  },
  {
    id: "grenache-obsessed",
    name: "Grenache Obsessed",
    category: "taste",
    tier: "vieilles_vignes",
    color: "grenache",
    accent: "champagne",
    shape: "cluster",
    trigger: { type: "grape_match", grape: "grenache", count: 15 },
    toastText: "The sun-drenched grape. Your sun-drenched grape.",
    description: "Plush, warm, and quietly everywhere. You noticed.",
  },
  {
    id: "gruner-groupie",
    name: "Gr\u00FCner Groupie",
    category: "taste",
    tier: "nouveau",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: {
      type: "grape_match",
      grape: "gruner_veltliner",
      count: 8,
    },
    toastText:
      "White pepper and minerals. Properly underrated and you know it.",
    description:
      "Austria's great white grape. You are an enthusiastic evangelist.",
  },

  // ── Region Mastery — France ──────────────────────────────────────────
  {
    id: "bordeaux-hoe",
    name: "Bordeaux Hoe",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "viognier",
    shape: "crown",
    trigger: { type: "region_match", region: "bordeaux", count: 15 },
    toastText: "The Left Bank called. So did the Right.",
    description: "Left Bank. Right Bank. Both banks. You've taken notes.",
  },
  {
    id: "burgundy-pilgrim",
    name: "Burgundy Pilgrim",
    category: "region",
    tier: "reserve",
    color: "barolo",
    accent: "champagne",
    shape: "crown",
    trigger: { type: "region_match", region: "burgundy", count: 20 },
    toastText: "C\u00F4te d'Or. You made it.",
    description:
      "C\u00F4te d'Or obsessive. You understand why people cry over Pinot.",
  },
  {
    id: "champagne-champion",
    name: "Champagne Champion",
    category: "region",
    tier: "reserve",
    color: "grenache",
    accent: "viognier",
    shape: "star",
    trigger: { type: "region_match", region: "champagne", count: 20 },
    toastText: "Bubbles aren't just for celebrations. You know this.",
    description:
      "Grower Champagne. Vintage. NV. You drink it on Tuesdays.",
  },
  {
    id: "rhone-ranger",
    name: "Rh\u00F4ne Ranger",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "rose",
    shape: "compass",
    trigger: { type: "region_match", region: "rhone", count: 15 },
    toastText: "Syrah and sunshine. Grenache and garrigue. Both.",
    description:
      "Syrah in the north. GSM in the south. The Rh\u00F4ne is your river.",
  },
  {
    id: "loire-lover",
    name: "Loire Lover",
    category: "region",
    tier: "vieilles_vignes",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: { type: "region_match", region: "loire", count: 15 },
    toastText:
      "Mineral whites and honest reds. The quiet genius of France.",
    description:
      "The quiet genius of France. Mineral whites, honest reds.",
  },
  {
    id: "jura-curious",
    name: "Jura Curious",
    category: "region",
    tier: "nouveau",
    color: "fog",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "region_match", region: "jura", count: 5 },
    toastText:
      "Oxidative wines and mountain air. You found the weird corner.",
    description:
      "Oxidative, ancient, weird. You found the weird corner and stayed.",
  },
  {
    id: "alsace-all-in",
    name: "Alsace All In",
    category: "region",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "region_match", region: "alsace", count: 12 },
    toastText:
      "Germanic grapes, French terroir. The combination nobody argues with.",
    description:
      "The border region that makes everyone's favourite Riesling.",
  },
  {
    id: "languedoc-local",
    name: "Languedoc Local",
    category: "region",
    tier: "nouveau",
    color: "grenache",
    accent: "champagne",
    shape: "leaf",
    trigger: { type: "region_match", region: "languedoc", count: 10 },
    toastText: "Southern France and QPR. The best kept secret.",
    description:
      "The south of France, finally getting its due. You were early.",
  },

  // ── Region Mastery — Italy ───────────────────────────────────────────
  {
    id: "etna-regular",
    name: "Etna Regular",
    category: "region",
    tier: "vieilles_vignes",
    color: "nebbiolo",
    accent: "rose",
    shape: "volcano",
    trigger: { type: "region_match", region: "etna", count: 10 },
    toastText: "Sicily's volcano has claimed you. Welcome.",
    description: "Sicily's volcano has claimed you as its own.",
  },
  {
    id: "barolo-brigade",
    name: "Barolo Brigade",
    category: "region",
    tier: "reserve",
    color: "barolo",
    accent: "viognier",
    shape: "crown",
    trigger: { type: "region_match", region: "barolo", count: 20 },
    toastText: "Nebbiolo in the fog. You made it to Langhe.",
    description:
      "The king of Italian wine and you logged twenty of them. Respect.",
  },
  {
    id: "tuscany-tables",
    name: "Tuscany Tables",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "region_match", region: "tuscany", count: 15 },
    toastText: "Sangiovese in every form. You kept going.",
    description:
      "Sangiovese in every expression. You didn't stop at Chianti.",
  },
  {
    id: "campania-curious",
    name: "Campania Curious",
    category: "region",
    tier: "nouveau",
    color: "fog",
    accent: "champagne",
    shape: "volcano",
    trigger: { type: "region_match", region: "campania", count: 8 },
    toastText:
      "Fiano and Aglianico. The south is underrated and you know it.",
    description: "Fiano, Greco, Taurasi. Southern Italy's secret weapon.",
  },
  {
    id: "friuli-fanatic",
    name: "Friuli Fanatic",
    category: "region",
    tier: "vieilles_vignes",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: { type: "region_match", region: "friuli", count: 12 },
    toastText: "The birthplace of orange wine and you went deep.",
    description:
      "Ribolla Gialla. Friulano. Ramato. Friuli does things nobody else does.",
  },
  {
    id: "sicily-standing",
    name: "Sicily Standing",
    category: "region",
    tier: "nouveau",
    color: "grenache",
    accent: "champagne",
    shape: "volcano",
    trigger: { type: "region_match", region: "sicily", count: 10 },
    toastText: "The whole island. Not just the volcano.",
    description: "Beyond the volcano. Sicily has so much more to say.",
  },

  // ── Region Mastery — Spain ───────────────────────────────────────────
  {
    id: "rioja-renegade",
    name: "Rioja Renegade",
    category: "region",
    tier: "vieilles_vignes",
    color: "grenache",
    accent: "viognier",
    shape: "flame",
    trigger: { type: "region_match", region: "rioja", count: 15 },
    toastText: "Tempranillo with oak. You're fine with the oak.",
    description:
      "Tempranillo and oak and time. You understand the formula.",
  },
  {
    id: "margaux-monarch",
    name: "Margaux Monarch",
    category: "region",
    tier: "reserve",
    color: "barolo",
    accent: "viognier",
    shape: "crown",
    trigger: { type: "region_match", region: "margaux", count: 15 },
    toastText: "The Left Bank's finest. You went deep.",
    description:
      "The most elegant address in Bordeaux. You know every ch\u00E2teau.",
  },
  {
    id: "california-king",
    name: "California King",
    category: "region",
    tier: "vieilles_vignes",
    color: "grenache",
    accent: "viognier",
    shape: "crown",
    trigger: { type: "region_match", region: "california", count: 20 },
    toastText: "The Golden State. You mapped it in wine.",
    description:
      "Napa. Sonoma. Santa Barbara. Central Coast. All of California, claimed.",
  },
  {
    id: "sangiovese-savage",
    name: "Sangiovese Savage",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "rose",
    shape: "flame",
    trigger: { type: "grape_match", grape: "sangiovese", count: 20 },
    toastText: "Sangiovese in every form. You went all in.",
    description:
      "Chianti to Brunello to Morellino. Sangiovese is your grape and you mean it.",
  },
  {
    id: "chianti-connoisseur",
    name: "Chianti Connoisseur",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "region_match", region: "chianti", count: 15 },
    toastText: "Not just Chianti. Proper Chianti.",
    description:
      "You know the difference between Classico and the rest. Big deal.",
  },
  {
    id: "mosel-maniac",
    name: "Mosel Maniac",
    category: "region",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "champagne",
    shape: "drop",
    trigger: { type: "region_match", region: "mosel", count: 12 },
    toastText: "Slate and petrol and stone fruit. Obsessed.",
    description:
      "The Mosel does one grape and it does it better than anywhere on earth. You agree.",
  },
  {
    id: "burgundy-bitch",
    name: "Burgundy Bitch",
    category: "region",
    tier: "reserve",
    color: "barolo",
    accent: "viognier",
    shape: "crown",
    trigger: { type: "region_match", region: "burgundy", count: 25 },
    toastText: "C\u00F4te d'Or. You went all the way.",
    description: "You didn't just visit Burgundy. You moved in.",
  },
  {
    id: "priorat-pilgrim",
    name: "Priorat Pilgrim",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "viognier",
    shape: "volcano",
    trigger: { type: "region_match", region: "priorat", count: 10 },
    toastText:
      "Llicorella slate and Garnacha. Dense and unforgettable.",
    description:
      "Slate, altitude, concentration. Priorat asks a lot and gives more.",
  },
  {
    id: "ribera-regular",
    name: "Ribera Regular",
    category: "region",
    tier: "nouveau",
    color: "barolo",
    accent: "champagne",
    shape: "compass",
    trigger: {
      type: "region_match",
      region: "ribera_del_duero",
      count: 10,
    },
    toastText: "Tempranillo at altitude. The other great Spanish red.",
    description: "Tinto Fino at 900 metres. Continental and structured.",
  },
  {
    id: "sherry-advocate",
    name: "Sherry Advocate",
    category: "region",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "viognier",
    shape: "hourglass",
    trigger: { type: "region_match", region: "sherry", count: 10 },
    toastText: "Fino before dinner. Oloroso after. Always.",
    description:
      "The most complex wine in the world. You drink it properly.",
  },
  {
    id: "basque-country",
    name: "Basque Believer",
    category: "region",
    tier: "nouveau",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: {
      type: "region_match",
      region: "basque_country",
      count: 8,
    },
    toastText: "Salty, spritz, and food-obsessed. Txakoli is correct.",
    description: "Txakoli. Low alcohol, high acid, mandatory seafood.",
  },

  // ── Region Mastery — USA ─────────────────────────────────────────────
  {
    id: "napa-faithful",
    name: "Napa Faithful",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "viognier",
    shape: "crown",
    trigger: {
      type: "region_match",
      region: "napa_valley",
      count: 15,
    },
    toastText: "The valley. You know the valley.",
    description:
      "Rutherford dust. Oakville terroir. You mapped it in wine.",
  },
  {
    id: "napa-cabernet",
    name: "Cab Country",
    category: "region",
    tier: "reserve",
    color: "barolo",
    accent: "viognier",
    shape: "crown",
    trigger: {
      type: "compound",
      all: [
        { type: "region_match", region: "napa_valley", count: 25 },
        { type: "grape_match", grape: "cabernet_sauvignon", count: 25 },
      ],
    },
    toastText: "Howell Mountain to Stags Leap. You went deep.",
    description:
      "The sub-AVAs matter. You proved it by logging all of them.",
  },
  {
    id: "sonoma-explorer",
    name: "Sonoma Explorer",
    category: "region",
    tier: "vieilles_vignes",
    color: "green",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "region_match", region: "sonoma", count: 15 },
    toastText: "The cooler, more interesting neighbour. You noticed.",
    description:
      "Russian River. Sonoma Coast. The anti-Napa that does it better.",
  },
  {
    id: "oregon-trail",
    name: "Oregon Trail",
    category: "region",
    tier: "vieilles_vignes",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: { type: "region_match", region: "oregon", count: 15 },
    toastText: "Willamette Valley Pinot. You went there.",
    description:
      "Burgundy's American cousin. Quieter. Arguably more interesting.",
  },
  {
    id: "finger-lakes-fan",
    name: "Finger Lakes Fan",
    category: "region",
    tier: "nouveau",
    color: "fog",
    accent: "champagne",
    shape: "drop",
    trigger: {
      type: "region_match",
      region: "finger_lakes",
      count: 8,
    },
    toastText: "The best Riesling in the US. You found it.",
    description:
      "Ice cold lakes and ice cold Riesling. The US's best-kept secret.",
  },
  {
    id: "washington-state",
    name: "Washington State",
    category: "region",
    tier: "nouveau",
    color: "barolo",
    accent: "champagne",
    shape: "compass",
    trigger: {
      type: "region_match",
      region: "washington",
      count: 10,
    },
    toastText: "Columbia Valley Cab. Underrated. You already knew.",
    description: "High desert. Big reds. Systematically underrated.",
  },
  {
    id: "california-native",
    name: "California Native",
    category: "region",
    tier: "vieilles_vignes",
    color: "grenache",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "region_match", region: "california", count: 25 },
    toastText: "There is life beyond Napa. You proved it.",
    description: "Santa Barbara. Paso Robles. Sierra Foothills. All of it.",
  },

  // ── Region Mastery — Rest of World ───────────────────────────────────
  {
    id: "malbec-believer",
    name: "Malbec Believer",
    category: "region",
    tier: "nouveau",
    color: "nebbiolo",
    accent: "champagne",
    shape: "compass",
    trigger: { type: "country_match", country: "argentina", count: 10 },
    toastText: "Altitude and Malbec. Argentina's gift.",
    description:
      "Mendoza at altitude. The grape found its best home here.",
  },
  {
    id: "chile-committed",
    name: "Chile Committed",
    category: "region",
    tier: "nouveau",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: { type: "country_match", country: "chile", count: 10 },
    toastText:
      "Carm\u00E9n\u00E8re and Maule Cinsault. Chile is underrated.",
    description:
      "The Andes and the Pacific. Carm\u00E9n\u00E8re owns this country.",
  },
  {
    id: "cape-crusader",
    name: "Cape Crusader",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "viognier",
    shape: "compass",
    trigger: {
      type: "country_match",
      country: "south_africa",
      count: 15,
    },
    toastText:
      "Chenin Blanc and Cinsault from the Cape. Excellent choice.",
    description:
      "Swartland Chenin. Stellenbosch Cab. Hemel-en-Aarde Pinot. All three.",
  },
  {
    id: "aussie-rules",
    name: "Aussie Rules",
    category: "region",
    tier: "vieilles_vignes",
    color: "grenache",
    accent: "viognier",
    shape: "compass",
    trigger: {
      type: "country_match",
      country: "australia",
      count: 15,
    },
    toastText: "Old vine Shiraz and Riesling from the Clare. Respect.",
    description:
      "Old vine Grenache. Clare Valley Riesling. Yarra Pinot. The full picture.",
  },
  {
    id: "kiwi-convert",
    name: "Kiwi Convert",
    category: "region",
    tier: "nouveau",
    color: "green",
    accent: "champagne",
    shape: "leaf",
    trigger: {
      type: "country_match",
      country: "new_zealand",
      count: 10,
    },
    toastText:
      "Marlborough Sauvignon and Central Otago Pinot. Both correct.",
    description:
      "The two-island country that does Pinot and Sauvignon better than it should.",
  },
  {
    id: "georgian-believer",
    name: "Georgian Believer",
    category: "region",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "viognier",
    shape: "hourglass",
    trigger: {
      type: "country_match",
      country: "georgia",
      count: 10,
    },
    toastText: "8,000 years of winemaking. You took notes.",
    description:
      "Qvevri. Amber wine. 8,000 years of winemaking. This is the origin.",
  },
  {
    id: "greek-chapter",
    name: "Greek Chapter",
    category: "region",
    tier: "vieilles_vignes",
    color: "nebbiolo",
    accent: "rose",
    shape: "compass",
    trigger: { type: "country_match", country: "greece", count: 12 },
    toastText:
      "Assyrtiko and Xinomavro. Greece beyond the holiday ros\u00E9.",
    description:
      "Santorini Assyrtiko. Naoussa Xinomavro. Greece taken seriously.",
  },
  {
    id: "portuguese-path",
    name: "Portuguese Path",
    category: "region",
    tier: "vieilles_vignes",
    color: "barolo",
    accent: "champagne",
    shape: "compass",
    trigger: {
      type: "country_match",
      country: "portugal",
      count: 15,
    },
    toastText: "Touriga Nacional and Vinho Verde. Portugal delivers.",
    description:
      "Douro reds. Vinho Verde. Alentejo. Portugal is on a run.",
  },
  {
    id: "austrian-obsession",
    name: "Austrian Obsession",
    category: "region",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "champagne",
    shape: "leaf",
    trigger: {
      type: "country_match",
      country: "austria",
      count: 12,
    },
    toastText: "Wachau Riesling and Gr\u00FCner. Austria gets it right.",
    description: "The Wachau. Kamptal. Kremstal. Burgenland. All of it.",
  },

  // ── Logging Milestones ───────────────────────────────────────────────
  {
    id: "first-log",
    name: "First Pour",
    category: "milestone",
    tier: "nouveau",
    color: "grenache",
    accent: "champagne",
    shape: "drop",
    trigger: { type: "entry_count", count: 1 },
    toastText: "It starts with one. Welcome to Cluster.",
    description: "Every collection starts with a first bottle.",
  },
  {
    id: "ten-logs",
    name: "Ten Bottles Deep",
    category: "milestone",
    tier: "nouveau",
    color: "grenache",
    accent: "champagne",
    shape: "cluster",
    trigger: { type: "entry_count", count: 10 },
    toastText: "The palate is forming. Keep going.",
    description: "Ten logs in and already a pattern emerging.",
  },
  {
    id: "fifty-logs",
    name: "The Half Century",
    category: "milestone",
    tier: "vieilles_vignes",
    color: "grenache",
    accent: "viognier",
    shape: "cluster",
    trigger: { type: "entry_count", count: 50 },
    toastText: "50 wines. Your taste profile is real now.",
    description: "50 wines. Your taste map has real shape now.",
  },
  {
    id: "hundred-logs",
    name: "The Century",
    category: "milestone",
    tier: "reserve",
    color: "barolo",
    accent: "viognier",
    shape: "cluster",
    trigger: { type: "entry_count", count: 100 },
    toastText:
      "100 logs. The algorithm knows you better than you know yourself.",
    description: "100 wines. The algorithm knows things about you.",
  },
  {
    id: "five-hundred",
    name: "The Five Hundred",
    category: "milestone",
    tier: "mise_en_cave",
    color: "barolo",
    accent: "viognier",
    shape: "crown",
    trigger: { type: "entry_count", count: 500 },
    toastText: "500 wines. You are the product now.",
    description: "500 wines. Cluster is as much yours as ours.",
  },
  {
    id: "founding",
    name: "Founding Member",
    category: "milestone",
    tier: "mise_en_cave",
    color: "barolo",
    accent: "viognier",
    shape: "star",
    trigger: { type: "founding_member" },
    toastText: "You were here from the beginning. That means something.",
    description:
      "You were here before anyone else. This badge never leaves.",
  },

  // ── Social ───────────────────────────────────────────────────────────
  {
    id: "taste-twin",
    name: "Taste Twin",
    category: "social",
    tier: "vieilles_vignes",
    color: "rose",
    accent: "champagne",
    shape: "cluster",
    trigger: { type: "social_compatibility", minScore: 85 },
    toastText: "Someone out there has your exact palate. Scary.",
    description:
      "Someone out there shares your exact palate. You found each other.",
  },
  {
    id: "social-somm",
    name: "Social Somm",
    category: "social",
    tier: "vieilles_vignes",
    color: "rose",
    accent: "champagne",
    shape: "star",
    trigger: { type: "social_tag_count", count: 5 },
    toastText: "Wine is better with people. You know this.",
    description: "Wine is always better shared. You know who to call.",
  },
  {
    id: "group-oracle",
    name: "Group Oracle",
    category: "social",
    tier: "reserve",
    color: "nebbiolo",
    accent: "viognier",
    shape: "star",
    trigger: { type: "sommelier_group_count", count: 3 },
    toastText: "You've become the one everyone asks. Own it.",
    description:
      "They always ask you to pick. Pocket Somm just makes you faster.",
  },
  {
    id: "challenge-winner",
    name: "Challenge Champion",
    category: "social",
    tier: "reserve",
    color: "grenache",
    accent: "viognier",
    shape: "crown",
    trigger: { type: "entry_count", count: 3 },
    toastText: "Three challenges completed. The leaderboard notices.",
    description:
      "Three challenges. Every one completed. Competitive spirit noted.",
  },
  {
    id: "first-somm",
    name: "First Consultation",
    category: "social",
    tier: "nouveau",
    color: "nebbiolo",
    accent: "champagne",
    shape: "book",
    trigger: { type: "sommelier_group_count", count: 1 },
    toastText: "Your AI sommelier is listening.",
    description: "You asked. The Somm answered. First of many.",
  },
  {
    id: "restaurant-pro",
    name: "Restaurant Pro",
    category: "social",
    tier: "vieilles_vignes",
    color: "nebbiolo",
    accent: "champagne",
    shape: "book",
    trigger: { type: "sommelier_group_count", count: 5 },
    toastText: "You never panic at a wine list anymore.",
    description: "The list no longer intimidates. You have a system.",
  },
  {
    id: "somm-whisperer",
    name: "Somm Whisperer",
    category: "social",
    tier: "reserve",
    color: "nebbiolo",
    accent: "viognier",
    shape: "book",
    trigger: { type: "sommelier_group_count", count: 50 },
    toastText: "You talk to your AI sommelier a lot. We love this.",
    description: "50 conversations with the Somm. It knows you now.",
  },

  // ── QPR + Value ──────────────────────────────────────────────────────
  {
    id: "qpr-hunter",
    name: "QPR Hunter",
    category: "milestone",
    tier: "nouveau",
    color: "fog",
    accent: "champagne",
    shape: "lightning",
    trigger: {
      type: "rating_ratio",
      ratio: 0.0,
      filter: "qpr_spot_on_or_good_value",
    },
    toastText:
      "Great wine doesn't have to be expensive. You've found proof.",
    description:
      "Great wine doesn't have to be expensive. You keep finding proof.",
  },
  {
    id: "bargain-oracle",
    name: "Bargain Oracle",
    category: "milestone",
    tier: "vieilles_vignes",
    color: "fog",
    accent: "viognier",
    shape: "lightning",
    trigger: {
      type: "rating_ratio",
      ratio: 0.0,
      filter: "qpr_good_value_high_score_under_25",
    },
    toastText: "You have a gift. Share it.",
    description: "Under $25 and exceptional. You have a gift. Share it.",
  },
  {
    id: "cellar-master",
    name: "Cellar Master",
    category: "milestone",
    tier: "reserve",
    color: "barolo",
    accent: "viognier",
    shape: "hourglass",
    trigger: { type: "entry_count", count: 20 },
    toastText: "Patience is its own kind of expertise.",
    description:
      "20 bottles ageing. Patience is its own kind of expertise.",
  },
] as const;

// ── Lookup Utilities ─────────────────────────────────────────────────────────

const _badgeMap = new Map<string, BadgeDefinition>();
for (const badge of BADGE_DEFINITIONS) {
  _badgeMap.set(badge.id, badge);
}

export const BADGE_MAP: ReadonlyMap<string, BadgeDefinition> = _badgeMap;

export function getBadgeById(id: string): BadgeDefinition | undefined {
  return _badgeMap.get(id);
}

export function getBadgesByCategory(
  category: BadgeCategory,
): readonly BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter((b) => b.category === category);
}

export function getBadgesByTier(tier: BadgeTier): readonly BadgeDefinition[] {
  return BADGE_DEFINITIONS.filter((b) => b.tier === tier);
}
