# Cluster iOS App Store submission packet

Prepared September 26, 2026. This is the source-controlled entry packet for the
first iOS submission. Reconcile it with the exact signed build and live services
before copying values into App Store Connect. Never commit reviewer credentials,
API keys, certificates, or recovery codes.

## Product identity

| Field | Release candidate | Limit / status |
|---|---|---|
| App name | `Cluster: Wine List Scanner` | 26/30 characters |
| Subtitle | `Wine picks for your palate` | 26/30 characters |
| Bundle ID | `com.cellarsnap.mobile` | Must be recreated and owned by Cluster Wine, LLC before upload |
| Version | `1.0.1` | Matches `apps/mobile/app.json` |
| Build | `3` | Confirm unused immediately before the first upload |
| Primary category | Food & Drink | Owner confirmation required |
| Secondary category | Lifestyle | Optional; owner confirmation required |
| Copyright | `2026 Cluster Wine, LLC` | Entity confirmed; Apple adds the copyright symbol |
| Privacy Policy URL | `https://clusterwine.app/privacy` | Live; publish the September 26 source update before submission |
| Support URL | `https://clusterwine.app/support` | Live and includes `support@clusterwine.app` |
| Marketing URL | `https://clusterwine.app` | Live |
| Release | Manual | Recommended for the first version so approval and release remain separate |

Apple's current limits are 30 characters for name and subtitle, 170 for
promotional text, 4,000 for description, and 100 bytes for keywords. Keywords
must not contain other app or company names.

## English (U.S.) listing copy

### Promotional text — 138/170 characters

> Scan a restaurant wine list, get personalized picks, and log every bottle. Cluster learns your palate so each recommendation gets sharper.

### Keywords — 91/100 bytes

`sommelier,menu,scanner,tasting,cellar,pairing,restaurant,palate,tracker,bottle,labels,notes`

### Description

Cluster helps you choose wine with more confidence and remember what you love.

SCAN A WINE LIST
Take photos, choose images, attach a PDF, or paste a restaurant menu URL. Cluster organizes the wines and, when you allow AI processing, explains which options best fit your palate.

BUILD YOUR PALATE
Complete a short taste survey and log what you drink. Your recommendations become more personal as Cluster learns the styles, grapes, regions, and flavors you enjoy.

LOG EVERY BOTTLE
Save bottle photos, wine details, tasting notes, locations, value impressions, and your private rating. Organize wines in your cellar and custom collections.

DRINK WITH FRIENDS
Share public or friends-only entries, follow people you know, react and comment, and block or report content and accounts when needed.

YOUR CHOICES MATTER
Choose who can see each entry. AI sharing is optional and can be turned off from Privacy & AI. You can delete your account from Profile settings.

Cluster is intended for people of legal drinking age in their location. AI-assisted wine details and recommendations may be incomplete or wrong; verify important information yourself.

## Screenshot plan

Capture these only from the exact TestFlight candidate that passes installed-device
acceptance. Do not use the older build 2 or browser mockups. Apple currently accepts
one to ten screenshots; use the highest required iPhone resolution when the UI is the
same across sizes.

1. Wine-list intake — “Scan the list. Find your bottle.”
2. Personalized results — “Picks matched to your palate.”
3. Bottle logging — “Snap it. Save the whole story.”
4. Palate profile — “Every pour makes it sharper.”
5. Cellar and collections — “Keep every favorite close.”
6. Friends feed — “See what your people are drinking.”

Do not show real user data, private tasting notes, production emails, access tokens,
or unlicensed restaurant branding. Screenshot captions must describe functionality
actually present in the submitted binary.

## App Review information

### Contact

Enter a monitored Cluster Wine, LLC contact name, `support@clusterwine.app`, and a
working phone number in international format. These are App Review fields, not public
listing copy. Owner supplies the name and phone number in App Store Connect.

### Demo account

Create a dedicated non-expiring email/password account after the production app and
backend are frozen. Populate it only with synthetic fixtures:

- a completed taste survey and palate profile;
- several wine entries covering public, friends, and private visibility;
- one custom collection and one cellar item;
- a synthetic friend/feed relationship, comment, reaction, report target, and block target;
- a saved wine-list scan whose source is owned or licensed for review.

Store the username/password only in App Store Connect. Test the account immediately
before submission and do not require SMS, email OTP, an invite, or a private beta flag.

