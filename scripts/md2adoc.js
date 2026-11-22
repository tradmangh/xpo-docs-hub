// scripts/md2adoc.js
const fs = require('node:fs')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

function runKramdoc (root, outPath, mdPath) {
  const args = ['--format=GFM', '--wrap=ventilate', '-o', outPath, mdPath]
  try {
    execFileSync('kramdoc', args, { stdio: 'inherit' })
  } catch (err) {
    if (err.code !== 'ENOENT') throw err
    const relOut = path.relative(root, outPath).replace(/\\/g, '/')
    const relMd = path.relative(root, mdPath).replace(/\\/g, '/')
    execFileSync('podman', [
      'run', '--rm', '-v', `${root}:/work`, 'xpo-kramdoc:latest',
      '--format=GFM', '--wrap=ventilate', '-o', `/work/${relOut}`, `/work/${relMd}`
    ], { stdio: 'inherit' })
  }
}

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

function buildNavTree (pages) {
  const root = { children: new Map(), pages: [] }
  for (const p of pages) {
    const parts = p.pageRel.split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i]
      if (!node.children.has(dir)) node.children.set(dir, { children: new Map(), pages: [] })
      node = node.children.get(dir)
    }
    node.pages.push(p)
  }

  function formatLabel (dir) {
    return dir.replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  function render (node, depth = 1) {
    const lines = []
    const stars = '*'.repeat(depth)
    const sortedPages = [...node.pages].sort((a, b) => a.pageRel.localeCompare(b.pageRel))
    for (const p of sortedPages) {
      lines.push(`${stars} xref:${p.pageRel}[${p.title}]`)
    }
    const sortedDirs = [...node.children.keys()].sort()
    for (const dir of sortedDirs) {
      const child = node.children.get(dir)
      const readmeIdx = child.pages.findIndex((p) => /^(index|README)\.adoc$/i.test(path.basename(p.pageRel)))
      if (readmeIdx !== -1) {
        const [hub] = child.pages.splice(readmeIdx, 1)
        lines.push(`${stars} xref:${hub.pageRel}[${formatLabel(dir)}]`)
      } else {
        lines.push(`${stars} ${formatLabel(dir)}`)
      }
      lines.push(...render(child, depth + 1))
    }
    return lines
  }

  return render(root, 1).join('\n') + '\n'
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
        if (['modules', 'plans', 'session_history', 'archive'].includes(entry.name)) continue
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
    runKramdoc(root, outPath, mdPath)
    let adoc = fs.readFileSync(outPath, 'utf8')
    adoc = rewriteLinks(adoc, mod)
    adoc = ensureVisibility(adoc, 'internal')
    fs.writeFileSync(outPath, adoc)

    if (!navByModule.has(mod)) navByModule.set(mod, [])
    navByModule.get(mod).push({ pageRel, title: extractTitle(adoc, pageRel) })
  }

  for (const [mod, pages] of navByModule.entries()) {
    const navPath = path.join(root, 'modules', mod, 'nav.adoc')
    fs.writeFileSync(navPath, buildNavTree(pages))
  }
}

if (require.main === module) {
  const target = process.argv[2] || 'docs'
  convertDir(target)
}

module.exports = { rewriteLinks, modOf, ensureVisibility, extractTitle, buildNavTree, convertDir }
