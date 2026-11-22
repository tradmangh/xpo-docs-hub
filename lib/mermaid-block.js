// lib/mermaid-block.js
// Asciidoctor extension: render [mermaid] literal/listing blocks as <div class="mermaid">.

function escapeHtml (str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function register (registry) {
  registry.block(function () {
    const self = this
    self.named('mermaid')
    self.onContext(['literal', 'listing'])
    self.process((parent, reader) => {
      const code = escapeHtml(reader.getLines().join('\n'))
      return self.createPassBlock(parent, `<div class="mermaid">\n${code}\n</div>`)
    })
  })
}

module.exports = { register, escapeHtml }
