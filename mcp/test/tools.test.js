// mcp/test/tools.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { z } = require('zod')
const { SCHEMAS, createTools } = require('../server')

function makeFakeClient () {
  const calls = []
  const rec = (name, ret) => async (...args) => {
    calls.push({ name, args })
    return ret
  }
  return {
    calls,
    client: {
      listComments: rec('listComments', {
        comments: [
          { id: 'c-1', isPending: false },
          { id: 'c-2', isPending: true }
        ]
      }),
      reply: rec('reply', { id: 'c-3' }),
      moderate: rec('moderate', null),
      setSticky: rec('setSticky', null),
      setPageReadonly: rec('setPageReadonly', null),
      listAudit: rec('listAudit', { events: [{ id: 'a-1' }] })
    }
  }
}

test('input schemas validate required fields and reject invalid input', () => {
  assert.ok(z.object(SCHEMAS.list_comments).safeParse({ domainId: 'd1', path: '/p.html' }).success)
  assert.equal(z.object(SCHEMAS.list_comments).safeParse({ domainId: '', path: '/p.html' }).success, false)

  assert.ok(z.object(SCHEMAS.reply).safeParse({ domainId: 'd1', path: '/p.html', markdown: 'hi' }).success)
  assert.equal(z.object(SCHEMAS.reply).safeParse({ domainId: 'd1', path: '/p.html' }).success, false)

  assert.ok(z.object(SCHEMAS.moderate).safeParse({ commentId: 'c1', approve: true }).success)
  assert.equal(z.object(SCHEMAS.moderate).safeParse({ commentId: 'c1', approve: 'yes' }).success, false)

  assert.ok(z.object(SCHEMAS.set_sticky).safeParse({ commentId: 'c1', sticky: false }).success)
  assert.ok(z.object(SCHEMAS.set_page_readonly).safeParse({ pageId: 'p1', readonly: true }).success)
  assert.ok(z.object(SCHEMAS.list_audit).safeParse({ domainId: 'd1' }).success)
})

test('list_comments filters pendingOnly when requested', async () => {
  const { client, calls } = makeFakeClient()
  const tools = createTools(client)
  const all = await tools.list_comments({ domainId: 'd1', path: '/p.html' })
  assert.equal(all.comments.length, 2)

  const pending = await tools.list_comments({ domainId: 'd1', path: '/p.html', pendingOnly: true })
  assert.deepEqual(pending.comments.map((c) => c.id), ['c-2'])
  assert.equal(calls[0].name, 'listComments')
})

test('reply, moderate, set_sticky, set_page_readonly, list_audit delegate to client', async () => {
  const { client, calls } = makeFakeClient()
  const tools = createTools(client)
  await tools.reply({ domainId: 'd1', path: '/p.html', parentId: 'c-1', markdown: 'ok' })
  await tools.moderate({ commentId: 'c-1', approve: true })
  await tools.set_sticky({ commentId: 'c-1', sticky: true })
  await tools.set_page_readonly({ pageId: 'p-1', readonly: true })
  await tools.list_audit({ domainId: 'd1' })

  assert.deepEqual(calls.map((c) => c.name), ['reply', 'moderate', 'setSticky', 'setPageReadonly', 'listAudit'])
  assert.deepEqual(calls[0].args[0], { domainId: 'd1', path: '/p.html', parentId: 'c-1', markdown: 'ok' })
  assert.deepEqual(calls[1].args, ['c-1', true])
  assert.deepEqual(calls[2].args, ['c-1', true])
  assert.deepEqual(calls[3].args, ['p-1', true])
  assert.deepEqual(calls[4].args, ['d1'])
})
