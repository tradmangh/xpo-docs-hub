// test/mermaid-block.test.js
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { escapeHtml, register } = require('../lib/mermaid-block')

test('escapeHtml preserves mermaid arrows via HTML entities', () => {
  assert.equal(escapeHtml('A --> B & C <--> D'), 'A --&gt; B &amp; C &lt;--&gt; D')
})

test('register hooks mermaid block for literal and listing contexts', () => {
  let blockName, contexts, handler
  const fakeRegistry = {
    block (fn) {
      const dsl = {
        named: (n) => { blockName = n },
        onContext: (c) => { contexts = c },
        process: (h) => { handler = h },
        createPassBlock: (parent, html) => ({ parent, html })
      }
      fn.call(dsl)
    }
  }
  register(fakeRegistry)
  assert.equal(blockName, 'mermaid')
  assert.deepEqual(contexts, ['literal', 'listing'])
  const out = handler({}, { getLines: () => ['flowchart TD', '  A --> B'] })
  assert.match(out.html, /^<div class="mermaid">\nflowchart TD\n  A --&gt; B\n<\/div>$/)
})
