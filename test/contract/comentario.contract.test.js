// test/contract/comentario.contract.test.js
// Run with: CONTRACT=1 node --test test/contract
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ComentarioClient } = require('../../lib/comentario')

const runContract = process.env.CONTRACT === '1'

test('comentario contract against pinned v3.19.0 container', { skip: !runContract }, async () => {
  const baseUrl = process.env.COMENTARIO_URL || 'http://localhost:18080'
  const email = process.env.BOT_EMAIL
  const password = process.env.BOT_PASSWORD
  const domainId = process.env.COMENTARIO_DOMAIN_ID
  const pagePath = process.env.COMENTARIO_TEST_PATH || '/comp-a/index.html'
  assert.ok(email && password && domainId, 'BOT_EMAIL, BOT_PASSWORD, and COMENTARIO_DOMAIN_ID must be set')

  const client = new ComentarioClient({ baseUrl, email, password, domainId })
  const list = await client.listComments({ path: pagePath })
  assert.ok(list && typeof list === 'object')

  const created = await client.reply({ path: pagePath, markdown: 'contract test comment' })
  assert.ok(created.id)
  const fetched = await client.getComment(created.id)
  assert.equal(fetched.id, created.id)
  await client.moderate(created.id, true)
  await client.setSticky(created.id, false)
  const audit = await client.listAudit(domainId)
  assert.ok(audit)
})
