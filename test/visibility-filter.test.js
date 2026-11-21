// test/visibility-filter.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const { visibilityOf, stripUnresolvedXrefs, pruneNav } = require('../lib/visibility-filter')

test('visibilityOf reads header attribute', () => {
  assert.equal(visibilityOf('= Title\n:page-visibility: public\n\nBody'), 'public')
})

test('visibilityOf defaults to internal', () => {
  assert.equal(visibilityOf('= Title\n\nBody'), 'internal')
})

test('visibilityOf ignores attribute after header (body text)', () => {
  assert.equal(visibilityOf('= Title\n\nSome text\n:page-visibility: public\n'), 'internal')
})

test('visibilityOf treats unknown values as internal', () => {
  assert.equal(visibilityOf('= T\n:page-visibility: yes\n'), 'internal')
})

test('stripUnresolvedXrefs keeps link text only', () => {
  const html = '<p>See <a href="#secret.adoc" class="xref unresolved">Secret page</a>.</p>'
  assert.equal(stripUnresolvedXrefs(html), '<p>See Secret page.</p>')
})

test('stripUnresolvedXrefs leaves resolved xrefs alone', () => {
  const html = '<a href="ok.html" class="xref page">OK</a>'
  assert.equal(stripUnresolvedXrefs(html), html)
})

test('pruneNav drops items pointing to unpublished pages', () => {
  const nav = [{ content: 'Root', items: [
    { content: 'Pub', url: '/c/pub.html', urlType: 'internal' },
    { content: 'Hidden', url: '/c/hidden.html', urlType: 'internal' },
    { content: 'Ext', url: 'https://x', urlType: 'external' },
    { content: 'Group', items: [{ content: 'Hidden2', url: '/c/h2.html', urlType: 'internal' }] }
  ] }]
  const pruned = pruneNav(nav, new Set(['/c/pub.html']))
  assert.deepEqual(pruned[0].items.map((i) => i.content), ['Pub', 'Ext'])
})
