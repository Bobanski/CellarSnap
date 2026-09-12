# Cluster — Marketing & Product Audit

**Prepared for:** the founder, as an execution brief
**Basis:** live app driven on mobile viewport (390×844) with the E2E account, logged-out surfaces, share/OG code, `docs/somm-engine-v2-design.md`, `cluster-brand-guide-v4.jsx`, and a code read of the onboarding, log, list-scan, feed, and share flows on `feat/overhaul`.
**One-line verdict:** The product is beautiful, the palate engine is a genuine moat, and the restaurant list-scan is a killer wedge — but none of it is visible before signup, the "no-score anti-Vivino" promise is contradicted by a 1–100 score on every public surface, and a new user is dropped into an empty feed with no reason to have shown up. Fix the front door and pick one wedge.

> **Testing note:** the local dev harness (Next 16 webpack, broken HMR websocket) prevented client hydration, so dynamic content rendered as skeletons ("Loading badges…", "Loading your library…", the palate/profile spinners). Static shells, copy, empty states, IA, and every flow's logic were verified from screenshots + code. Populated states (feed cards, palate readout, list-scan results) were read from source, not seen live.

---

## 1. Positioning sharpness — is "anti-gatekeeping + an AI somm that knows YOUR palate" landing?

**The strategy is sharp. The product quietly contradicts it in three places.**

The brand DNA is unambiguous and good (`cluster-brand-guide-v4.jsx:1331-1383`): Mission "Make wine fun again," Positioning "The anti-gatekeeping wine app… every palate is equally valid," and the hard rule **"No score = no hierarchy — not aggregating everyone's taste into a number is a values statement. We mean it everywhere."** The competitive battlecard leads with **"Vivino scores wines. Cluster learns yours."** (`:2135`).

Where the product contradicts the pitch:

1. **The score you swore off is on every public surface.** The actual rating is a typed **1–100 number**, and it renders as **"N Pts / Rating N out of 100"** on the public feed card (`feed/page.tsx:1446-1448`) and **"Rating N/100"** on the public share/OG card (`s/[shareId]/page.tsx:242`, `lib/shares.ts:159`). A stranger who lands on a shared Cluster link sees a wine with an 82/100 next to it — visually indistinguishable from Vivino. "We don't reduce wine to a number" is the whole wedge, and the number is the most prominent element on the card. (Note also the internal inconsistency: `CLAUDE.md` claims the scale is 1–5; the shipped product is 1–100 everywhere.)

2. **The palate — the entire differentiator — is invisible until you've done a lot of work.** "Cluster learns yours" is the promise, but the palate readout only becomes meaningful after a distilled profile exists (survey completed OR ~5 rated entries; `somm-engine-v2-design.md:82-85`). The E2E account's `/palate` and `/profile` are a profile card + tabs (Palate / Library / Cellar / Badges / Friends) that, for a light user, are empty. Nothing on the first-run surface says "watch me learn your taste."

3. **The tagline actively signals the opposite brand.** The login screen reads **"Cluster — A private cellar journal with a social pour"** (`login/page.tsx:121`). "Private cellar journal" is CellarTracker's positioning — the serious-collector, gatekept end of the market Cluster is supposed to be the antidote to. It's the first sentence a new user reads and it's off-strategy.

**Bottom line:** the positioning is not landing in the product. It lives in a brand deck; the app ships a scored, collector-framed journal. Closing this gap is mostly copy + surfacing, not a rebuild.

---

## 2. ICP and the wedge — who is user #1–1000, and the one feature that wins them

**Be opinionated: user #1–1000 is the Enthusiast (brand's own "🍷 Enthusiast," `:1431`), and the single feature that wins them is the restaurant WINE-LIST SCAN.**

Why the Enthusiast, not the Explorer: the palate engine needs data to be magic, and only the Enthusiast logs enough to feed it. The brand's own GTM already says "seed Enthusiasts first" (`:1956`). Explorers are the Month-3 audience once the feed has texture — chasing them at launch means chasing the users least able to trigger the aha.

