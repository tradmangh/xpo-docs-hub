// test/md2adoc.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { rewriteLinks, ensureVisibility } = require('../scripts/md2adoc')

test('relative .md link -> xref with module', () => {
  assert.equal(rewriteLinks('see link:../adr/001-secrets.adoc[ADR 1]', 'architecture'), 'see xref:adr:001-secrets.adoc[ADR 1]')
  assert.equal(rewriteLinks('link:overview.adoc[Ov]', 'architecture'), 'xref:overview.adoc[Ov]')
  assert.equal(rewriteLinks('link:https://x.y/a.adoc[ext]', 'architecture'), 'link:https://x.y/a.adoc[ext]')
})

test('ensureVisibility inserts internal attribute after title', () => {
  assert.equal(ensureVisibility('= Title\n\nBody'), '= Title\n:page-visibility: internal\n\nBody')
  assert.equal(ensureVisibility('= Title\n:page-visibility: public\n\nBody'), '= Title\n:page-visibility: public\n\nBody')
})
