const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const mobileRoot = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));
const repoRoot = path.resolve(mobileRoot, '../..');

function readRepo(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function sha256(relativePath) {
  return createHash('sha256').update(fs.readFileSync(path.join(repoRoot, relativePath))).digest('hex');
}

test('production iOS profile is a store build on the reviewed SDK family', () => {
  assert.match(pkg.dependencies.expo, /^~57\./);
  assert.equal(pkg.dependencies['react-native'], '0.86.3');
  assert.deepEqual(eas.build.production, {
    environment: 'production',
    distribution: 'store',
    prebuildCommand: 'prebuild --template expo-template-bare-minimum@57.0.26',
  });
  assert.equal(app.ios.bundleIdentifier, 'com.cellarsnap.mobile');
  assert.equal(app.ios.usesAppleSignIn, true);
  assert.match(app.ios.buildNumber, /^\d+$/);
});

test('native plugins omit sensitive permissions the app does not use', () => {
  const plugins = new Map(app.plugins.map((plugin) => Array.isArray(plugin)
    ? [plugin[0], plugin[1]]
    : [plugin, {}]));
  assert.equal(plugins.get('expo-secure-store').faceIDPermission, false);
  assert.equal(plugins.get('expo-image-picker').microphonePermission, false);
});

test('iOS privacy manifest declares source-reviewed collection without tracking', () => {
  const manifest = app.ios.privacyManifests;
  assert.equal(manifest.NSPrivacyTracking, false);
  assert.deepEqual(manifest.NSPrivacyTrackingDomains, []);

  const collected = new Map(manifest.NSPrivacyCollectedDataTypes.map((entry) => [
    entry.NSPrivacyCollectedDataType,
    entry,
  ]));
  const expectedTypes = [
    'NSPrivacyCollectedDataTypeName',
    'NSPrivacyCollectedDataTypeEmailAddress',
    'NSPrivacyCollectedDataTypePhoneNumber',
    'NSPrivacyCollectedDataTypeUserID',
    'NSPrivacyCollectedDataTypePhotosorVideos',
    'NSPrivacyCollectedDataTypeOtherUserContent',
    'NSPrivacyCollectedDataTypeCustomerSupport',
    'NSPrivacyCollectedDataTypeProductInteraction',
    'NSPrivacyCollectedDataTypeOtherDiagnosticData',
  ];
  assert.deepEqual([...collected.keys()].sort(), [...expectedTypes].sort());

  for (const type of expectedTypes) {
    const entry = collected.get(type);
    assert.ok(entry, `${type} must be declared`);
    assert.equal(entry.NSPrivacyCollectedDataTypeLinked, true);
    assert.equal(entry.NSPrivacyCollectedDataTypeTracking, false);
    const expectedPurposes = ['NSPrivacyCollectedDataTypePurposeAppFunctionality'];
    if ([
      'NSPrivacyCollectedDataTypePhotosorVideos',
      'NSPrivacyCollectedDataTypeOtherUserContent',
      'NSPrivacyCollectedDataTypeProductInteraction',
    ].includes(type)) {
      expectedPurposes.push('NSPrivacyCollectedDataTypePurposeProductPersonalization');
    }
    assert.deepEqual(
      [...entry.NSPrivacyCollectedDataTypePurposes].sort(),
      expectedPurposes.sort());
  }
});

test('app manifest aggregates required-reason APIs used by installed native packages', () => {
  const accessed = new Map(app.ios.privacyManifests.NSPrivacyAccessedAPITypes.map((entry) => [
    entry.NSPrivacyAccessedAPIType,
    new Set(entry.NSPrivacyAccessedAPITypeReasons),
  ]));
  const expected = {
    NSPrivacyAccessedAPICategoryFileTimestamp: ['0A2A.1', '3B52.1', 'C617.1'],
    NSPrivacyAccessedAPICategorySystemBootTime: ['35F9.1'],
    NSPrivacyAccessedAPICategoryDiskSpace: ['85F4.1', 'E174.1'],
    NSPrivacyAccessedAPICategoryUserDefaults: ['CA92.1'],
  };
  assert.deepEqual([...accessed.keys()].sort(), Object.keys(expected).sort());
  for (const [category, reasons] of Object.entries(expected)) {
    assert.deepEqual(accessed.get(category), new Set(reasons));
  }
});

test('release artwork is the reproducible Cluster brand candidate', () => {
  assert.equal(sha256('apps/mobile/assets/icon.png'),
    '9439cb8bd13a8da024280fe76ec841ad0ada91781d2126ada7bf0e33e8f462d0');
  assert.equal(sha256('apps/mobile/assets/splash-icon.png'),
    '4f8f0abaeaae798c1037090ad5246f90e8e3099d4537e0d03fee29e197767598');
  const generator = readRepo('apps/mobile/scripts/generate-icons.js');
  assert.match(generator, /const CHAMPAGNE = "#F5EDD6"/);
  assert.match(generator, /transparent: false/);
});

test('release legal copy uses the Cluster identity and company support channel', () => {
  const terms = readRepo('packages/shared/src/termsPolicy.ts');
  const privacy = readRepo('packages/shared/src/privacyPolicy.ts');
  const topBar = readRepo('apps/mobile/src/components/AppTopBar.tsx');
  assert.doesNotMatch(terms, /CellarSnap|friends-and-family/i);
  assert.match(terms, /Cluster Wine, LLC/);
  assert.match(terms, /support@clusterwine\.app/);
  assert.doesNotMatch(privacy, /cellarsnap@gmail\.com/i);
  assert.match(privacy, /support@clusterwine\.app/);
  assert.match(topBar, /Linking\.openURL\("https:\/\/clusterwine\.app\/support"\)/);
});

test('every native picker upload path re-encodes images before transmission', () => {
  const sanitizer = readRepo('apps/mobile/src/lib/entryFlow/sanitizePickedImage.ts');
  assert.match(sanitizer, /manipulateAsync/);
  assert.match(sanitizer, /format: SaveFormat\.JPEG/);
  for (const relativePath of [
    'apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx',
    'apps/mobile/app/(app)/entries/[id].tsx',
    'apps/mobile/app/(app)/profile/index.tsx',
    'apps/mobile/src/screens/listScan/ListScanIntakeScreen.tsx',
    'apps/mobile/src/lib/api/collections.ts',
  ]) {
    assert.match(readRepo(relativePath), /sanitizePickedImage/, relativePath);
  }
  const listScan = readRepo('apps/mobile/src/screens/listScan/ListScanIntakeScreen.tsx');
  assert.match(listScan, /selectionLimit: remainingSlots/);
  assert.match(listScan, /result\.assets\.slice\(0, remainingSlots\)/);
  for (const relativePath of [
    'apps/mobile/src/screens/entries/NewEntryScreenContainer.tsx',
    'apps/mobile/src/screens/listScan/ListScanIntakeScreen.tsx',
  ]) {
    assert.doesNotMatch(
      readRepo(relativePath),
      /Promise\.all\([\s\S]{0,240}sanitizePickedImage/,
      `${relativePath} must not decode several full-resolution photos concurrently`,
    );
  }
});
