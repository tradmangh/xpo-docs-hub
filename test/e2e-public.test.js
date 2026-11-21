// test/e2e-public.test.js
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')

const generateSite = require('@antora/site-generator')

test('public build keeps only public pages', { timeout: 120000 }, async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hub-e2e-'))
  fs.cpSync(path.join(__dirname, 'fixtures'), tmp, { recursive: true })
  const comp = path.join(tmp, 'comp-a')
  const git = (...a) => execFileSync('git', a, { cwd: comp })
  git('init', '-q'); git('add', '-A')
  git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-qm', 'fixture')
  const playbook = path.join(tmp, 'playbook.public.yml')
  fs.writeFileSync(playbook, fs.readFileSync(playbook, 'utf8')
    .replace('../../lib/visibility-filter.js', path.join(__dirname, '..', 'lib', 'visibility-filter.js').replace(/\\/g, '/'))
    .replace('../../build/fixture-public', path.join(tmp, 'out').replace(/\\/g, '/')))
  await generateSite(['--playbook', playbook])

  const out = path.join(tmp, 'out', 'comp-a')
  assert.ok(fs.existsSync(path.join(out, 'index.html')))
  assert.ok(!fs.existsSync(path.join(out, 'secret.html')))
  assert.ok(!fs.existsSync(path.join(out, 'default.html')))
  const index = fs.readFileSync(path.join(out, 'index.html'), 'utf8')
  assert.match(index, /the secret page/)
  assert.doesNotMatch(index, /href="[^"]*secret/)
  assert.doesNotMatch(index, /No Attribute/) // navigation pruned
})
