import { defineConfig } from "@playwright/test";
import base from "./playwright.config.mjs";

process.env.CELLARSNAP_RATE_LIMIT_BACKEND = "memory";

// These suites use pure code, request mocks, or isolated PostgreSQL fixtures.
// Explicitly exclude browser/production journeys and never start a web server.
export default defineConfig({
  ...base,
  webServer: undefined,
  retries: 0,
  testMatch: [
    "phase6-primitives.spec.ts",
    "phase6-route-handlers.spec.ts",
    "phase5-parity.spec.ts",
    "ws1-algorithm-core.spec.ts",
    "ws1-algorithm-api.spec.ts",
    "ws2-entry-normalization.spec.ts",
    "ws3-list-scan.spec.ts",
    "ws3-algorithm-ui.spec.ts",
    "ws3-pocket-sommelier.spec.ts",
    "post-save-survey-bulk.spec.ts",
    "notes-nlp.spec.ts",
    "database-security.spec.ts",
    "entry-access-policy.spec.ts",
    "photo-group-access.spec.ts",
    "storage-access.spec.ts",
    "knowledge-access.spec.ts",
    "auth-privacy.spec.ts",
    "remote-menu.spec.ts",
    "audit-regressions.spec.ts",
  ],
});
