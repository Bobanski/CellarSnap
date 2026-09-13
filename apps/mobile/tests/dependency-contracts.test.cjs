const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { test } = require('node:test');

const mobileRequire = createRequire(path.resolve(__dirname, '../package.json'));
const queryRequire = createRequire(mobileRequire.resolve('query-string'));
const decode = queryRequire('decode-uri-component');
const query = mobileRequire('query-string');

test('installed router decoder matches reviewed upstream source plus explicit compatibility edits', () => {
  const source = fs.readFileSync(queryRequire.resolve('decode-uri-component'), 'utf8');
  const upstream = source.replace('module.exports = function decodeUriComponent(encodedURI) {',
    'export default function decodeUriComponent(encodedURI) {').replace(/};\n$/, '}\n')
    .replace('input.replaceAll(key, replaceMap[key])', "input.replace(new RegExp(key, 'g'), replaceMap[key])");
  assert.equal(createHash('sha256').update(upstream).digest('hex'),
    '9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa');
  assert.equal(typeof decode, 'function');
  assert.equal(queryRequire.resolve('decode-uri-component'), mobileRequire.resolve('decode-uri-component'));
});

test('decoder preserves Unicode, reserved characters and tolerant malformed input', () => {
  for (const [input, expected] of [
    ['Caf%C3%A9', 'Café'], ['%F0%9F%8D%B7', '🍷'], ['%2Ffeed%3Fx%3D1%26y%3D2', '/feed?x=1&y=2'],
    ['a+b', 'a+b'], ['%25', '%'], ['%', '%'], ['%GG', '%GG'], ['%E0%A4%A', '%E0%A4%A'],
    ['%C0%AF', '%C0%AF'], ['%ED%A0%80', '%ED%A0%80'], ['%FE%FF', '\uFFFD\uFFFD'],
    ['%C2', '\uFFFD'], ['%41%FF%42', 'A%FFB'], ['%C3%A5%FF', 'å%FF'],
  ]) assert.equal(decode(input), expected, input);
  assert.throws(() => decode(null), TypeError);
  assert.throws(() => decode(42), TypeError);
});

test('query-string preserves callback tokens, fragments, duplicate parameters and round trips', () => {
  const parsed = query.parseUrl('/auth/callback?code=fake%2Bcode%2F%3D&next=%2Ffeed&tag=red&tag=white#fixture',
    { parseFragmentIdentifier: true });
  assert.equal(parsed.url, '/auth/callback');
  assert.equal(parsed.query.code, 'fake+code/=');
  assert.equal(parsed.query.next, '/feed');
  assert.deepEqual(parsed.query.tag, ['red', 'white']);
  assert.equal(parsed.fragmentIdentifier, 'fixture');
  assert.deepEqual(query.parse(query.stringify(parsed.query)), parsed.query);
  assert.equal(query.parse('q=Caf%C3%A9+wine&bad=%41%FF%42').q, 'Café wine');
  assert.equal(query.parse('bad=%41%FF%42').bad, 'A%FFB');
});

test('malformed percent-byte runs complete within a bounded child process', () => {
  // Run outside this process so reintroducing the exponential implementation
  // fails by timeout instead of wedging the entire test runner.
  const output = execFileSync(process.execPath, ['-e', `
    const assert = require('node:assert/strict');
    const query = require(${JSON.stringify(mobileRequire.resolve('query-string'))});
    const start = performance.now();
    for (const size of [256, 4096, 16384]) {
      const bad = '%FF'.repeat(size);
      assert.equal(query.parse('bad=' + bad).bad, bad);
      assert.equal(query.parse('bad=' + bad + '%41').bad, bad + 'A');
    }
    console.log(JSON.stringify({ elapsedMs: performance.now() - start }));
  `], { timeout: 5000, encoding: 'utf8' });
  assert.ok(JSON.parse(output).elapsedMs < 4000);
});

test('installed Router native URL extraction and React Navigation callback parsing compose', () => {
  const { extractExpoPathFromURL, parsePathAndParamsFromExpoGoLink } =
    mobileRequire('expo-router/build/fork/extractPathFromURL');
  const { getStateFromPath } = mobileRequire('expo-router/build/react-navigation/core/getStateFromPath');
  const options = { screens: { Callback: 'auth/callback', Reset: 'reset-password' } };
  for (const url of ['cluster://auth/callback?code=synthetic-123',
    'https://cellarsnap.app/auth/callback?code=synthetic-123']) {
    const route = getStateFromPath(extractExpoPathFromURL(['cluster://'], url), options).routes[0];
    assert.equal(route.name, 'Callback');
    assert.equal(route.params.code, 'synthetic-123');
  }
  const expoGo = parsePathAndParamsFromExpoGoLink('exp://127.0.0.1:8081/--/reset-password?type=recovery');
  assert.equal(getStateFromPath(expoGo.pathname + expoGo.queryString, options).routes[0].params.type, 'recovery');
  const bad = getStateFromPath('/auth/callback?code=%FF%41&next=%2Ffeed', options).routes[0];
  assert.equal(bad.params.code, '%FFA');
  assert.equal(bad.params.next, '/feed');
});

test('xcode resolves patched CommonJS uuid with v4 format and bounds checks', () => {
  const xcodeRequire = createRequire(mobileRequire.resolve('xcode'));
  const uuid = xcodeRequire('uuid');
  assert.equal(xcodeRequire('uuid/package.json').version, '11.1.1');
  const ids = new Set(Array.from({ length: 1000 }, () => uuid.v4()));
  assert.equal(ids.size, 1000);
  for (const id of ids) assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  for (const fn of [uuid.v3, uuid.v5]) {
    assert.throws(() => fn('fixture', uuid.v5.DNS, new Uint8Array(8), 4), RangeError);
  }
  assert.throws(() => uuid.v6({}, new Uint8Array(8), 4), RangeError);
});

test('xcode edits, serializes and reparses a real disposable PBX project', () => {
  const xcode = mobileRequire('xcode');
  const fixture = path.join(path.dirname(mobileRequire.resolve('react-native-safe-area-context/package.json')),
    'ios/RNSafeAreaContext.xcodeproj/project.pbxproj');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cellarsnap-xcode-'));
  try {
    const project = xcode.project(fixture).parseSync();
    const group = project.addPbxGroup([], 'B04dFixture', 'B04dFixture');
    assert.match(group.uuid, /^[A-F0-9]{24}$/);
    const ids = new Set(Array.from({ length: 1000 }, () => project.generateUuid()));
    assert.equal(ids.size, 1000);
    for (const id of ids) assert.match(id, /^[A-F0-9]{24}$/);
    const written = path.join(dir, 'project.pbxproj');
    fs.writeFileSync(written, project.writeSync());
    const reparsed = xcode.project(written).parseSync();
    assert.equal(reparsed.hash.project.objects.PBXGroup[group.uuid].name, 'B04dFixture');
    assert.equal(reparsed.getFirstTarget().uuid, project.getFirstTarget().uuid);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
