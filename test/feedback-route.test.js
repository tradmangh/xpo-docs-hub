// test/feedback-route.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pageFromPath, modeFor, parseCommand, buildIssue } = require('../lib/feedback-route')
const reg = {
  fallbackRepo: 'tradmangh/xpo-docs-hub',
  components: {
    xpo: { repo: 'tradmangh/at-xpo-x', private: true, feedback: { main: 'triage', dev: 'direct' } },
    'windy-mcp': { repo: 'tradmangh/at-xpo-windy-mcpserver', private: false }
  }
}

test('pageFromPath: versioned component, named module', () => {
  assert.deepEqual(pageFromPath(reg, '/xpo/next/services/bifrost.html'),
    { component: 'xpo', branch: 'dev', module: 'services', page: 'bifrost.adoc', repo: 'tradmangh/at-xpo-x', routed: true })
})

test('pageFromPath: versionless component, ROOT module', () => {
  const p = pageFromPath(reg, '/windy-mcp/tools.html')
  assert.equal(p.module, 'ROOT'); assert.equal(p.branch, 'main'); assert.equal(p.page, 'tools.adoc')
})

test('pageFromPath: unknown component goes to the fallback repo', () => {
  assert.deepEqual(pageFromPath(reg, '/nope/x.html').repo, 'tradmangh/xpo-docs-hub')
  assert.equal(pageFromPath(reg, '/nope/x.html').routed, false)
})

test('modeFor: triage by default, direct only when configured', () => {
  assert.equal(modeFor(reg, 'xpo', 'main'), 'triage')
  assert.equal(modeFor(reg, 'xpo', 'dev'), 'direct')
  assert.equal(modeFor(reg, 'windy-mcp', 'main'), 'triage')
  assert.equal(modeFor(reg, 'nope', 'dev'), 'triage')
})

test('parseCommand', () => {
  assert.deepEqual(parseCommand('/issue doc'), { cmd: 'issue', kind: 'doc' })
  assert.deepEqual(parseCommand('  /issue bug\nmore text'), { cmd: 'issue', kind: 'bug' })
  assert.deepEqual(parseCommand('/discard duplicate of #3'), { cmd: 'discard', reason: 'duplicate of #3' })
  assert.equal(parseCommand('/issue weird'), null)
  assert.equal(parseCommand('/discard'), null) // a reason is required
  assert.equal(parseCommand('just a reply'), null)
})

test('buildIssue carries a stable marker for idempotency', () => {
  const page = pageFromPath(reg, '/xpo/next/services/bifrost.html')
  const r = buildIssue(page, { kind: 'bug', commentId: 'c-1', commentUrl: 'https://docs-int.x/c', pageUrl: 'https://docs-int.x/p', author: 'bob', markdown: 'broken' })
  assert.equal(r.repo, 'tradmangh/at-xpo-x')
  assert.deepEqual(r.labels, ['docs-feedback', 'bug'])
  assert.match(r.body, /<!-- comentario:c-1 -->/)
  assert.match(r.body, /docs\/modules\/services\/pages\/bifrost\.adoc/)
  assert.match(r.body, /branch `dev`/)
})
