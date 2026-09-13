# Temporary CommonJS decoder packaging

Expo Router 56 uses query-string 7, which requires a callable CommonJS export.
Upstream decode-uri-component 0.5.0 repairs GHSA-vcc3-ghjq-m6fr but exports ESM.
This private local package contains its algorithm with the export
changed to `module.exports`, a terminating semicolon, and one compatibility fix:
`replaceAll(key, value)` replaces `replace(new RegExp(key, "g"), value)`. Keys
contain only percent/hex bytes, so literal matching preserves semantics while
avoiding the engine regex-size limit for long malformed runs (16,384 bytes). It is not a
new decoder or a published upstream release. The package version records the
upstream source version; the lockfile explicitly records the local source.

Source: https://github.com/SamVerschueren/decode-uri-component/tree/v0.5.0
Advisory: https://github.com/advisories/GHSA-vcc3-ghjq-m6fr
npm tarball integrity: `sha512-1BiQVoK8C9gUbQU6NzAtO/tkz2qOFpEObMWpcFvhx4fYnj4Oc5yzaJN/LD36ihkVUdXyh5ZekzX+yM+ty/SrPg==`
Upstream index.js SHA-256: `9401353df38f8010ad7035fe8d666bce6a4902bc1cff809afc4ab23fa2e0bdaa`
License retained in LICENSE. The dependency contract test reverses these three
explicit edits and verifies the upstream hash, then exercises the installed
query-string/Router consumers and malformed-input deadline in a child process.

Remove this local package and its override when Expo Router adopts a patched
decoder through a compatible query-string release. Do not replace it with a
bare ESM override without repeating Node, Metro/Hermes and routing QC.

The direct local dependency and `$decode-uri-component` override must stay
together: npm resolves a transitive-only relative file override from the
consumer directory, producing a broken link. `npm ci`, `npm ls`, and the
installed-consumer tests verify this packaging contract.
