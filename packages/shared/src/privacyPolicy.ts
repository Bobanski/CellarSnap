export const PRIVACY_UPDATED = "September 22, 2026";
export const PRIVACY_CONTACT = "cellarsnap@gmail.com";
export const PRIVACY_SECTIONS = [
  { title: "What Cluster stores", paragraphs: [
    "Cluster stores account and profile details, including your email, username, display name and optional profile information. Phone numbers are used when you choose phone authentication. Sign in with Apple supplies an account identifier and any name or email you choose to share.",
    "We store wine entries, ratings, tasting notes, photos, cellar/import records, selected or typed tasting locations, taste-survey answers, saved wine-list scans, sommelier conversations, social connections, comments, reactions, reports and feedback. This information supports your account, wine log, recommendations and social features. We do not access your device contacts. The native app does not request GPS location permission; uploaded photos may contain location metadata.",
  ] },
  { title: "Sharing and photo privacy", paragraphs: [
    "Your entry and photo settings control visibility to other users. Public entries can appear in public or shared views; friends and private settings restrict access. Numeric ratings are private to the entry owner; shared surfaces may show a qualitative enjoyment band or a separate match score.",
    "Current app photo requests check access through Cluster's servers. Changing privacy settings cannot erase copies someone has already downloaded or captured. Historical media and backups may remain while we reconcile and safely remove retained files.",
  ] },
  { title: "Optional AI processing", paragraphs: [
    "With your permission, OpenAI processes selected photos, wine-list images or PDFs, wine details, notes and sommelier messages for scanning, chat, recommendations and searchable summaries. Relevant private entries, ratings and tasting history can be included to personalize these features.",
    "Anthropic processes tasting history, taste-survey answers and wine details to build a palate profile and recommendation explanations. Google Cloud Vision can process wine-list images for text recognition. Which provider receives content depends on the feature and available processing path.",
    "Choose Allow AI sharing before using these features. You can decline and keep manual logging, your cellar and social features. Change your account-wide choice in Privacy & AI. Turning sharing off stops new AI processing; it does not recall content already sent or requests already underway, or delete existing results. Avoid submitting sensitive information or other people's personal content.",
  ] },
  { title: "Service providers and operational data", paragraphs: [
    "Supabase provides authentication, database and photo storage. Vercel hosts the web app and the API used by both web and mobile. Requests can produce operational logs, including IP addresses, request information, account identifiers and errors. We use these to operate, secure and troubleshoot the service. Web venue suggestions use Google Maps and may send location-search text with precise coordinates read from photo metadata or, if you grant browser permission, your device location.",
    "Cluster does not sell personal information or use advertising identifiers to track you across other companies' apps or websites. AI and infrastructure providers process submitted data under their service terms and retention settings; do not assume immediate deletion or zero retention by those providers.",
  ] },
  { title: "Retention and deletion", paragraphs: [
    "Account content and generated results are retained to operate the service until removed or your account is deleted. You can delete entries and request account deletion from Profile settings. Account deletion removes the account and associated database records and attempts to remove its stored media. Media cleanup can be delayed if storage operations fail.",
    "Operational records, recovery backups and historical media may persist beyond deletion while needed for security, recovery or cleanup. We do not promise a fixed deletion deadline for those copies. For help with retained media, prior AI submissions or a deletion request, contact cellarsnap@gmail.com.",
  ] },
  { title: "Your choices and contact", paragraphs: [
    "Manage entry visibility in the editor and profile settings, AI sharing in Privacy & AI, and camera/photo-library access in your device settings. Authentication messages are sent when you initiate the relevant sign-in or recovery flow.",
    "For privacy, support or safety questions, email cellarsnap@gmail.com. Cluster is intended for people of legal drinking age in their location. The in-app age check and App Store age rating are separate from local drinking-age requirements.",
  ] },
] as const;
