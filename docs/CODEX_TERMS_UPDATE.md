# Codex Task: Production-Ready Terms of Use & Privacy Policy

> **Branch:** `fix/terms-production-language`
> **Base:** `main` at `4ab8541`
> **⚠️ PARALLEL WORK:** Other agents are working on `feat/apple-sign-in` and `feat/age-gate` simultaneously. Before committing, always `git checkout fix/terms-production-language` and confirm you're on the correct branch. Never commit to main directly.

---

## Goal

Replace the placeholder Terms of Use and Privacy Policy with production-quality legal text that meets Apple App Store review requirements. The current versions are lightweight stubs that would be flagged during review.

Apple requires:
- A clear, accessible Privacy Policy (App Store Review Guideline 5.1.1)
- Terms of Use that cover user-generated content, AI features, account termination, and dispute resolution
- EULA or equivalent terms for paid features (currently no paid features, but should future-proof)

## Current state

Both `apps/mobile/app/terms.tsx` and `apps/mobile/app/privacy.tsx` are simple single-card screens with a few informal paragraphs. They need to be replaced with comprehensive, well-structured legal documents while keeping the same visual design.

## What to implement

### 1. Update `apps/mobile/app/terms.tsx`

Replace the content paragraphs with production-quality terms. Keep the exact same React Native component structure and styles — only change the text content.

**Required sections in the Terms of Use:**

1. **Introduction / Acceptance of Terms**
   - "By downloading, accessing, or using CellarSnap, you agree to be bound by these Terms of Use."
   - Mention that continued use constitutes acceptance

