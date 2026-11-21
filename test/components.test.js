// test/components.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { loadComponents, parseKey, resolveRepo } = require('../lib/components')

const reg = loadComponents()

test('parseKey splits component:module:page', () => {
  assert.deepEqual(parseKey('windy-mcp:ROOT:tools.adoc'),
    { component: 'windy-mcp', module: 'ROOT', page: 'tools.adoc' })
})

test('parseKey keeps nested page paths', () => {
  assert.equal(parseKey('xpo:services:phase-1/bifrost.adoc').page, 'phase-1/bifrost.adoc')
})

test('parseKey returns null for garbage', () => {
  assert.equal(parseKey('hello'), null)
  assert.equal(parseKey(''), null)
  assert.equal(parseKey(undefined), null)
})

test('resolveRepo maps known component', () => {
  assert.deepEqual(resolveRepo(reg, 'ops'), { repo: 'tradmangh/xpo-ops', routed: true })
})

test('resolveRepo falls back for unknown component', () => {
  assert.deepEqual(resolveRepo(reg, 'nope'), { repo: 'tradmangh/xpo-docs-hub', routed: false })
})