Why list-scan over palate profile or group tastings as the wedge feature:
- **The palate profile** is the moat but not the wedge — it's a payoff that requires prior investment; it can't be the thing that gets someone in the door.
- **Group tastings** ("tasting night mode") are a real social wedge (see §6) but require ≥2 engaged people simultaneously — too heavy for cold acquisition.
- **List-scan is the only feature that delivers value in one action, to one person, at the exact moment of highest intent** (standing in a restaurant, decision imminent). It is also the only surface that already works signed-out (`ListScanIntakeScreen.tsx:453-468`). That's your wedge. Everything else is retention.

**The ICP sentence to build against:** "The person who orders wine at restaurants often enough to feel judged by the list, and wants a friend in their pocket who knows what they like." That's the Enthusiast at the point of the wine list.

---

## 3. The aha moment — what it is, how far away it is today, how to collapse it

**The aha:** *"This app just told me which wine on THIS restaurant list I'll like — and why — in a way that felt like it knew me."* That is list-scan results: each wine tagged with an **"N% match"** and an AI **"why you'd like it"** line for the top picks (`ListScanResultsScreen.tsx:854-920`, `:898`, `:918-920`).

**Distance to aha today (measured):**
- The personalized version of the aha requires a distilled palate profile, which requires the survey (7 steps, skippable) OR ~5 rated entries. Logging one wine is ~7 taps including a mandatory post-save survey (`NewEntryScreenContainer.tsx`, `EntryPostSaveSurveyModal.tsx:101`). So "personalized aha" is realistically **10+ screens of signup + survey, or 5 full log cycles** away.
- The *un*-personalized aha (scan a list, see it parsed and scored generically) is available in one action **but is buried** at `/list-scan` with no entry point before signup — root `/` hard-redirects to `/login` (`app/page.tsx`), and nothing on the login/signup screens mentions scanning.

**How to collapse it (this is the single highest-leverage change in the doc):**
1. Make **`/` a real landing page whose hero is a live list-scan demo**, usable with zero account: "Point at any wine list. We'll tell you what to order." Let a stranger scan and see parsed results + generic match scores before any auth wall. Time-to-first-value goes from ~10 screens to ~1 action.
2. **Seed the palate in the scan itself** for the signed-out/cold case: a 3-tap "big & bold vs light & fresh / red-white-both / budget" mini-picker on the results page turns a generic scan into a *personalized* one in seconds — the survey's first question does 80% of the work (the design doc confirms 3–10 picks already beat crowd consensus, `somm-engine-v2-design.md:31-34`). Aha now lands on the first scan.
3. Only *then* prompt signup ("Save this scan + get sharper picks every time") — signup rides on the back of value delivered, not before it.

---

## 4. Onboarding funnel critique (step by step, screenshot-informed)

The email happy path today (verified in code + screens):

| Step | Screen | Problem |
|---|---|---|
| 0 | `/` → hard redirect to `/login` | **No landing page at all.** Zero positioning, zero product preview, zero social proof. The most valuable pre-signup real estate is a bare auth form. |
| 1 | `/login` (screenshot `01-login`) | Tagline "A private cellar journal with a social pour" is off-strategy (§1). Generic auth card. Nothing about palate, scanning, or "make wine fun." |
| 2 | `/signup` (screenshot `02-signup`) | Copy "Enter your email… we'll send a confirmation code, then you'll set your password." The card is **visually dominated by a block of SMS/STOP/HELP legal disclaimer** that's as large as the value prop. Email-OTP-first means a full inbox round-trip before the user has seen one wine. |
| 3 | `/finish-signup` | Enter username + password + confirm. Copy "Account created. Let's build your taste profile…" then force-routes to survey. Fine, but it's the first time the product's actual value is mentioned. |
| 4 | `/taste-survey` (7 steps) | Warm, well-written, low-pressure (good). But **"Skip survey for now" and per-step "Skip to next step" are always present**, the survey is **never gated**, and phone-signups and returning logins never see it at all. The one differentiating input is treated as optional. |
| 5 | `/feed` empty (screenshot pattern) | Lands on **"No entries yet."** — a single line, **no CTA, no "log your first wine," no "scan a list," no invite.** The one hard onboarding gate in middleware is *username*, not any first-run value moment (`proxy.ts:108-131`). |

