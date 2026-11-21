// test/leak-check.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { findLeaks } = require('../scripts/leak-check')

function site (pages) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'leak-'))
  for (const [rel, html] of Object.entries(pages)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), html)
  }
  return dir
}
const meta = (v) => `<html><head><meta name="page-visibility" content="${v}"></head></html>`

test('no leaks when all pages are public', () => {
  assert.deepEqual(findLeaks(site({ 'a/index.html': meta('public') })), [])
})

test('flags internal pages', () => {
  assert.deepEqual(findLeaks(site({ 'a/x.html': meta('internal') })), ['a/x.html'])
})

test('flags pages without meta', () => {
  assert.deepEqual(findLeaks(site({ 'a/y.html': '<html></html>' })), ['a/y.html'])
})

test('ignores site-level pages', () => {
  assert.deepEqual(findLeaks(site({ '404.html': '<html></html>', 'index.html': '<meta http-equiv="refresh">' })), [])
})
