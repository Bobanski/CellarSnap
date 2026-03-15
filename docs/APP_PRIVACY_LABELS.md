# CellarSnap — App Store Privacy Labels Guide

> **Purpose:** Step-by-step reference for filling out the App Privacy section in App Store Connect.  
> **Last updated:** March 2026  
> **App:** CellarSnap (com.cellarsnap.mobile)

---

## Overview

Apple requires every app submission to declare its data practices via [App Privacy Details](https://developer.apple.com/app-store/app-privacy-details/) in App Store Connect. This document maps CellarSnap's actual data flows to the exact selections you'll make in the App Store Connect form.

**CellarSnap does NOT track users across other apps or websites.** There are no advertising SDKs, no analytics SDKs that use IDFA, and no data broker integrations. This means the "Data Used to Track You" section will be empty.

---

## Quick Summary

| Category | Declared? | Linked to User? | Used to Track? |
|----------|-----------|-----------------|----------------|
| Contact Info | Yes | Yes | No |
| User Content | Yes | Yes | No |
| Identifiers | Yes | Yes | No |
| Usage Data | Yes | Yes | No |
| Diagnostics | Yes | Not Linked | No |
| Photos or Videos | Yes | Yes | No |
| Search History | No | — | — |
| Location | No | — | — |
| Health & Fitness | No | — | — |
| Financial Info | No | — | — |
| Purchases | No | — | — |
| Sensitive Info | No | — | — |
| Contacts | No | — | — |
| Browsing History | No | — | — |

---

## Step-by-Step: App Store Connect Selections

### Step 1: "Do you or your third-party partners collect data from this app?"

**Answer: Yes**

---

### Step 2: Select Data Types Collected

Check the following data types:

#### 1. Contact Info

| Data Element | Collected? | Why |
|-------------|-----------|-----|
| **Name** | Yes | Display name on profile (user-provided) |
| **Email Address** | Yes | Account creation, authentication, profile |
| **Phone Number** | Yes | Phone-based auth (when auth mode = phone) |
| Physical Address | No | — |
| Other User Contact Info | No | — |

**Purpose:** App Functionality  
**Linked to User:** Yes  
**Used to Track:** No

#### 2. User Content

| Data Element | Collected? | Why |
|-------------|-----------|-----|
| **Photos or Videos** | Yes | Wine label photos, tasting photos, profile avatars — uploaded via expo-image-picker, stored in Supabase Storage |
| **Other User Content** | Yes | Wine tasting notes, ratings, reviews, entry descriptions, comments, feedback submissions |
| Emails or Text Messages | No | — |
| Audio Data | No | — |
| Gameplay Content | No | — |
| Customer Support | No | Not collected through the app directly (feedback goes to Supabase) |

**Purpose:** App Functionality  
**Linked to User:** Yes  
**Used to Track:** No

#### 3. Identifiers

| Data Element | Collected? | Why |
|-------------|-----------|-----|
| **User ID** | Yes | Supabase auth UUID, username — used for account management and social features |
| Device ID | No | No device-level identifiers collected |

**Purpose:** App Functionality  
**Linked to User:** Yes  
**Used to Track:** No

#### 4. Usage Data

| Data Element | Collected? | Why |
|-------------|-----------|-----|
| **Product Interaction** | Yes | App interactions logged for operational purposes — e.g., feature usage patterns used to improve the app. Social interactions (likes, follows, comments) are stored as app functionality. |
| Advertising Data | No | No ads in the app |
| Other Usage Data | No | — |

**Purpose:** App Functionality  
**Linked to User:** Yes  
**Used to Track:** No

#### 5. Diagnostics

| Data Element | Collected? | Why |
|-------------|-----------|-----|
| **Crash Data** | Yes | Expo/EAS may collect crash logs for stability monitoring |
| **Performance Data** | Yes | Basic operational telemetry |
| Other Diagnostic Data | No | — |

**Purpose:** App Functionality  
**Linked to User:** Not Linked to User (crash data is aggregated, not tied to individual identity)  
**Used to Track:** No

---

### Step 3: Data NOT Collected (Do Not Check These)

| Data Type | Why Not Collected |
|-----------|-------------------|
| Health & Fitness | Not a health app |
| Financial Info | No payments, no credit card data (no in-app purchases currently) |
| Location (Precise or Coarse) | App does not request location permissions. Wine entries may include user-typed location text, but this is "Other User Content" not GPS/location services data. |
| Sensitive Info | No racial, ethnic, religious, biometric, or similar data collected |
| Contacts | No access to device contacts |
| Browsing History | No web browsing tracked |
| Search History | No search queries persisted for profiling (in-app search is functional only) |
| Purchases | No purchase tracking (no IAP, no commerce) |

---

### Step 4: Third-Party Data Disclosure

CellarSnap integrates the following third-party services. Their data practices must be reflected in the privacy label:

#### Supabase (Auth, Database, Storage)
- **What it receives:** Email, phone, password (hashed), user content, photos
- **Data linked to user:** Yes (it's the primary backend)
- **Tracking:** No
- **Note:** Supabase is the data processor, not a third-party partner that independently uses data. All data is under CellarSnap's control.

#### OpenAI (AI Features — Label Scan, Autofill, Pocket Sommelier)
- **What it receives:** Wine label photos (images), tasting notes text, wine entry data for AI analysis
- **Data linked to user:** The data is sent with context but OpenAI's API does not persistently link it to a CellarSnap user identity
- **Tracking:** No
- **Disclosure needed:** Yes — declare under "User Content: Photos or Videos" and "User Content: Other User Content" that data is shared with a third-party AI service for app functionality
- **Note:** OpenAI's [data usage policy](https://openai.com/policies/api-data-usage-policies) states API data is not used to train models (as of current policy). Mention this if asked during review.

#### Expo / EAS (Build & Distribution)
- **What it receives:** Crash logs, basic device diagnostics during builds
- **Data linked to user:** Not linked (aggregated diagnostics)
- **Tracking:** No

#### Vercel (Web Hosting)
- **What it receives:** Standard web request logs (IP addresses, user agents) for the web version
- **Data linked to user:** Not linked
- **Tracking:** No
- **Note:** This is for the web deployment only, not the iOS app directly. May not need to be declared if the iOS app doesn't route through Vercel for API calls. CellarSnap's API routes through Vercel (Next.js API routes), so basic server logs apply.

---

## Privacy Nutrition Label Preview

Based on the above, CellarSnap's App Store page will show:

### Data Linked to You
- Contact Info (Name, Email Address, Phone Number)
- User Content (Photos or Videos, Other User Content)
- Identifiers (User ID)
- Usage Data (Product Interaction)

### Data Not Linked to You
- Diagnostics (Crash Data, Performance Data)

### Data Used to Track You
- *None* — CellarSnap does not track users across apps or websites

---

## Privacy Links (Required)

You'll need to provide these URLs in App Store Connect:

| Field | URL |
|-------|-----|
| **Privacy Policy URL** (required) | `https://cellar-snap.vercel.app/privacy` |
| **Privacy Choices URL** (optional) | — (not needed; users manage privacy in-app via entry-level privacy controls and account deletion) |

> **Note:** The Privacy Policy URL must be publicly accessible (not behind auth). The current `/privacy` route renders in the mobile app but should also be accessible via web. Verify `https://cellar-snap.vercel.app/privacy` loads correctly in a browser. If it doesn't, consider creating a static HTML version at the same URL path in the Next.js web app.

---

## Checklist Before Submission

- [ ] All data types above are declared in App Store Connect → App Privacy
- [ ] "Data Used to Track You" is empty (no tracking)
- [ ] Privacy Policy URL is set and publicly accessible
- [ ] Privacy Policy content matches what's declared in the labels (AI disclosure, third-party services, data types)
- [ ] Terms of Use URL is accessible
- [ ] Age rating is set to 17+ (alcohol/wine content)
- [ ] Age gate is implemented in the app
- [ ] `NSCameraUsageDescription` is set in Info.plist ✅ (done — PR #12 merged)
- [ ] `NSPhotoLibraryUsageDescription` is set in Info.plist ✅ (already present)
- [ ] Sign in with Apple is implemented (required since app has third-party auth)

---

## Notes

- If CellarSnap adds in-app purchases, analytics SDKs (e.g., Mixpanel, Firebase Analytics), or advertising in the future, this document and the App Store Connect selections must be updated.
- Apple can audit your privacy declarations against your actual code. The Privacy Manifest (`PrivacyInfo.xcprivacy`) may be required if you use any "Required Reason APIs." Currently, CellarSnap's SDK dependencies (Expo, Supabase) may trigger this — check `npx expo prebuild` output for any privacy manifest warnings.
- Keep this document updated alongside the Privacy Policy and Terms of Use whenever data practices change.
