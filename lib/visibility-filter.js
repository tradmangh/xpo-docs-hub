// lib/visibility-filter.js
// Antora extension: keep only pages that declare `:page-visibility: public`.
// Enable it in the public playbook only.

function visibilityOf (source) {
  const lines = String(source).split(/\r?\n/)
  for (const line of lines.slice(1)) { // line 0 = document title
    if (line.trim() === '') break      // the header ends at the first blank line
    const m = line.match(/^:page-visibility:\s*(\S+)\s*$/)
    if (m) return m[1] === 'public' ? 'public' : 'internal'
  }
  return 'internal'
}

function stripUnresolvedXrefs (html) {
  return html.replace(/<a href="[^"]*" class="xref unresolved">([\s\S]*?)<\/a>/g, '$1')
}

function pruneNav (items, publishedUrls) {
  return items.reduce((acc, item) => {
    const copy = { ...item }
    if (copy.items) copy.items = pruneNav(copy.items, publishedUrls)
    const deadLink = copy.urlType === 'internal' && !publishedUrls.has(copy.url)
    const emptyGroup = !copy.url && copy.items && copy.items.length === 0
    if (!deadLink && !emptyGroup) acc.push(copy)
    return acc
  }, [])
}

function register () {
  const logger = this.getLogger('visibility-filter')
  const removed = []

  this.on('contentClassified', ({ contentCatalog }) => {
    for (const page of contentCatalog.getPages()) {
      if (visibilityOf(page.contents.toString()) !== 'public') {
        removed.push(page.src.path)
        contentCatalog.removeFile(page)
      }
    }
    logger.info(`removed ${removed.length} non-public pages`)
  })

  this.on('navigationBuilt', ({ contentCatalog, navigationCatalog }) => {
    const urls = new Set(contentCatalog.getPages((p) => p.pub).map((p) => p.pub.url))
    for (const { name, version } of contentCatalog.getComponents().flatMap((c) => c.versions)) {
      const nav = navigationCatalog.getNavigation(name, version)
      if (nav) nav.splice(0, nav.length, ...pruneNav(nav, urls))
    }
  })

  this.on('documentsConverted', ({ contentCatalog }) => {
    for (const page of contentCatalog.getPages((p) => p.out)) {
      const html = page.contents.toString()
      const cleaned = stripUnresolvedXrefs(html)
      if (cleaned !== html) {
        logger.warn(`downgraded xrefs to internal pages in ${page.src.path}`)
        page.contents = Buffer.from(cleaned)
      }
    }
  })
}

module.exports = { register, visibilityOf, stripUnresolvedXrefs, pruneNav }
