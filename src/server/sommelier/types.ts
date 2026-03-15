import type { WineType } from "@/types/wine";

export type SommelierRole = "user" | "assistant";

export type SommelierMessage = {
  role: SommelierRole;
  content: string;
};

export type SommelierSourceKind =
  | "wine_knowledge"
  | "general_knowledge"
  | "user_history"
  | "preference_summary";

export type SommelierSource = {
  id: string;
  kind: SommelierSourceKind;
  label: string;
  excerpt: string;
  similarity?: number | null;
  metadata?: Record<string, unknown>;
};

export type KnowledgeMatch = {
  id: string;
  content: string;
  similarity: number | null;
  metadata: Record<string, unknown>;
};

export type UserHistoryEntry = {
  id: string;
  wineName: string | null;
  producer: string | null;
  vintage: string | null;
  wineType: WineType | null;
  region: string | null;
  appellation: string | null;
  country: string | null;
  classification: string | null;
  rating: number | null;
  consumedAt: string | null;
  notes: string | null;
  aiNotesSummary: string | null;
};

export type PreferenceSnippet = {
  wineType: WineType;
  eventCount: number;
  summary: string;
};

export type UserContext = {
  relevantEntries: UserHistoryEntry[];
  recentFavorites: UserHistoryEntry[];
  preferenceSnippets: PreferenceSnippet[];
};

export type AssembledSommelierContext = {
  query: string;
  wineKnowledge: KnowledgeMatch[];
  generalKnowledge: KnowledgeMatch[];
  entryMatches: KnowledgeMatch[];
  userContext: UserContext;
  contextText: string;
  sources: SommelierSource[];
};

export type StructuredIngestionSummary = {
  sourceTable: string;
  insertedCount: number;
};

export type DocumentIngestionSummary = {
  documentId: string;
  title: string;
  chunkCount: number;
  contentType: string;
};

export type ChunkRecord = {
  chunkIndex: number;
  content: string;
  approxTokens: number;
  heading?: string | null;
};
