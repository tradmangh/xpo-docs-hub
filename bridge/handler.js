// bridge/handler.js
const crypto = require('node:crypto')
const { pageFromPath, modeFor, parseCommand, buildIssue } = require('../lib/feedback-route')
const { WEBHOOK_HEADERS, STATUS_HEADER, MAX_WEBHOOK_AGE_SEC, LRU_CAPACITY } = require('./config')

function safeEqual (a, b) {
  const ba = Buffer.from(String(a || ''))
  const bb = Buffer.from(String(b || ''))
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb)
}

function verifyComentarioSignature (rawBody, headers, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (!secret) return false
  const sig = headers[WEBHOOK_HEADERS.signature]
  const ts = headers[WEBHOOK_HEADERS.timestamp]
  if (!sig || !ts) return false
  const tsNum = Number(ts)
  if (!Number.isFinite(tsNum) || Math.abs(nowSec - tsNum) > MAX_WEBHOOK_AGE_SEC) return false
  const expected = 'sha256=' + crypto
    .createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(`${ts}.${rawBody}`)
    .digest('hex')
  return safeEqual(sig, expected)
}

function verifyStatusSignature (rawBody, headers, secret) {
  if (!secret) return false
  const sig = headers[STATUS_HEADER]
  if (!sig) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(sig, expected)
}

function extractMarker (body) {
  const m = String(body || '').match(/<!--\s*comentario:([^\s>]+)\s*-->/)
  return m ? m[1] : null
}

function isRepoPrivate (reg, component) {
  const entry = reg.components[component]
  return entry ? Boolean(entry.private) : true
}

function formatIssueRef (reg, component, issue) {
  return isRepoPrivate(reg, component)
    ? `Tracked internally (ref #${issue.number})`
    : `Tracked as ${issue.html_url || `#${issue.number}`}`
}

