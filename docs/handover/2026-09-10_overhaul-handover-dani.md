# Cluster — where the current version stands

**For:** Dani · **From:** Eitan · **Date:** September 10, 2026

This is the state of "the overhaul" — the version you've been reviewing at cluster-overhaul.vercel.app — plus what today's launch plan needs from the product side. Short version first, detail after.

## The short version

- **The overhaul is finished but not live.** Everything from July (your landing feedback, the TasteMap, the design system, both rounds of Ethan's feedback) sits on one branch, 75 commits ahead of production. It has been waiting since July 15. Production at cellarsnap.app is still the July 8 build.
- **Preview to look at:** https://cluster-overhaul.vercel.app — this *is* the overhaul, current as of July 15.
- **Nothing you asked for is unbuilt** from the July rounds. The open items below are new work from today's meeting, plus decisions that were parked on purpose.
- **Next technical step:** merge it to production (clean, no conflicts), apply one small database change, then it's the base for the App Store build.

## What the overhaul is

The July engagement started with four audits (marketing, engineering, UX, design). Their shared diagnosis: everything valuable was invisible behind login, the public 1–100 score contradicted the "no scores, no hierarchy" brand, first-run landed people in an empty room, and the UI had drifted into competing patterns. The plan fixed those in three waves, then took two rounds of founder feedback.

| Area | What shipped |
|---|---|
| Front door | Landing page at `/` (your logo, bottle-first hero, voice at top), list-scan and Pocket Somm work without an account, branded 404, first-run checklist instead of an empty feed |
| Palate visible | TasteMap (the 16-axis radar drawn from the grape-circle motif), rebuilt entry detail around match + rating + TasteMap, palate page upgrade, wine-glass confidence meter, "teach on tap" chips |
| Design system | One button set, one segmented control, ScoreBadge, EmptyState; gold only for premium, green only for natural wine; serif headlines and serif numerals everywhere; motion tokens |
| Public surfaces | Raw scores off feed cards and share pages — replaced by qualitative bands + match % |
| Somm | Distilled palate profile briefs Pocket Somm; bottle-photo identification in somm chat ("shelf moment" verdicts); chat crash hardening |
| Explore | Icons on type cards (per Ethan — AI images only on heroes), weekly rotation, new-to-wine path, producer curation and tier toggle, ProducerMark crest avatars, "Explore next" |
| Social / profile | Alerts portal, badge tile-flip, five featured badges in order (your ask), event search, feed comments, counting stats instead of "+2.3" deltas |
| Reliability | Save failures now surface instead of silently dropping; rate limits; a security fix on reference tables; the Explore slowness root-caused (an unapplied database change) and fixed |

Two bugs worth knowing about because they were invisible: manual entries never activated Palate Match (a missing wine-type field), and a "silent save" that lost entries. Both fixed.

## Ethan's two rounds

- **Round 1 (July 9):** 36 items triaged. His big finding was real — the palate read never filled at 62 wines because there was no automatic distill trigger. Fixed with auto-distill. The only conflict was palate prominence on the feed; resolved as compact + dismissible.
- **Round 2 (July 15):** 7 of 9 shipped. Two flagged for team discussion: feed caption width, and how prominent list-scan should be (built as his low-commitment stack for now).
- **Still open with Ethan:** a Pocket Somm crash he reported that two full investigations could not reproduce. A guard rail is in place; we need his browser/OS and which screen it happened on.

## Parked decisions (need a human call)

1. **Badge cull.** Marketing audit says cut 70 of the 85 badges for launch and keep ~12 that map to the first two weeks. Deferred as Eitan's call. If badge work is on your plate: definitions live in one file, all artwork is generated (11 shapes × 4 tiers × 6 colors), so a cull is a list edit, not a design project. Categories in the code are taste, region, milestone, social (41 / 28 / 9 / 7).
2. **Explore art direction.** You offered to spec the format. Not started; the current icon-on-cards approach is Ethan's interim.
3. **Champagne Daylight** (light theme) exists as a reference draft only. Noir Refined is canonical.
4. **Invite / referral loop**, producer logos (rights), map view, bios/favorites — all deferred.

## Today's meeting → product work

| Meeting item | Status | Notes |
|---|---|---|
| Badge updates | Design/decision | See cull above. Overflow-clipping bug already fixed July 15 |
| Explore page: less text, click-to-expand bullets | Not started | Small UI change; hub page + region/grape/producer detail pages |
| Video posts under 10s | Not started, new | App accepts images only today (`image/*` everywhere). Needs upload, storage, playback, and thumbnailing — a real feature, not a toggle |
| Content moderation before launch | Not started, new | Reporting and blocking exist and work. There is **no** automated image screening. Needs a NSFW/SafeSearch check on upload |
| In-app feedback form → database | Already exists | Bug / Feature idea / UX confusion / Other, optional email, stored with the page it came from |
| App Store description | Draft exists | The marketing audit has a full draft listing (name, subtitle, keywords, six screenshot captions, description). Good starting point for the shared Google Doc |
| Website | Built today | Static site mirroring the landing copy + privacy, terms, support pages. Waiting on Ethan's domain |

## Known gaps to keep in mind

- The iOS build itself (PR 77) is also waiting since July 8: app icon, safe areas, haptics, CI, and a submission runbook. Bundle ID is still `com.cellarsnap.mobile`; App Store name in the draft listing is "Cluster: Wine List Scanner".
- The only contact address anywhere is cellarsnap@gmail.com. Public launch wants a domain address.
- Legal pages say "friends-and-family test product". The website version now says "early-access product"; the in-app copy should follow.
- Tasting 3 was planned in July with a predictions workbook and never happened. The eval set is still 103 comparisons from 12 tasters.

## How to review or give feedback

- Use https://cluster-overhaul.vercel.app for the overhaul and https://cellarsnap.app for what's live today.
- Feedback in the same format as July (numbered items per screen) is what gets implemented fastest. Screenshots help; "which screen, what you expected, what happened" is enough.
- The in-app feedback page works on both and tags the screen automatically.

## Technical appendix (for whoever ships it)

- Branch `feat/overhaul` at `3448601`, PR #76 open, `main` at `830aca4`; main is a strict ancestor, so merge is a clean fast-forward.
- Database changes 090–094 and 097 are confirmed present in production. 095 (reference-table lock-down) was applied July 8 per the session log. **096 (notifications index + updated_at triggers) is believed unapplied** — apply at merge.
- iOS: PR #77 (`fix/ios-submission`). Runbook at `docs/IOS_SUBMISSION_RUNBOOK.md`.
- Duplicate Vercel project `cellarsnap` still exists next to the real `cellar-snap`; delete it or expect error noise.
- GitHub credentials on the Mac are expired, which is part of why this has sat since July.