**Net:** ~10+ steps from door to an empty room. The funnel asks for commitment (email, code, password, username, 7 survey steps) before delivering anything, and then delivers nothing (empty feed). This is inverted. Value must come first; commitment second.

**Concrete fixes:**
- Add a landing page (§3).
- Let people scan a list / see the product before the auth wall.
- Replace the empty-feed dead end with a first-run checklist: **Scan a list · Log your first pour · Find friends** — each a one-tap card. (The brand guide literally prescribes this: empty states should sound like Cluster, "every bottle has a story," `:1391`.)
- Move the SMS legal text to a collapsible link on signup so the value prop isn't buried.
- Trim OTP-first: the confirmation-code round-trip is the single biggest drop point; consider password-first with async email verification.

---

## 5. Retention loops — what actually brings someone back weekly

Honest assessment of the three levers:

**Feed — potential engine, currently empty and score-forward.** "What the cluster is drinking" (screenshot `T-feed`) is the right idea: a chronological following-graph feed with reactions (emoji) and threaded comments (`feed/page.tsx:432-680`). At zero network it's an empty room, and its atomic unit leads with "N Pts." **Working:** the social primitives (reactions, comments, replies) are all built. **Decoration/risk:** with no users it's dead, and the score-forward card undermines brand. The feed is a *month-3+* retention loop, not a launch one — don't count on it until there's density.

**Badges — the most over-built, least-load-bearing system in the app.** 85 badges, 6 categories, 4 tiers, 11 SVG shapes (`packages/shared/src/badges.ts`; screenshot `T-badges` "0 of 85 earned"). The copy is genuinely witty and on-brand ("Bargain Oracle — under $25 and exceptional, you have a gift"). **But badges are a reward for behavior that barely exists yet.** 85 badges for a user base that logs ~0 wines is a chandelier in an empty house. **Working:** they're cheap dopamine and shareable *if* surfaced. **Decoration:** 85 is 70 too many for launch; the long tail will never be seen. Keep ~12 that map to the first two weeks of use; hide the rest until earned.

**Friends — built, but no acquisition loop feeding it.** Friend requests exist (`FriendsTab.tsx`), and "tasting night" tagging is real (§6). **Working:** the graph exists. **Missing:** there is *no invite/referral mechanic anywhere* — "invite" appears only in password-reset and friend-request contexts, never as a growth loop. Friends can't grow the friend graph.

**The real weekly loop that isn't being pushed:** **the palate profile getting smarter.** "Your palate, read by the somm" (a listed follow-up, `somm-engine-v2-design.md:105`) is the one thing that *rewards returning* — log a few wines, watch the read of you sharpen, get better restaurant picks. That's the retention story Vivino can't tell. It is currently un-surfaced. **This should be the retention headline, not badges.**

---

## 6. Virality surface — share cards, group tastings, invites

**Share cards — good asset, wrong headline, too buried.** The OG card (`s/[shareId]/opengraph-image.tsx`) is genuinely well-designed: branded, wine name in serif, author, tasting note, "Open in Cluster." It's share-worthy. Two problems: (1) it leads with **"Rating N/100"** (§1) — reinforces the anti-brand; (2) sharing is **2 taps buried in a "…" overflow menu → "Share via text"** (`feed/page.tsx:1272`), only on public posts, with a flat fixed string "Check out this wine from my Cluster." (`entryDetail.ts:1`). The share unit is also a *single bottle* — the Delectable model — never the palate profile or a tasting recap.

