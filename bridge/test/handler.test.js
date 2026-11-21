// bridge/test/handler.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { createHandler } = require('../handler')

const reg = {
  fallbackRepo: 'tradmangh/xpo-docs-hub',
  components: {
    xpo: { repo: 'tradmangh/at-xpo-x', private: true, feedback: { main: 'triage', dev: 'direct' } },
    'windy-mcp': { repo: 'tradmangh/at-xpo-windy-mcpserver', private: false }
  }
}

const WEBHOOK_SECRET = '00112233445566778899aabbccddeeff'
const STATUS_SECRET = 'status-secret-test'
const NOW = 1700000000

function signWebhook (rawBody, ts = String(NOW), secret = WEBHOOK_SECRET) {
  return 'sha256=' + crypto.createHmac('sha256', Buffer.from(secret, 'hex')).update(`${ts}.${rawBody}`).digest('hex')
}

function signStatus (rawBody, secret = STATUS_SECRET) {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
}

function makePayload ({ eventId = 'ev-1', pagePath = '/xpo/next/services/bifrost.html', commentId = 'c-1', parentId = null } = {}) {
  return JSON.stringify({
    specVersion: '1.0',
    eventId,
    eventType: 'comment.created',
    domain: { id: 'dom-1', host: 'docs-int.xpo.at' },
    data: {
      comment: { id: commentId, parentId, pageId: 'p-1' },
      page: { id: 'p-1', domainId: 'dom-1', path: pagePath }
    }
  })
}

function makeDeps ({ comments = [], commenters = [], existingIssue = null, issueByNumber = {} } = {}) {
  const replies = []
  const createdIssues = []
  let nextNum = 42

  const comentario = {
    async getComment (id) {
      const c = comments.find((x) => x.id === id)
      if (!c) throw new Error(`missing comment ${id}`)
      return c
    },
    async listComments () {
      return { comments, commenters }
    },
    async reply (arg) {
      replies.push(arg)
      return { id: 'reply-' + replies.length }
    }
  }

  const github = {
    async findIssueByMarker () {
      return existingIssue
    },
    async createIssue (payload) {
      const num = nextNum++
      const issue = { number: num, html_url: `https://github.com/${payload.repo}/issues/${num}`, ...payload }
      createdIssues.push(issue)
      return issue
    },
    async getIssue (repo, num) {
      return issueByNumber[num]
    },
    async listClosedDocsIssuesSinceLastRelease () {
      return Object.values(issueByNumber)
    }
  }

  const handler = createHandler({
    reg,
    comentario,
    github,
    webhookSecret: WEBHOOK_SECRET,
    statusSecret: STATUS_SECRET,
    now: () => NOW
  })

  return { handler, replies, createdIssues }
}

test('1. bad signature -> 401, no API calls', async () => {
  const { handler, replies, createdIssues } = makeDeps()
  const body = makePayload()
  const res = await handler('POST', '/comentario', {
    'x-comentario-signature': 'sha256=deadbeef',
    'x-comentario-timestamp': String(NOW),
    'x-comentario-event-id': 'ev-1'
  }, body)
  assert.equal(res.status, 401)
  assert.equal(replies.length, 0)
  assert.equal(createdIssues.length, 0)
})

test('2. duplicate event ID -> 200, processed once', async () => {
  const { handler, createdIssues } = makeDeps({
    comments: [{ id: 'c-1', userCreated: 'u-1', markdown: 'broken' }],
    commenters: [{ id: 'u-1', name: 'Alice', isModerator: false }]
  })
  const body = makePayload({ eventId: 'ev-dup' })
  const headers = {
    'x-comentario-signature': signWebhook(body),
    'x-comentario-timestamp': String(NOW),
    'x-comentario-event-id': 'ev-dup'
  }
  const r1 = await handler('POST', '/comentario', headers, body)
  const r2 = await handler('POST', '/comentario', headers, body)
  assert.equal(r1.status, 200)
  assert.equal(r2.status, 200)
  assert.equal(r2.body.duplicate, true)
  assert.equal(createdIssues.length, 1)
})

