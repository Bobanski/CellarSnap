#!/usr/bin/env node
/**
 * Renders the Cluster brand mark (six-sphere "grape cluster" logo, from
 * cluster-brand-guide-v4.jsx's <LogoMark />) into the app icon and splash
 * icon assets at high resolution.
 *
 * - assets/icon.png: 1024x1024, opaque Champagne (#F5EDD6) background.
 *   Apple rejects icons with an alpha channel, so this is rendered as a
 *   fully opaque page (no CSS transparency) — Playwright's screenshot of a
 *   fully-opaque page produces a PNG with no alpha channel at all.
 * - assets/splash-icon.png: 1024x1024, transparent background, sized to sit
 *   inside expo-splash-screen's `imageWidth: 180` over the app's dark
 *   splash background (#0C0810 from app.json).
 *
 * Usage: node scripts/generate-icons.js
 * Requires the `playwright` package (resolved from the repo root's
 * node_modules — no extra dependency added to apps/mobile).
 */

const path = require("path");
const { chromium } = require("playwright");

const ASSETS_DIR = path.join(__dirname, "..", "assets");
const CANVAS_SIZE = 1024;

const CHAMPAGNE = "#F5EDD6";
const GRENACHE = "#7B1D3A";
const GRENACHE_LIGHT = "#9B2449";
const GRENACHE_BRIGHT = "#B83060";
const BAROLO = "#4A0E1F";

// ─── Logo mark, lifted from cluster-brand-guide-v4.jsx (LogoMark, lines
// 920-932) — a six-sphere grape cluster with a stem and tendril, in the
// original 80x80 viewBox coordinate space. ──────────────────────────────
const LOGO_MARK_INNER = `
  <circle cx="40" cy="22" r="10" fill="${GRENACHE}" opacity="0.9"/>
  <circle cx="26" cy="34" r="10" fill="${GRENACHE_LIGHT}" opacity="0.85"/>
  <circle cx="54" cy="34" r="10" fill="${GRENACHE}" opacity="0.95"/>
  <circle cx="33" cy="48" r="10" fill="${GRENACHE_BRIGHT}" opacity="0.8"/>
  <circle cx="47" cy="48" r="10" fill="${GRENACHE_LIGHT}" opacity="0.9"/>
  <circle cx="40" cy="61" r="10" fill="${GRENACHE}" opacity="0.85"/>
  <circle cx="40" cy="10" r="3" fill="${BAROLO}"/>
  <line x1="40" y1="10" x2="40" y2="14" stroke="${BAROLO}" stroke-width="2"/>
  <path d="M40 10 Q50 5 55 8" stroke="${BAROLO}" stroke-width="1.5" fill="none" stroke-linecap="round"/>
`;

function buildHtml({ backgroundColor, markScale }) {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: ${CANVAS_SIZE}px;
        height: ${CANVAS_SIZE}px;
        background: ${backgroundColor};
      }
    </style>
  </head>
  <body>
    <svg
      width="${CANVAS_SIZE}"
      height="${CANVAS_SIZE}"
      viewBox="0 0 ${CANVAS_SIZE} ${CANVAS_SIZE}"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <g transform="translate(${CANVAS_SIZE / 2}, ${CANVAS_SIZE / 2}) scale(${markScale}) translate(-40, -40)">
        ${LOGO_MARK_INNER}
      </g>
    </svg>
  </body>
</html>`;
}

async function renderPng({ html, outPath, transparent }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: CANVAS_SIZE, height: CANVAS_SIZE },
    });
    await page.setContent(html);
    await page.screenshot({
      path: outPath,
      omitBackground: transparent,
    });
  } finally {
    await browser.close();
  }
}

async function main() {
  // App icon: opaque Champagne background, mark scaled to ~11.4x (80 * 11.4
  // ≈ 912px, leaving an ~56px margin on each side so the mark isn't
  // edge-to-edge / doesn't get clipped by iOS icon corner masking).
  const iconHtml = buildHtml({
    backgroundColor: CHAMPAGNE,
    markScale: 11.4,
  });
  await renderPng({
    html: iconHtml,
    outPath: path.join(ASSETS_DIR, "icon.png"),
    transparent: false,
  });

  // Splash icon: transparent background (composited over the app's
  // #0C0810 splash background by expo-splash-screen at imageWidth: 180),
  // mark scaled to fill most of the 1024 canvas so it stays crisp when
  // downsized for display.
  const splashHtml = buildHtml({
    backgroundColor: "transparent",
    markScale: 11.4,
  });
  await renderPng({
    html: splashHtml,
    outPath: path.join(ASSETS_DIR, "splash-icon.png"),
    transparent: true,
  });

  console.log("Generated assets/icon.png and assets/splash-icon.png");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
