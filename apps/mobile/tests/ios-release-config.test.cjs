const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');

const mobileRoot = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'app.json'), 'utf8')).expo;
const eas = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'eas.json'), 'utf8'));
const pkg = JSON.parse(fs.readFileSync(path.join(mobileRoot, 'package.json'), 'utf8'));

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
