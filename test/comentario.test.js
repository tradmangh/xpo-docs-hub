// test/comentario.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ComentarioClient } = require('../lib/comentario')

function makeMockFetch (handlers) {
  const calls = []
  const fetch = async (url, init = {}) => {
    calls.push({ url, method: init.method || 'GET', headers: init.headers || {}, body: init.body ? JSON.parse(init.body) : undefined })
    const h = handlers.shift()
    if (!h) throw new Error(`Unexpected fetch call: ${init.method} ${url}`)
    const headers = new Map(Object.entries(h.headers || {}))
    return {
      ok: h.status >= 200 && h.status < 300,
      status: h.status,
      headers: { get: (k) => headers.get(k) || headers.get(k.toLowerCase()) || null },
      text: async () => (h.body === undefined ? '' : JSON.stringify(h.body))
    }
  }
  return { fetch, calls }
}

test('logs in lazily and sends X-User-Session', async () => {
  const { fetch, calls } = makeMockFetch([
    { status: 200, headers: { 'x-user-session': 'sess-1' }, body: {} },
    { status: 200, body: { id: 'c-1', markdown: 'hi' } }
  ])
  const client = new ComentarioClient({
    baseUrl: 'http://comentario:8080/',
    email: 'bot@xpo.at',
    password: 'pw',
    domainId: 'dom-1',
    fetch
  })
  const c = await client.getComment('c-1')
  assert.equal(c.id, 'c-1')
  assert.equal(calls.length, 2)
  assert.equal(calls[0].url, 'http://comentario:8080/api/embed/auth/login')
  assert.deepEqual(calls[0].body, { email: 'bot@xpo.at', password: 'pw', domainId: 'dom-1' })
  assert.equal(calls[1].url, 'http://comentario:8080/api/comments/c-1')
  assert.equal(calls[1].headers['X-User-Session'], 'sess-1')
})

test('retries exactly once after 401 with fresh login', async () => {
  const { fetch, calls } = makeMockFetch([
    { status: 200, headers: { 'x-user-session': 'sess-1' }, body: {} },
    { status: 401, body: { message: 'expired' } },
    { status: 200, headers: { 'x-user-session': 'sess-2' }, body: {} },
    { status: 200, body: { comments: [] } }
  ])
  const client = new ComentarioClient({ baseUrl: 'http://c:8080', email: 'b', password: 'p', domainId: 'd', fetch })
  const res = await client.listComments({ path: '/xpo/index.html' })
  assert.deepEqual(res, { comments: [] })
  assert.equal(calls.length, 4)
  assert.equal(calls[3].headers['X-User-Session'], 'sess-2')
})

test('does not loop infinitely on persistent 401', async () => {
  const { fetch, calls } = makeMockFetch([
    { status: 200, headers: { 'x-user-session': 's1' }, body: {} },
    { status: 401 },
    { status: 200, headers: { 'x-user-session': 's2' }, body: {} },
    { status: 401 }
  ])
  const client = new ComentarioClient({ baseUrl: 'http://c:8080', email: 'b', password: 'p', domainId: 'd', fetch })
  await assert.rejects(() => client.moderate('c-1', true), /401/)
  assert.equal(calls.length, 4)
})

test('exposes reply, moderate, setSticky, setPageReadonly, listAudit', async () => {
  const { fetch, calls } = makeMockFetch([
    { status: 200, headers: { 'x-user-session': 's1' }, body: {} },
    { status: 200, body: { id: 'c-2' } },
    { status: 204 },
    { status: 204 },
    { status: 204 },
    { status: 200, body: { events: [] } }
  ])
  const client = new ComentarioClient({ baseUrl: 'http://c:8080', email: 'b', password: 'p', domainId: 'd', fetch })
  await client.reply({ path: '/p.html', parentId: 'c-1', markdown: 'Tracked' })
  await client.moderate('c-1', true)
  await client.setSticky('c-1', true)
  await client.setPageReadonly('page-1', true)
  await client.listAudit('d')

  assert.equal(calls[1].method, 'PUT')
  assert.equal(calls[1].url, 'http://c:8080/api/embed/comments')
  assert.deepEqual(calls[1].body, { domainId: 'd', path: '/p.html', parentId: 'c-1', markdown: 'Tracked', unregistered: false })
  assert.equal(calls[2].url, 'http://c:8080/api/embed/comments/c-1/moderate')
  assert.deepEqual(calls[2].body, { approve: true })
  assert.equal(calls[3].url, 'http://c:8080/api/embed/comments/c-1/sticky')
  assert.deepEqual(calls[3].body, { sticky: true })
  assert.equal(calls[4].method, 'PUT')
  assert.equal(calls[4].url, 'http://c:8080/api/embed/page/page-1')
  assert.deepEqual(calls[4].body, { isReadonly: true })
  assert.equal(calls[5].method, 'GET')
  assert.equal(calls[5].url, 'http://c:8080/api/domains/d/audit')
})
