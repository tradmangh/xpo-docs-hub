// lib/feedback-route.js
const { resolveRepo } = require('./components')
const VERSIONS = { current: 'main', next: 'dev' }
const KINDS = { doc: 'documentation', feature: 'enhancement', bug: 'bug' }

function pageFromPath (reg, urlPath) {
  const seg = String(urlPath).replace(/^\/+/, '').split('/').filter(Boolean)
  const component = seg.shift() || ''
  let branch = 'main'
  if (seg.length > 1 && VERSIONS[seg[0]]) branch = VERSIONS[seg.shift()]
  const file = (seg.pop() || 'index.html').replace(/\.html$/, '.adoc')
  const module = seg.length ? seg.join('/') : 'ROOT'
  return { component, branch, module, page: file, ...resolveRepo(reg, component) }
}

function modeFor (reg, component, branch) {
  const fb = reg.components[component] && reg.components[component].feedback
  return fb && fb[branch] === 'direct' ? 'direct' : 'triage'
}

function parseCommand (markdown) {
  const first = String(markdown).trim().split(/\r?\n/)[0].trim()
  let m = first.match(/^\/issue\s+(doc|feature|bug)\s*$/)
  if (m) return { cmd: 'issue', kind: m[1] }
  m = first.match(/^\/discard\s+(.+)$/)
  if (m) return { cmd: 'discard', reason: m[1].trim() }
  return null
}

function buildIssue (page, { kind, commentId, commentUrl, pageUrl, author, markdown }) {
  const src = `docs/modules/${page.module}/pages/${page.page}`
  return {
    repo: page.repo,
    labels: ['docs-feedback', KINDS[kind] ? kind : 'doc'],
    title: `[docs] ${page.component}:${page.module}:${page.page}`,
    body: [
      `**Page:** ${pageUrl}`, `**Comment:** ${commentUrl}`,
      `**Source:** \`${src}\` (branch \`${page.branch}\`)`, '',
      `> ${author}:`, ...String(markdown).split('\n').map((l) => `> ${l}`), '',
      `<!-- comentario:${commentId} -->`
    ].join('\n')
  }
}

module.exports = { pageFromPath, modeFor, parseCommand, buildIssue }
