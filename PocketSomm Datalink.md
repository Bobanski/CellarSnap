# Pocket Sommelier — Datalink Fix Plan

> **Date:** 2026-03-15
> **Status:** Proposed
> **Priority:** High — core UX issue; users perceive the sommelier as broken

---

## Problem

Users report that Pocket Somm "only knows 5 wines" and says things like *"I only know the wines you've shared with me this session."* This makes the feature feel broken, even though the underlying data pipeline is functioning correctly.

**Root cause:** The retrieval layer hard-caps relevant wine entries at 5, the total context at ~3,200 tokens, and the system prompt doesn't explain the data model to the LLM — so GPT infers (incorrectly) that it only has session-scoped data.

---

## Current Architecture

```
User message
  → handler.ts (auth, rate limit, conversation mgmt)
    → chat.ts → assembleContext()
      → retrieval.ts (3 parallel fetches):
          1. retrieveWineKnowledge()   — vector search, limit 5
          2. retrieveGeneralKnowledge() — vector search, limit 5
          3. retrieveUserContext()      — Supabase query:
               • Fetches 50 most recent wines
               • Scores by keyword relevance to query
               • Slices to top 5         ← BOTTLENECK
               • Picks top 3 recent favorites (rating ≥ 90)
               • Builds preference summary from all 50
    → formatContextText() → truncate to 3,200 tokens
      → OpenAI Responses API (gpt-5-mini, streaming)
```

### Key Limits

| Constraint | Value | File | Line |
|-----------|-------|------|------|
| DB fetch limit | 50 wines | retrieval.ts | 220 |
| Relevant entries shown to LLM | **5** | retrieval.ts | 259 |
| Recent favorites | 3 | retrieval.ts | 265 |
| Wine knowledge docs | 5 | retrieval.ts | 105 |
| General knowledge docs | 5 | retrieval.ts | 125 |
| Total context token cap | 3,200 | chat.ts | 28 |

---

## Proposed Fix — Tiered Context Strategy

### Phase 1: Quick wins (< 30 min)

#### 1A. Fix the system prompt to set proper expectations
**File:** src/server/sommelier/chat.ts lines 11-21

Add explicit instructions telling the LLM it has persistent cellar access and should never say "I only know the wines you've shared with me this session."

#### 1B. Increase relevant entry limit from 5 → 10
**File:** src/server/sommelier/retrieval.ts line 259

#### 1C. Increase context token cap from 3,200 → 5,000
**File:** src/server/sommelier/chat.ts line 28

---

### Phase 2: Smarter retrieval (3-5 hours)

#### 2A. Pre-compute a cellar summary table
New `sommelier_cellar_summaries` table with total wines, top regions, varietals, rating distribution, and recent highlights. Updated via trigger on wine_entries changes.

#### 2B. Hybrid retrieval: summary + query-relevant wines
Combine cellar overview (~200 tokens) with top 8 query-relevant wines.

#### 2C. Semantic search over user wines
Replace keyword scoring with vector similarity using pgvector embeddings per wine entry.

---

### Phase 3: Full cellar awareness (future)

#### 3A. Tool use / function calling
Give the LLM tools to search_cellar, get_cellar_stats, get_wine_details on demand.

#### 3B. Conversation memory
Track which wines were discussed across turns to prevent forgetting.

---

## Recommended Implementation Order

| Step | What | Effort | Impact |
|------|------|--------|--------|
| **1A** | Fix system prompt | 15 min | High |
| **1B** | Increase wine limit 5→10 | 5 min | Medium |
| **1C** | Increase token cap 3200→5000 | 5 min | Medium |
| **2A** | Cellar summary table | 2 hr | High |
| **2B** | Hybrid retrieval | 1 hr | High |
| **2C** | Semantic wine search | 2 hr | Medium |
| **3A** | Tool use | 4 hr | Very High |
| **3B** | Conversation memory | 2 hr | Medium |

**Phase 1 should ship immediately.** Phase 2 is a sprint item. Phase 3 is a feature upgrade.

## Files to Modify

### Phase 1
- src/server/sommelier/chat.ts — System prompt + MAX_CONTEXT_TOKENS
- src/server/sommelier/retrieval.ts — .slice(0, 5) → .slice(0, 10)

### Phase 2
- supabase/sql/0XX_sommelier_cellar_summaries.sql — New table + trigger
- src/server/sommelier/retrieval.ts — New getCellarSummary() + hybrid retrieval
- src/server/sommelier/ingestion.ts — Update summary on wine entry changes

### Phase 3
- src/server/sommelier/chat.ts — Tool definitions + execution loop
- src/server/sommelier/tools.ts — New file with tool implementations
- src/features/sommelier/SommelierChat.tsx — Handle tool-use streaming events
