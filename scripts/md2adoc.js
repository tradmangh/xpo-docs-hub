// scripts/md2adoc.js
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const MODULES = { ADRs: 'adr' }
const modOf = (f) => MODULES[f] || f.toLowerCase()

function rewriteLinks (text, current) {
  return text.replace(/link:(?!https?:)(?:\.\.\/)?(?:([A-Za-z0-9-]+)\/)?([^\[\s]+\.adoc)\[/g, (_, folder, file) => {
    const m = folder ? modOf(folder) : current
    return `xref:${m === current ? '' : m + ':'}${file}[`
  })
}

function ensureVisibility (adoc, visibility = 'internal') {
  const lines = adoc.split(/\r?\n/)
  const hasAttr = lines.some((l) => /^:page-visibility:/.test(l))
  if (hasAttr) return adoc
  const titleIdx = lines.findIndex((l) => /^=\s+/.test(l))
  if (titleIdx === -1) return `:page-visibility: ${visibility}\n\n${adoc}`
  lines.splice(titleIdx + 1, 0, `:page-visibility: ${visibility}`)
  return lines.join('\n')
}

function extractTitle (adoc, fallback) {
  const m = adoc.match(/^=\s+(.+)$/m)
  return m ? m[1].trim() : fallback
}

function convertDir (docsRoot) {
  const root = path.resolve(docsRoot)
  const mdFiles = []
  function walk (dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name === 'modules' || entry.name === 'plans') continue
        walk(full)
      } else if (entry.name.endsWith('.md')) {
        mdFiles.push(full)
      }
    }
  }
  walk(root)

  const navByModule = new Map()
  for (const mdPath of mdFiles) {
    const rel = path.relative(root, mdPath).replace(/\\/g, '/')
    const parts = rel.split('/')
    const folder = parts.length > 1 ? parts[0] : 'ROOT'
    const mod = folder === 'ROOT' ? 'ROOT' : modOf(folder)
    const pageRel = (parts.length > 1 ? parts.slice(1).join('/') : parts[0]).replace(/\.md$/, '.adoc')
    const outPath = path.join(root, 'modules', mod, 'pages', pageRel)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    execFileSync('kramdoc', ['--format=GFM', '--wrap=ventilate', '-o', outPath, mdPath], { stdio: 'inherit' })
    let adoc = fs.readFileSync(outPath, 'utf8')
    adoc = rewriteLinks(adoc, mod)
    adoc = ensureVisibility(adoc, 'internal')
    fs.writeFileSync(outPath, adoc)

    if (!navByModule.has(mod)) navByModule.set(mod, [])
    navByModule.get(mod).push({ pageRel, title: extractTitle(adoc, pageRel) })
  }

  for (const [mod, pages] of navByModule.entries()) {
    pages.sort((a, b) => a.pageRel.localeCompare(b.pageRel))
    const navPath = path.join(root, 'modules', mod, 'nav.adoc')
    const navContent = pages.map((p) => `* xref:${p.pageRel}[${p.title}]`).join('\n') + '\n'
    fs.writeFileSync(navPath, navContent)
  }
}

if (require.main === module) {
  const target = process.argv[2] || 'docs'
  convertDir(target)
}

module.exports = { rewriteLinks, modOf, ensureVisibility, extractTitle, convertDir }