**Group tastings / "tasting night mode" — this is your most underrated real-world wedge, and it's half-built.** The mechanics exist: entries can be grouped, people get **"tagged in this tasting,"** and a tagged friend can **"add this tasting to your cellar"** (`entries/[id]/page.tsx:1386`, `:1365`; `entries/page.tsx` "My Events" tab). A grouped tasting even renders as multi-slide on the public share page (`lib/shares.ts:304-308`). **What's missing to make it viral:** a *purpose-built "start a tasting night" flow* (one host creates an event, everyone at the table logs the same flight, and everyone gets a shared recap card ranking the table's picks) and, crucially, the ability to **invite people who aren't users yet** into that tasting. Right now you can only tag existing friends — so the tasting can't recruit. A shared tasting is the single most natural "text this to the 4 people at the table" moment in wine; own it (see move #4).

**Invite mechanics — effectively absent.** There is no referral loop, no contact-invite, no "you were tagged, join to see the tasting" conversion path. This is the biggest structural gap for growth: every other surface generates content but nothing generates *users*.

---

## 7. The wine-list-scan wedge — how to own the restaurant moment

The restaurant wine list is the highest-stakes, highest-anxiety wine decision most people make — public, time-boxed, money on the line, social judgment in the air. It is the perfect wedge and **Cluster's list-scan is already the best-built flow in the app.**

What's strong (verified `ListScanIntakeScreen.tsx`, `ListScanResultsScreen.tsx`):
- Three intake paths — photo (multi-image), PDF, URL — "Scan any wine list… get instant recommendations."
- Excellent perceived-performance craft: staged progress ("Reading the list → Parsing wines → Scoring matches → Computing your personalized match scores").
- Results give **"N% match" + an AI "why you'd like it"** line per top pick, sortable by Best Match, filterable by price/type/varietal/region.
- **It works signed-out** (stored locally), which no competitor does at the table.

How to *own* it:
1. **Make it the hero of the landing page and the App Store story** (§3, §9). This is the demo that sells the app in one screen.
2. **Collapse time-to-scan.** The restaurant moment is impatient. Camera-first, one tap from app open to scanning. Consider a home-screen/App-Clip/widget "Scan a list" shortcut so it's reachable without opening the app cold.
3. **Personalize on the spot** for cold users (the 3-tap mini-palate, §3) so the very first scan feels like it knows you.
4. **Add the killer restaurant primitive: "What should I order?"** — one button that returns the single best pick + a one-sentence reason and a by-the-glass alternative. Decision made in 3 seconds. That's the shareable, word-of-mouth moment ("this app literally told me what to order and it was perfect").
5. **Own the after-moment:** post-dinner, "Log what you drank?" → feeds the palate → next scan is smarter. Close the loop between the wedge and the moat.

---

## 8. Monetization readiness (later, but note the natural lines)

Don't monetize pre-retention. But the natural lines are already visible and match the brand guide's freemium sketch (`:2215-2221`):
- **Free:** unlimited logging, label scan, personal rating, QPR, notes, and *a few* list-scans/month.
- **Cluster+ (the obvious paid line):** **unlimited list-scans + "What should I order?"** is the feature people will pay for because it has value at a discrete high-stakes moment. That's the wedge and the paywall in the same feature — meter it.
- **Secondary paid depth:** full palate map + export ("share with a sommelier/merchant," `:1900`), cellar intelligence (drinking windows) for the Connoisseur.
- **Keep the upsell warm and access-additive** (brand rule `:1390`): premium adds depth, never gates the palate itself.
- **Avoid** merchant banner ads / affiliate clutter (`:2366`) — it detonates the anti-commercial, anti-gatekeeping ethos on contact. If a revenue bridge is needed, B2B (restaurants licensing "your list, scored for your guests") is on-brand; consumer ads are not.

---

## 9. App Store presence — draft the listing

**Name:** `Cluster` (keep it; short, ownable, on-brand). Pair with a keyword-bearing descriptor in the App Store *name field* (30 chars) since the bare word "Cluster" has zero search intent.

- **App Store Name (30 char):** `Cluster: Wine List Scanner` *(leads with the wedge + the top search term "wine")*
- **Subtitle (30 char):** `Know what to order. Instantly.`
- **Alternate subtitle (brand-forward):** `Wine that learns your palate.`

**Keyword field (100 char, comma-packed, no spaces):**
`wine,winelist,sommelier,scan,cellar,tasting,pairing,vino,restaurant,winerating,winetracker,palate,vivino`

**Screenshot story (6 frames — the scan is the hook, the palate is the retention promise, badges/social close):**
1. **HOOK:** a real restaurant wine list photo → results with "92% match" and a why-line. Caption: *"Point at any wine list. We'll tell you what to order."*
2. **"What should I order?"** single-pick answer screen. Caption: *"Your pocket sommelier, at the table."*
3. **Palate profile readout.** Caption: *"It learns your taste. Every pour makes it sharper."*
4. **Log-a-wine (photo autofill).** Caption: *"Snap the bottle. We fill in the rest."*
5. **Tasting night / group recap.** Caption: *"Taste together. See whose palate agrees."*
6. **Anti-gatekeeping manifesto frame.** Caption: *"No scores to chase. No snobbery. Just what you'll love."*

**Promo text / description opener:**
> Vivino tells you what three million strangers think. Cluster learns what *you* think. Scan any restaurant wine list and get picks matched to your palate — with a reason for each one. Log what you drink, and your pocket sommelier gets sharper every pour. No gatekeeping, no wine-snob vocabulary, no score to chase. Just wine, made fun again.

*(Note: this copy leans on "no score to chase" — which requires fixing the /100 on public surfaces first, §1, or the listing writes a check the product contradicts.)*

---

## 10. TOP 10 MOVES (prioritized)

Effort: S = days, M = 1–2 wks, L = 3+ wks. **[PRODUCT]** = the implementation team builds it in-app; **[EXTERNAL]** = founder/marketing/ops.

| # | Move | Why | Effort | Metric it moves | Type |
|---|---|---|---|---|---|
| 1 | **Build a real landing page at `/` with a live, no-auth list-scan demo** as the hero. Kill the `/`→`/login` redirect. | The single biggest funnel leak: today the best pre-signup real estate is a bare login form. Value must precede commitment. | M | Visitor→signup conversion; time-to-first-value | [PRODUCT] |
| 2 | **Fix the score contradiction on public surfaces.** Reframe the 1–100 as a private "your reaction" that is de-emphasized on the feed/share/OG card; lead cards with the wine + your one-line take, not "82 Pts." | The anti-Vivino promise is the whole wedge and every public card currently breaks it. Cheap, high-symbolism. | S | Brand coherence; share-CTR (a non-Vivino card is more distinctive) | [PRODUCT] |
| 3 | **Replace the empty `/feed` first-run with a 3-card checklist** (Scan a list · Log your first pour · Find friends). | New users are dropped into "No entries yet." with no next action — the room is empty the moment they arrive. | S | D1 activation; % logging ≥1 wine | [PRODUCT] |
| 4 | **Ship "Tasting Night" as a first-class flow** — host starts an event, everyone logs the same flight, everyone gets a shared recap card, and **non-users can be invited into it**. | The only surface that both delights AND recruits new users; wine's most natural "text this to the table" moment; mechanics are half-built already. | L | K-factor / invites sent per active user | [PRODUCT] |
| 5 | **Add "What should I order?"** — one-tap single best pick + reason + by-the-glass alt on any scanned list. | Turns the wedge into a 3-second decision and a word-of-mouth moment; also the natural paywall line. | M | Scan→"share/tell a friend"; wedge retention | [PRODUCT] |
| 6 | **Seed the palate in the scan** (3-tap mini-picker on results for cold users) so the first scan is personalized. | Collapses time-to-aha to a single action; design doc confirms 3–10 signals already beat crowd consensus. | S | % of first scans that feel personalized; scan→signup | [PRODUCT] |
| 7 | **Fix the signup funnel:** de-bury the SMS/legal wall, retire the CellarTracker-flavored tagline, make the taste-survey the default path (not always-skippable) or fold its first question into onboarding. | The survey is the differentiator's fuel and it's optional + bypassed by phone/returning users; the disclaimer buries the pitch. | M | Signup completion; % with a distilled palate | [PRODUCT] |
| 8 | **Surface "Your palate, read by the somm"** as a returning-user reward that visibly sharpens as you log. | This — not badges — is the weekly retention story Vivino can't tell; currently un-surfaced. | M | W1/W4 retention; logs per user | [PRODUCT] |
| 9 | **Add an invite/referral loop** (contact/share invite, "you were tagged — join to see the tasting"). | There is no user-generating loop anywhere; every surface makes content, none makes users. | M | K-factor; invited-user signups | [PRODUCT] |
| 10 | **Seed 50–100 Enthusiasts as founding members** (wine subreddits, WSET networks, natural-wine shops) with a permanent founding badge, per the brand GTM. | Feed + palate + tasting-night all need density to work; hand-recruit the users who actually log. | L | Seeded WAU; feed density; first-cohort retention | [EXTERNAL] |

**If you do only three:** #1 (front door), #3 (kill the empty-feed dead end), #6 (personalize the first scan). Together they turn "~10 screens to an empty room" into "one scan to an aha."

---

## 11. Kill your darlings — cut or de-emphasize

- **Cut 70 of the 85 badges at launch.** Keep ~12 that map to the first two weeks (first log, first scan, first tasting night, a couple of taste/region milestones). 85 badges for a zero-log user is decoration; the long tail will never be seen and dilutes the ones that matter. Reintroduce as the base grows. (`packages/shared/src/badges.ts`)
- **De-emphasize the public 1–100 score.** It's the clearest self-inflicted wound: it makes you look like the thing you're positioned against. Make it private/soft. (`feed/page.tsx:1446-1448`, `s/[shareId]/page.tsx:242`)
- **Retire "A private cellar journal with a social pour."** It's CellarTracker's brand. Replace with the scan/palate promise. (`login/page.tsx:121`)
- **De-scope the feed as a launch pillar.** It's an empty room at zero network and leads with the anti-brand score. Keep building it, but don't let it be the home screen's reason-to-return until there's density — the palate + scan should carry launch.
- **Drop the mandatory head-to-head comparison step after logging** (or make it opt-in). Every log already forces a required 3-question survey (`EntryPostSaveSurveyModal.tsx:101`); stacking an additional comparison modal on top taxes the exact behavior (frequent logging) the palate engine depends on. Keep the survey, make the comparison a "want to sharpen your palate?" opt-in.
- **Don't chase Explorers with paid acquisition at launch.** Per the brand's own GTM, they're the month-3 audience; they log least, so they trigger the aha least. Enthusiasts first.
- **No merchant/affiliate ads.** Reconfirmed for emphasis: it kills the ethos on contact. B2B (restaurants) is the on-brand revenue bridge if one is needed.

---

### Appendix — screens/flows referenced
Logged-out: `01-login`, `02-signup` (bare auth, off-brand tagline, disclaimer-dominated). Authenticated shells: `T-feed` ("What the cluster is drinking"), `T-explore` ("Learn, discover, drink better" — the most finished page), `T-palate`/`T-profile` (profile + tabs, empty for light users), `T-badges` ("0 of 85 earned"), `T2-entries` ("Your collection," Opened/In My Cellar/My Events). `/sommelier` rendered blank in-harness (hydration). Code: onboarding funnel (`app/page.tsx`, `signup`, `finish-signup`, `taste-survey`, `src/proxy.ts`), log flow (`NewEntryScreenContainer.tsx`, `EntryPostSaveSurveyModal.tsx`), list-scan (`ListScanIntakeScreen.tsx`, `ListScanResultsScreen.tsx`), feed + share (`feed/page.tsx`, `api/share/handler.ts`, `s/[shareId]/*`, `lib/shares.ts`), palate engine (`docs/somm-engine-v2-design.md`).
</content>
