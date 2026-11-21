// scripts/leak-check.js
const fs = require('node:fs')
const path = require('node:path')

const SITE_PAGES = new Set(['404.html', 'index.html', 'search.html'])

function walk (dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === '_' ? [] : walk(full, base) // "_" = UI assets
    return e.name.endsWith('.html') ? [path.relative(base, full).replace(/\\/g, '/')] : []
  })
}

function findLeaks (dir) {
  return walk(dir).filter((rel) => {
    if (SITE_PAGES.has(rel)) return false
    const html = fs.readFileSync(path.join(dir, rel), 'utf8')
    return !/<meta name="page-visibility" content="public">/.test(html)
  })
}

if (require.main === module) {
  const dir = process.argv[2] || 'build/public'
  const leaks = findLeaks(dir)
  if (leaks.length) {
    console.error(`LEAK CHECK FAILED: ${leaks.length} non-public page(s):\n` + leaks.join('\n'))
    process.exit(1)
  }
  console.log('leak check ok')
}

module.exports = { findLeaks }
