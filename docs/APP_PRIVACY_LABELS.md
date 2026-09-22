# Cluster — App Privacy source review

Updated September 22, 2026, QC-22 / B04f. Bundle: `com.cellarsnap.mobile`.
This is a source-grounded draft for the final App Store Connect questionnaire, **not a receipt that its answers have been entered or verified**. The previous March guide contained unsupported claims about diagnostics, AI recipients and age ratings and is superseded here.

## Data and evidence

Purpose is App Functionality unless the final production configuration establishes another use. Treat the following stored data as linked to the account. Optional collection still needs disclosure when Apple's exceptions do not apply.

| App Privacy type | Source / intended declaration |
|---|---|
| Name, Email Address | Auth and profile, including Apple-supplied/relay email and optional names. Linked. |
| Phone Number | Supported phone authentication/profile fields; optional does not mean absent. Confirm enabled production mode and profile collection in the final binary. Linked when collected. |
| User ID | Auth UUID, username, social graph, entry ownership. Linked. |
| Photos or Videos | Wine/tasting photos and avatars stored in Supabase; selected images sent to AI only after permission. No video feature claimed. Linked. |
| Other User Content | Wine details, notes, ratings, survey answers, sommelier messages/results, cellar imports, selected/typed tasting venue text and saved scan content. Linked. |
| Customer Support | In-app feedback and safety reports are stored with account context. The previous guide incorrectly excluded this because feedback lives in Supabase. Linked. |
| Product Interaction | Stored social interactions, scans and recommendation activity; no separate analytics SDK was found in the candidate's dependency list. Linked. |
| Other Diagnostic Data | API/error logs may include account IDs, request metadata and network identifiers. Do not label these anonymous without proving de-identification. Confirm actual Vercel/Supabase collection and retention settings before entering the final answer. |
| Crash Data / Performance Data | No dedicated crash-analytics SDK or runtime Expo crash collection was established by source review. EAS build logs are not evidence that user crash data is collected. Inspect the final binary, service settings and Apple reporting separately; do not copy the old automatic Yes/Not Linked answers. |

No advertising/IDFA, cross-app tracking, payments/IAP, device contacts, audio recording, or native GPS permission was found in this source review. This does not replace the final dependency/native-manifest inspection. App Privacy's Location category cannot be ruled out solely because GPS permission is absent: inspect structured venue/place-ID storage and any provider enrichment against Apple's definitions. Free-form location text is Other User Content; source inspection found no mobile latitude/longitude API. Uploaded originals may retain EXIF location: inspect final native picker/upload bytes before answering Location. Web explicitly reads EXIF GPS and requests optional browser geolocation for Google Maps venue bias (`src/lib/exifGps.ts`, `src/components/LocationAutocomplete.tsx`); the shared public policy discloses this. Saved sommelier prompts and scan URLs/content are user content; do not describe them as unpersisted searches. Confirm with the current questionnaire whether any structured search-history collection warrants a separate selection.

## Processors and permission

| Processor | Data sent / source |
|---|---|
| Supabase | Authentication, profiles, entries, social data, storage and generated results. Both platforms use it. |
| Vercel | Web and **mobile** API traffic and operational logs. Mobile is not exempt from this disclosure. |
| OpenAI | Label/photo/bottle/lineup analysis; list parsing; import column mapping; recommendation notes fallback; sommelier messages/context and embeddings. See `src/app/api/`, `src/server/listScan/parse.ts`, `src/server/sommelier/`. |
| Anthropic | Taste survey and tasting-history signal for palate distillation; personalized scan explanations. See `src/server/algorithm/palateDistillation.ts`, `src/app/api/list-scan/recommendation-notes/route.ts`. |
| Google Cloud Vision | Uploaded list images for OCR when configured; OpenAI fallback also exists. See `src/server/listScan/parse.ts`. |
| Google Maps | Web venue search text and photo/browser coordinates for location bias. Verify the final mobile implementation and uploaded EXIF metadata before final Location answers. |
| Apple / Expo EAS | Apple sign-in and build/distribution infrastructure. Do not infer app runtime diagnostics collection from using EAS. |

The candidate introduces a versioned account-wide AI permission: both platforms identify recipients, data and purpose; Allow, Continue without AI and later revocation are available through Privacy & AI. The API checks fresh server-owned account metadata before any protected AI request. Operator personal-entry embedding also checks each owner's permission per page. No existing account is opted in automatically. Public reference-only Explore generation does not use personal history and is separate from these personal-content routes.

Revocation stops subsequent requests/batches, including requests using previously issued JWTs; it cannot recall in-flight requests, erase prior provider copies or delete existing generated results. Account deletion and provider retention are separate. **Do not promise zero retention, no training or a fixed deletion window without verifying the actual provider contracts/account settings.** Historical media retention (AUD-01/22), cleanup retries (AUD-26) and diagnostic work (AUD-50) remain separate obligations.

## Public links and remaining operator checks

- Intended Privacy Policy: `https://cellarsnap.app/privacy` (candidate changes must first be deployed).
- Existing `/privacy/more` uses the same policy; mobile renders the same shared content.
- Terms: `https://cellarsnap.app/terms`; support/privacy contact already published by the project: `cellarsnap@gmail.com`. Verify that inbox is monitored and provide a working public support URL in the listing.
- Enter and review the actual App Store Connect data-type/purpose/linkage/tracking answers, including third-party processing and optional features.
- Verify deployed web policy, installed-native policy access, consent denial/allow/revoke, and the signed app's privacy manifests.
- Verify retention/backups/provider settings and customer-support response ownership; this code review cannot establish those contractual or operational facts.
- Complete the **current age-rating questionnaire**, including alcohol references and UGC. Do not force the obsolete blanket “17+” answer from the old guide. Apple computes regional ratings; apply an appropriate higher override if the terms' minimum age exceeds that result. The app's 21+ age gate is a separate constraint.

References reviewed September 22: [Apple App Privacy details](https://developer.apple.com/app-store/app-privacy-details/), [Review Guidelines 5.1.2(i)](https://developer.apple.com/app-store/review/guidelines/#data-use-and-sharing), [current age-rating questionnaire](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/). No legal certification or App Review approval is asserted.