function createHandler ({ reg, comentario, github, webhookSecret, statusSecret, now = () => Math.floor(Date.now() / 1000) }) {
  const seenEvents = new Set()

  function markSeen (eventId) {
    if (!eventId) return false
    if (seenEvents.has(eventId)) return true
    if (seenEvents.size >= LRU_CAPACITY) {
      const oldest = seenEvents.values().next().value
      seenEvents.delete(oldest)
    }
    seenEvents.add(eventId)
    return false
  }

  async function ensureIssue (repo, commentId, issuePayload) {
    const existing = await github.findIssueByMarker(repo, commentId)
    if (existing) return existing
    return github.createIssue(issuePayload)
  }

  async function handleComentario (rawBody, headers) {
    if (!verifyComentarioSignature(rawBody, headers, webhookSecret, now())) {
      return { status: 401, body: { error: 'invalid signature' } }
    }
    const payload = JSON.parse(rawBody)
    const eventId = headers[WEBHOOK_HEADERS.eventId] || payload.eventId
    if (markSeen(eventId)) {
      return { status: 200, body: { ok: true, duplicate: true } }
    }
    const eventType = headers[WEBHOOK_HEADERS.eventType] || payload.eventType
    if (eventType !== 'comment.created') {
      return { status: 200, body: { ok: true, ignored: eventType } }
    }

    const domainId = payload.domain?.id || payload.data?.page?.domainId
    const pagePath = payload.data?.page?.path
    const commentId = payload.data?.comment?.id
    if (!domainId || !pagePath || !commentId) {
      return { status: 400, body: { error: 'missing domainId, page.path, or comment.id' } }
    }

    // Re-read comment and thread from Comentario API; never trust webhook payload text.
    const comment = await comentario.getComment(commentId)
    const thread = await comentario.listComments({ domainId, path: pagePath })
    const commenters = new Map((thread.commenters || []).map((c) => [c.id, c]))
    const commentsById = new Map((thread.comments || []).map((c) => [c.id, c]))
    const page = pageFromPath(reg, pagePath)
    const pageUrl = payload.domain?.host ? `https://${payload.domain.host}${pagePath}` : pagePath

    if (!comment.parentId) {
      if (modeFor(reg, page.component, page.branch) !== 'direct') {
        return { status: 200, body: { ok: true, mode: 'triage' } }
      }
      const author = commenters.get(comment.userCreated)?.name || comment.authorName || 'reader'
      const issue = await ensureIssue(page.repo, comment.id, buildIssue(page, {
        kind: 'doc',
        commentId: comment.id,
        commentUrl: comment.url || pageUrl,
        pageUrl,
        author,
        markdown: comment.markdown
      }))
      await comentario.reply({
        domainId,
        path: pagePath,
        parentId: comment.id,
        markdown: formatIssueRef(reg, page.component, issue)
      })
      return { status: 200, body: { ok: true, issue: issue.number } }
    }

    // Reply: check for moderator/owner command.
    const cmd = parseCommand(comment.markdown)
    if (!cmd) return { status: 200, body: { ok: true } }

    const actor = commenters.get(comment.userCreated)
    if (!actor || (!actor.isModerator && !actor.isOwner)) {
      return { status: 200, body: { ok: true, ignored: 'not-moderator' } }
    }

    if (cmd.cmd === 'discard') {
      await comentario.reply({
        domainId,
        path: pagePath,
        parentId: comment.parentId,
        markdown: `Discarded: ${cmd.reason}`
      })
      return { status: 200, body: { ok: true, discarded: true } }
    }

    if (cmd.cmd === 'issue') {
      const parent = commentsById.get(comment.parentId) || await comentario.getComment(comment.parentId)
      const parentAuthor = commenters.get(parent.userCreated)?.name || parent.authorName || 'reader'
      const issue = await ensureIssue(page.repo, parent.id, buildIssue(page, {
        kind: cmd.kind,
        commentId: parent.id,
        commentUrl: parent.url || pageUrl,
        pageUrl,
        author: parentAuthor,
        markdown: parent.markdown
      }))
      await comentario.reply({
        domainId,
        path: pagePath,
        parentId: parent.id,
        markdown: `Triaged → ${formatIssueRef(reg, page.component, issue)}`
      })
      return { status: 200, body: { ok: true, issue: issue.number } }
    }

    return { status: 200, body: { ok: true } }
  }

  async function replyForIssue (issueObj, message) {
    const commentId = extractMarker(issueObj.body)
    if (!commentId) return false
    const comment = await comentario.getComment(commentId)
    await comentario.reply({
      domainId: comment.domainId,
      path: comment.pagePath,
      parentId: comment.id,
      markdown: message
    })
    return true
  }

  async function handleStatus (rawBody, headers) {
    if (!verifyStatusSignature(rawBody, headers, statusSecret)) {
      return { status: 401, body: { error: 'invalid signature' } }
    }
    const { repo, issue, event, release } = JSON.parse(rawBody)
    if (event === 'fixed' && issue) {
      const issueObj = await github.getIssue(repo, issue)
      const replied = await replyForIssue(issueObj, `Fixed in ${repo}#${issue}`)
      return { status: 200, body: { ok: true, replied } }
    }
    if (event === 'shipped' && release) {
      const issues = await github.listClosedDocsIssuesSinceLastRelease(repo, release)
      let count = 0
      for (const item of issues) {
        if (await replyForIssue(item, `Live in ${release}`)) count++
      }
      return { status: 200, body: { ok: true, notified: count } }
    }
    return { status: 400, body: { error: 'unsupported status event' } }
  }

  return async function handleRequest (method, urlPath, headers, rawBody) {
    const lowerHeaders = Object.fromEntries(
      Object.entries(headers || {}).map(([k, v]) => [k.toLowerCase(), v])
    )
    if (method === 'GET' && urlPath === '/healthz') {
      return { status: 200, body: 'ok' }
    }
    if (method === 'POST' && urlPath === '/comentario') {
      return handleComentario(rawBody, lowerHeaders)
    }
    if (method === 'POST' && urlPath === '/status') {
      return handleStatus(rawBody, lowerHeaders)
    }
    return { status: 404, body: { error: 'not found' } }
  }
}

module.exports = {
  createHandler,
  verifyComentarioSignature,
  verifyStatusSignature,
  extractMarker
}