### Draft review notes

> Cluster is a wine journal, personalized recommendation, and social app for adults of legal drinking age. Sign in with the supplied demo account to reach the populated experience. The Wine List Scanner is available from the main navigation and accepts a camera photo, library image, PDF, or URL. AI-powered scanning and recommendations require the in-app “Allow AI sharing” choice; manual logging, cellar, collections, and social features remain available if it is declined. Entry visibility is selected per entry. Reporting is available from a post or comment menu, blocking is available from another user's profile, and account deletion is in Profile > Settings. Sign in with Apple is also available on iOS. No purchases or subscriptions are included in this version. Contact support@clusterwine.app if review access needs attention.

Replace the navigation wording if the installed candidate differs. Add special
instructions for any temporary fixture or server state, but do not include internal
tester accounts or production-user content.

## Age rating and content declarations

Answer the live questionnaire from the submitted behavior; do not copy an assumed
numeric age rating. Source review supports these declarations:

- Alcohol, Tobacco, or Drug Use or References: wine is the app's central subject, so
  declare the current questionnaire's frequent/intense equivalent.
- User-Generated Content: Yes.
- Social Media: Yes (feed, reactions, comments, and sharing).
- Messaging and Chat: review Apple's current examples; public comments/replies are
  user communication and should not be omitted merely because there is no private DM.
- Advertising, gambling, simulated gambling, contests, and loot boxes: No in the
  reviewed candidate.
- Made for Kids: No. The product and policy require legal drinking age.
- Age Assurance: the app has an in-app age gate, but verify whether it meets Apple's
  current definition before selecting this capability.

The owner must also confirm territory strategy. Alcohol references can affect regional
ratings and availability; do not override Apple's result downward.

## App Privacy and compliance

Use `docs/APP_PRIVACY_LABELS.md` as the source-grounded questionnaire draft. Before
publishing the answers:

- publish the current `clusterwine.app/privacy` text;
- verify that `support@clusterwine.app` is monitored;
- confirm provider retention/logging settings with Supabase, Vercel, OpenAI,
  Anthropic, Google Cloud Vision, and Google Maps;
- inspect the signed archive's merged privacy manifest and permissions;
- native picker uploads are now re-encoded before transmission to remove source
  EXIF/IPTC metadata, but confirm that behavior with a real GPS-tagged iPhone photo;
- exercise in-app account deletion with a disposable Apple-linked account and verify
  any required Sign in with Apple token revocation behavior;
- answer for all app platforms and integrated third parties, not just the iOS UI.

Cluster contains public user-generated content. Apple's review guideline requires
filtering objectionable material, reporting, blocking, timely responses, and published
contact information. Report and block flows plus public contact are implemented. B11i
adds database-authoritative screening for shared narrative text/comments, canonical
report intake, a private evidence queue, four-/24-hour deadlines, an SLA checker, and
atomic content removal for confirmed violations. Before submission, deploy and
live-test that migration, connect and drill the five-minute primary/backup alert,
confirm `support@clusterwine.app` ownership, and pass installed-iOS
report/block/filter acceptance. See `docs/MODERATION_RUNBOOK.md`; do not claim image
pre-screening or operational readiness before those gates pass.

## External account gates

1. Cluster Wine, LLC Account Holder accepts all current agreements.
2. Invite `eitan@clusterwine.app` as Admin with Certificates, Identifiers & Profiles access.
3. Safely release the unused personal-team `com.cellarsnap.mobile` identifier after
   checking its Sign in with Apple grouping, then recreate it on the company team.
4. Create the company-owned App Store Connect app record and resolve its numeric ID.
5. Configure protected company signing and submission credentials in EAS; do not
   upload credential files to the repository.
6. Rotate the production database password recorded under OPS-04 before migration or release work.

## Final submission sequence

Run the checked-in iOS submission runbook. A successful EAS upload is only a processed
TestFlight/App Store Connect build; it is not an App Review submission. Select the exact
accepted build, complete metadata/privacy/review information, add it for review, and
then explicitly submit the draft submission.

## Apple references reviewed September 26, 2026

- https://developer.apple.com/help/app-store-connect/reference/app-information/app-information
- https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information
- https://developer.apple.com/help/app-store-connect/manage-app-information/upload-app-previews-and-screenshots
- https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy
- https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating
- https://developer.apple.com/app-store/review/guidelines/
