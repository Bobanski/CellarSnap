const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createRequire } = require('node:module');
const { setTimeout: delay } = require('node:timers/promises');
const config = require('../metro.config');
const { getDefaultConfig } = require('expo/metro-config');
const { default: createFileMap } = require('metro/private/node-haste/DependencyGraph/createFileMap');
const rootRequire = createRequire(path.resolve(__dirname, '../../..', 'package.json'));
const repo = path.resolve(__dirname, '../../..');

function blocked(file) {
  return config.resolver.blockList.some((pattern) => pattern.test(file));
}

test('Metro preserves SDK exclusions and shared sources while excluding path-bounded agent checkouts', () => {
  const defaults = getDefaultConfig(path.resolve(__dirname, '..')).resolver.blockList;
  for (const pattern of defaults) assert.ok(config.resolver.blockList.some(p => p.source === pattern.source));
  for (const file of ['/repo/.claude/worktrees/a/src/app.tsx', 'C:\\repo\\.claude\\worktrees\\a\\app.tsx',
    '/repo/.claude', '/repo/.claude/worktrees/a/node_modules/react/package.json']) assert.equal(blocked(file), true, file);
  for (const file of ['/repo/packages/shared/src/index.ts', '/repo/apps/mobile/vendor/decode-uri-component/index.cjs',
    '/repo/node_modules/react/index.js', '/repo/.claude-notes/app.tsx', '/repo/src/claude.ts']) assert.equal(blocked(file), false, file);
  assert.ok(config.watchFolders.includes(repo));
  assert.ok(config.resolver.nodeModulesPaths.includes(path.join(repo, 'node_modules')));
});

test('real Metro file map excludes nested trees and ignores their changes while watching shared source', { timeout: 15000 }, async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cellarsnap-metro-'));
  const visible = path.join(root, 'packages/shared/src/fixture.ts');
  const hidden = path.join(root, '.claude/worktrees/fixture/src/fixture.ts');
  for (const file of [visible, hidden]) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, 'export const value = 1;\n');
  }
  fs.mkdirSync(path.join(root, 'cache'));
  const { fileMap } = createFileMap({ ...config, projectRoot: root, watchFolders: [root],
    maxWorkers: 1, resetCache: true, fileMapCacheDirectory: path.join(root, 'cache'),
    resolver: { ...config.resolver, useWatchman: false },
  }, { watch: true });
  const events = [];
  fileMap.on('change', event => {
    for (const kind of ['addedFiles', 'modifiedFiles', 'removedFiles']) {
      for (const [filePath] of event.changes[kind]) events.push(path.resolve(event.rootDir, filePath));
    }
  });
  try {
    const result = await fileMap.build();
    assert.equal(result.fileSystem.exists(visible), true);
    assert.equal(result.fileSystem.exists(hidden), false);
    fs.writeFileSync(hidden, 'export const value = 222;\n');
    const newHidden = path.join(path.dirname(hidden), 'added.ts');
    fs.writeFileSync(newHidden, 'export const another = 333;\n');
    fs.writeFileSync(visible, 'export const value = 444;\n');
    const deadline = Date.now() + 8000;
    while (!events.includes(visible) && Date.now() < deadline) await delay(50);
    assert.ok(events.includes(visible), 'shared source change must arrive');
    // Allow another aggregation cycle to expose unexpected hidden changes.
    await delay(400);
    assert.equal(events.some(file => file.includes('.claude')), false);
    assert.equal(result.fileSystem.exists(newHidden), false);
  } finally {
    await fileMap.end();
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Tailwind source discovery excludes checkout utilities but includes real source utilities', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cellarsnap-tailwind-'));
  const stylesheet = fs.readFileSync(path.join(repo, 'src/app/globals.css'), 'utf8');
  const sourceExclusion = stylesheet.match(/^@source not "([^"]+)";/m)?.[1];
  assert.ok(sourceExclusion, 'explicit exclusion must survive regardless of gitignore behavior');
  const cssDir = path.join(root, 'src/app');
  fs.mkdirSync(cssDir, { recursive: true });
  const hiddenDir = path.join(root, '.claude/worktrees/fixture/src');
  fs.mkdirSync(hiddenDir, { recursive: true });
  fs.writeFileSync(path.join(cssDir, 'fixture.tsx'), '<div className="z-[8711]" />');
  fs.writeFileSync(path.join(hiddenDir, 'fixture.tsx'), '<div className="z-[9822]" />');
  try {
    const { compile } = rootRequire('@tailwindcss/node');
    const { Scanner } = rootRequire('@tailwindcss/oxide');
    const compiled = await compile('@tailwind utilities;\n@source not "' + sourceExclusion + '";',
      { base: cssDir, onDependency() {} });
    const scanner = new Scanner({ sources: [{ base: root, pattern: '**/*', negated: false }, ...compiled.sources] });
    const candidates = scanner.scan();
    assert.ok(candidates.includes('z-[8711]'));
    assert.equal(candidates.includes('z-[9822]'), false);
    assert.equal(scanner.files.some(file => file.includes('.claude')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
