// bridge/server.js
const http = require('node:http')
const { createAppAuth } = require('@octokit/auth-app')
const { loadComponents } = require('../lib/components')
const { ComentarioClient } = require('../lib/comentario')
const { loadEnv } = require('./config')
const { createHandler } = require('./handler')

async function withRetry (fn, attempts = 3, baseDelayMs = 300) {
  let lastErr
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, baseDelayMs * (2 ** i)))
    }
  }
  throw lastErr
}

function createGitHubClient ({ appId, appKey, installationId, fetch = globalThis.fetch }) {
  const auth = createAppAuth({ appId, privateKey: appKey, installationId })

  async function gh (method, urlPath, body) {
    return withRetry(async () => {
      const { token } = await auth({ type: 'installation' })
      const res = await fetch(`https://api.github.com${urlPath}`, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          accept: 'application/vnd.github+json',
          'content-type': 'application/json',
          'user-agent': 'comentario-bridge'
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      })
      if (!res.ok) {
        const text = await res.text().catch(() => '')
        throw new Error(`GitHub ${method} ${urlPath} failed: ${res.status} ${text}`.trim())
      }
      return res.json()
    })
  }

  return {
    async findIssueByMarker (repo, commentId) {
      const q = encodeURIComponent(`repo:${repo} "comentario:${commentId}" in:body`)
      const data = await gh('GET', `/search/issues?q=${q}`)
      return data.items?.[0] || null
    },
    createIssue ({ repo, title, body, labels }) {
      return gh('POST', `/repos/${repo}/issues`, { title, body, labels })
    },
    getIssue (repo, number) {
      return gh('GET', `/repos/${repo}/issues/${number}`)
    },
    async listClosedDocsIssuesSinceLastRelease (repo, currentTag) {
      const releases = await gh('GET', `/repos/${repo}/releases?per_page=2`)
      const prev = releases.find((r) => r.tag_name !== currentTag)
      const since = prev?.published_at ? `&since=${encodeURIComponent(prev.published_at)}` : ''
      return gh('GET', `/repos/${repo}/issues?state=closed&labels=docs-feedback${since}`)
    }
  }
}

function start () {
  const env = loadEnv()
  const reg = loadComponents()
  const comentario = new ComentarioClient({
    baseUrl: env.comentarioUrl,
    email: env.botEmail,
    password: env.botPassword
  })
  const github = createGitHubClient({
    appId: env.appId,
    appKey: env.appKey,
    installationId: env.installationId
  })
  const handleRequest = createHandler({
    reg,
    comentario,
    github,
    webhookSecret: env.webhookSecret,
    statusSecret: env.statusSecret
  })

  const server = http.createServer(async (req, res) => {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const rawBody = Buffer.concat(chunks).toString('utf8')
    try {
      const result = await handleRequest(req.method, req.url.split('?')[0], req.headers, rawBody)
      const isText = typeof result.body === 'string'
      res.writeHead(result.status, { 'content-type': isText ? 'text/plain' : 'application/json' })
      res.end(isText ? result.body : JSON.stringify(result.body))
    } catch (err) {
      console.error(err)
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: 'internal error' }))
    }
  })

  server.listen(env.port, () => console.log(`comentario-bridge listening on :${env.port}`))
  return server
}

if (require.main === module) start()

module.exports = { createGitHubClient, withRetry, start }
