export const AUDIENCE_MODES = ["explorer", "enthusiast", "connoisseur"] as const;
export type AudienceMode = (typeof AUDIENCE_MODES)[number];

export const SOMMELIER_EYEBROW = "Pocket Sommelier";
export const SOMMELIER_TITLE = "Your personal wine brain.";
export const SOMMELIER_SUBTITLE =
  "Powered by your palate, your cellar, and wine knowledge.";
export const SOMMELIER_INTRO_MESSAGE =
  "I'm ready. Ask about a bottle, a region, a pairing, or what you should try next.";
export const SOMMELIER_INPUT_PLACEHOLDER =
  "Ask about regions, pairings, or what you should try next...";
export const SOMMELIER_DEFAULT_SUGGESTIONS = [
  "How does italian wine compare to french wine?",
  "Tell me about the 2013 vintage in Napa Valley?",
  "What's a good pairing to go with seafood pasta?",
] as const;

export const SOMMELIER_SUGGESTIONS_BY_MODE: Record<AudienceMode, readonly string[]> = {
  explorer: [
    "What's a good wine under $30?",
    "What goes with seafood pasta?",
    "What should I drink by the glass tonight?",
  ],
  enthusiast: [
    "What's the biggest difference between Old World and New World wines?",
    "What's a wine I probably haven't tried yet?",
    "Tell me about Priorat.",
  ],
  connoisseur: [
    "What's a serious wine under $50 I haven't tried?",
    "What should I be paying attention to this vintage?",
    "What should I be cellaring right now?",
  ],
};

export const SOMMELIER_COLD_GREETINGS: Record<AudienceMode, string> = {
  explorer: "Tell me what you're in the mood for.",
  enthusiast: "Tell me what you've been drinking and I'll tell you where to go next.",
  connoisseur: "What do you need?",
};

export const SOMMELIER_WARM_GREETINGS: Record<AudienceMode, readonly string[]> = {
  explorer: [
    "You've been reaching for {pattern}. Want to go deeper?",
    "I've been reading your logs. I have a few ideas.",
  ],
  enthusiast: [
    "Your palate is pulling toward {pattern}. Want to see where that goes?",
    "I've got a recommendation based on what you've been rating.",
  ],
  connoisseur: [
    "Your top-rated wines keep indexing toward {pattern}. I have a theory.",
    "Based on what you've been drinking, I'd push you somewhere you haven't gone yet.",
  ],
};