2. **Eligibility**
   - Must be 21 years or older (or legal drinking age in user's jurisdiction)
   - Must have legal capacity to enter into agreements
   - Tie back to the age gate: "You have confirmed your age upon first use of the app."

3. **Account Responsibilities**
   - Users are responsible for maintaining account security
   - One account per person
   - Accurate information required
   - Users responsible for all activity under their account

4. **User-Generated Content**
   - Users retain ownership of their content (wine entries, photos, notes, reviews)
   - Users grant CellarSnap a license to display, store, and process their content for app functionality
   - Prohibited content: unlawful material, harassment, spam, private data shared without consent, IP violations
   - CellarSnap may remove content that violates these terms

5. **AI-Powered Features**
   - The app uses artificial intelligence (OpenAI) for features like label scanning, wine autofill, and the Pocket Sommelier
   - AI outputs are suggestions and may contain errors
   - Users should verify AI-generated information before relying on it
   - AI processing involves sending uploaded images and text to third-party AI services
   - Do not upload sensitive personal images or documents

6. **Privacy Controls**
   - Entries can be set to public, friends-only, or private
   - Public entries may be visible to other CellarSnap users
   - Privacy settings can be changed at any time

7. **Intellectual Property**
   - CellarSnap brand, design, and software are owned by CellarSnap
   - Users may not reverse-engineer, copy, or redistribute the app

8. **Account Suspension & Termination**
   - CellarSnap may suspend or terminate accounts for violations
   - Users can delete their account at any time (account deletion is implemented)
   - Upon deletion, user data is removed per the privacy policy

9. **Disclaimers**
   - Service provided "as is" without warranties
   - Features may change, be added, or removed
   - No guarantee of uptime or availability
   - Not responsible for decisions made based on AI recommendations

10. **Limitation of Liability**
    - CellarSnap's liability limited to the maximum extent permitted by law
    - Not liable for indirect, incidental, or consequential damages

11. **Changes to Terms**
    - CellarSnap may update these terms
    - Continued use after changes constitutes acceptance
    - Material changes will be communicated through the app

12. **Contact**
    - Support email: cellarsnap@gmail.com

**Tone guidance:**
- Professional but approachable — not dense legalese
- Short paragraphs, clear language
- Match the existing app personality (casual-premium, wine journal vibe)
- Use plain English wherever possible

**Format guidance:**
- Each section gets its own `<View>` with a section title `<AppText>` styled as a subtitle/heading
- Section headings: `color: "#fafafa"`, `fontSize: 15`, `fontWeight: "700"`, `marginBottom: 4`
- Body text stays at current `paragraph` style: `color: "#d4d4d8"`, `fontSize: 13`, `lineHeight: 19`
- Update `LAST_UPDATED` to `"March 2026"`

### 2. Update `apps/mobile/app/privacy.tsx`

Replace content with production-quality privacy policy.

**Required sections in the Privacy Policy:**

1. **Introduction**
   - What CellarSnap is (wine journal and social sharing app)
   - What this policy covers

2. **Information We Collect**
   - Account information: email, phone number (if phone auth), username, display name
   - Profile information: avatar photo, bio
   - Wine entries: photos, tasting notes, ratings, wine details, location data (if provided)
   - Social data: friends, follows, likes, comments, entry shares
   - Usage data: app interactions, feature usage, crash reports, error telemetry
   - AI interaction data: images and text submitted to AI features

3. **How We Use Information**
   - Provide and improve the app experience
   - Process wine entries and power AI features (label scanning, autofill, Pocket Sommelier)
   - Enable social features (sharing, following, discovering)
   - Send service communications (verification emails, password resets)
   - Maintain security and prevent abuse
   - Generate anonymized analytics

4. **Third-Party Services**
   - **Supabase**: Authentication, database, and file storage (hosted on AWS)
   - **OpenAI**: AI-powered features (image analysis, text generation) — images and text are sent to OpenAI's API
   - **Vercel**: Web hosting
   - **Expo / EAS**: App build and distribution infrastructure
   - Each service has its own privacy policy; link to them if convenient, but text references are fine

5. **Data Storage & Security**
   - Data stored on Supabase (AWS infrastructure, US-West-2 region)
   - Photos stored in Supabase Storage with signed URLs
   - Passwords are hashed and never stored in plaintext
   - Row-level security on all database tables
   - HTTPS/TLS for all data in transit

6. **Your Privacy Controls**
   - Set entries to public, friends-only, or private
   - Update profile information at any time
   - Delete individual entries
   - Delete your entire account (removes all associated data)
   - Block and report other users

7. **Data Retention**
   - Account data retained while account is active
   - Deleted content removed from active systems; may persist in backups for a limited period
   - Anonymized analytics may be retained indefinitely

8. **Children's Privacy**
   - CellarSnap is not intended for anyone under 21 (or legal drinking age)
   - We do not knowingly collect data from minors
   - If we learn we have collected data from a minor, we will delete it

9. **Changes to This Policy**
   - We may update this policy from time to time
   - Material changes will be communicated through the app
   - Continued use constitutes acceptance

10. **Contact**
    - Privacy and support: cellarsnap@gmail.com
    - "For privacy-related requests, including data access or deletion, contact us at the email above or use the in-app feedback feature."

**Same tone and format guidance as Terms above.**

Update `LAST_UPDATED` to `"March 2026"`.

### 3. Component structure

Keep the EXACT same component structure for both files. What changes is **only the text content** inside the `<View style={styles.section}>` block.

For each section, use this pattern:

```tsx
<View style={styles.sectionBlock}>
  <AppText style={styles.sectionTitle}>Section Title</AppText>
  <AppText style={styles.paragraph}>
    Section content paragraph...
  </AppText>
  <AppText style={styles.paragraph}>
    Additional paragraph if needed...
  </AppText>
</View>
```

You'll need to add two new styles:

```typescript
sectionBlock: {
  gap: 6,
  marginBottom: 8,
},
sectionTitle: {
  color: "#fafafa",
  fontSize: 15,
  fontWeight: "700",
},
```

Add these to the existing `StyleSheet.create()` in both files.

## Files to modify

| File | Change |
|------|--------|
| `apps/mobile/app/terms.tsx` | Replace placeholder text with production Terms of Use |
| `apps/mobile/app/privacy.tsx` | Replace placeholder text with production Privacy Policy |

## Files NOT to modify

- `apps/mobile/app/(auth)/sign-in.tsx` — Legal links already work
- `apps/mobile/app/(auth)/sign-up.tsx` — Legal links already work
- `apps/mobile/app/_layout.tsx` — No routing changes needed
- `apps/mobile/app.json` — No config changes

## Validation

- Run `cd apps/mobile && npx tsc --noEmit` to check types
- Run `cd apps/mobile && npx eslint app/terms.tsx app/privacy.tsx`
- Read through both documents to ensure they read naturally and cover all sections listed above
- Verify the "Privacy" and "Terms" footer links in each screen correctly cross-link
- Verify `LAST_UPDATED` is set to `"March 2026"` in both files

## Quality checklist

Before committing, verify:
- [ ] All 12 Terms sections are present with clear headings
- [ ] All 10 Privacy sections are present with clear headings  
- [ ] Language is professional but approachable (not dense legalese)
- [ ] AI features are clearly disclosed (OpenAI usage, what data is sent)
- [ ] Age requirement (21+) is mentioned in both documents
- [ ] Account deletion is mentioned in both documents
- [ ] Contact email (cellarsnap@gmail.com) appears in both documents
- [ ] LAST_UPDATED is "March 2026" in both files
- [ ] No TypeScript errors
- [ ] Component structure matches existing pattern (card layout, dark theme, footer link)
- [ ] Styles use the exact color values from the existing codebase