test('3. root comment on xpo next page (direct) -> private ref reply', async () => {
  const { handler, replies, createdIssues } = makeDeps({
    comments: [{ id: 'c-1', userCreated: 'u-1', markdown: 'typo here' }],
    commenters: [{ id: 'u-1', name: 'Alice', isModerator: false }]
  })
  const body = makePayload({ pagePath: '/xpo/next/services/bifrost.html' })
  const res = await handler('POST', '/comentario', {
    'x-comentario-signature': signWebhook(body),
    'x-comentario-timestamp': String(NOW)
  }, body)
  assert.equal(res.status, 200)
  assert.equal(createdIssues.length, 1)
  assert.equal(createdIssues[0].repo, 'tradmangh/at-xpo-x')
  assert.equal(replies.length, 1)
  assert.match(replies[0].markdown, /Tracked internally \(ref #42\)/)
})

test('4. root comment on triage page -> no issue, no reply', async () => {
  const { handler, replies, createdIssues } = makeDeps({
    comments: [{ id: 'c-1', userCreated: 'u-1', markdown: 'hi' }],
    commenters: [{ id: 'u-1', name: 'Alice', isModerator: false }]
  })
  const body = makePayload({ pagePath: '/windy-mcp/tools.html' })
  const res = await handler('POST', '/comentario', {
    'x-comentario-signature': signWebhook(body),
    'x-comentario-timestamp': String(NOW)
  }, body)
  assert.equal(res.status, 200)
  assert.equal(createdIssues.length, 0)
  assert.equal(replies.length, 0)
})

test('5. /issue bug from moderator -> issue built from parent comment with label bug', async () => {
  const { handler, replies, createdIssues } = makeDeps({
    comments: [
      { id: 'c-root', userCreated: 'u-1', markdown: 'original bug report' },
      { id: 'c-cmd', parentId: 'c-root', userCreated: 'u-mod', markdown: '/issue bug' }
    ],
    commenters: [
      { id: 'u-1', name: 'Alice', isModerator: false },
      { id: 'u-mod', name: 'Mod', isModerator: true }
    ]
  })
  const body = makePayload({ pagePath: '/windy-mcp/tools.html', commentId: 'c-cmd', parentId: 'c-root' })
  const res = await handler('POST', '/comentario', {
    'x-comentario-signature': signWebhook(body),
    'x-comentario-timestamp': String(NOW)
  }, body)
  assert.equal(res.status, 200)
  assert.equal(createdIssues.length, 1)
  assert.equal(createdIssues[0].repo, 'tradmangh/at-xpo-windy-mcpserver')
  assert.deepEqual(createdIssues[0].labels, ['docs-feedback', 'bug'])
  assert.match(createdIssues[0].body, /original bug report/)
  assert.match(createdIssues[0].body, /<!-- comentario:c-root -->/)
  assert.match(replies[0].markdown, /Triaged → Tracked as https:\/\/github\.com\/tradmangh\/at-xpo-windy-mcpserver\/issues\/42/)
})

test('6. /issue bug from non-moderator -> ignored', async () => {
  const { handler, replies, createdIssues } = makeDeps({
    comments: [
      { id: 'c-root', userCreated: 'u-1', markdown: 'hello' },
      { id: 'c-cmd', parentId: 'c-root', userCreated: 'u-1', markdown: '/issue bug' }
    ],
    commenters: [{ id: 'u-1', name: 'Alice', isModerator: false }]
  })
  const body = makePayload({ pagePath: '/windy-mcp/tools.html', commentId: 'c-cmd', parentId: 'c-root' })
  const res = await handler('POST', '/comentario', {
    'x-comentario-signature': signWebhook(body),
    'x-comentario-timestamp': String(NOW)
  }, body)
  assert.equal(res.status, 200)
  assert.equal(createdIssues.length, 0)
  assert.equal(replies.length, 0)
})

test('7. /discard dup from moderator -> reply Discarded: dup, no issue', async () => {
  const { handler, replies, createdIssues } = makeDeps({
    comments: [
      { id: 'c-root', userCreated: 'u-1', markdown: 'hello' },
      { id: 'c-cmd', parentId: 'c-root', userCreated: 'u-mod', markdown: '/discard dup' }
    ],
    commenters: [{ id: 'u-mod', name: 'Mod', isModerator: true }]
  })
  const body = makePayload({ pagePath: '/windy-mcp/tools.html', commentId: 'c-cmd', parentId: 'c-root' })
  const res = await handler('POST', '/comentario', {
    'x-comentario-signature': signWebhook(body),
    'x-comentario-timestamp': String(NOW)
  }, body)
  assert.equal(res.status, 200)
  assert.equal(createdIssues.length, 0)
  assert.equal(replies.length, 1)
  assert.equal(replies[0].markdown, 'Discarded: dup')
})

test('8. existing marker found -> no second issue', async () => {
  const { handler, replies, createdIssues } = makeDeps({
    comments: [{ id: 'c-1', userCreated: 'u-1', markdown: 'typo' }],
    commenters: [{ id: 'u-1', name: 'Alice', isModerator: false }],
    existingIssue: { number: 99, html_url: 'https://github.com/tradmangh/at-xpo-x/issues/99' }
  })
  const body = makePayload({ pagePath: '/xpo/next/services/bifrost.html' })
  const res = await handler('POST', '/comentario', {
    'x-comentario-signature': signWebhook(body),
    'x-comentario-timestamp': String(NOW)
  }, body)
  assert.equal(res.status, 200)
  assert.equal(createdIssues.length, 0)
  assert.match(replies[0].markdown, /ref #99/)
})

test('9. /status fixed -> reply on original comment', async () => {
  const { handler, replies } = makeDeps({
    comments: [{ id: 'c-1', domainId: 'dom-1', pagePath: '/windy-mcp/tools.html' }],
    issueByNumber: {
      130: { number: 130, body: 'Some text\n<!-- comentario:c-1 -->' }
    }
  })
  const body = JSON.stringify({ repo: 'tradmangh/at-xpo-windy-mcpserver', issue: 130, event: 'fixed' })
  const res = await handler('POST', '/status', { 'x-signature': signStatus(body) }, body)
  assert.equal(res.status, 200)
  assert.equal(replies.length, 1)
  assert.equal(replies[0].parentId, 'c-1')
  assert.equal(replies[0].markdown, 'Fixed in tradmangh/at-xpo-windy-mcpserver#130')
})

test('10. /status shipped -> replies on closed docs-feedback issues since last release', async () => {
  const { handler, replies } = makeDeps({
    comments: [{ id: 'c-1', domainId: 'dom-1', pagePath: '/windy-mcp/tools.html' }],
    issueByNumber: {
      130: { number: 130, body: '<!-- comentario:c-1 -->' }
    }
  })
  const body = JSON.stringify({ repo: 'tradmangh/at-xpo-windy-mcpserver', event: 'shipped', release: 'v1.4.0' })
  const res = await handler('POST', '/status', { 'x-signature': signStatus(body) }, body)
  assert.equal(res.status, 200)
  assert.equal(replies.length, 1)
  assert.equal(replies[0].markdown, 'Live in v1.4.0')
})
