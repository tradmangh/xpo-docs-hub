// test/ui-partials.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');

test('head-meta emits page-visibility meta', () => {
  const src = fs.readFileSync('ui/partials/head-meta.hbs', 'utf8');
  assert.match(src, /name="page-visibility"/);
  assert.match(src, /page\.attributes\.visibility/);
});

test('footer partial embeds Comentario', () => {
  const src = fs.readFileSync('ui/partials/footer-content.hbs', 'utf8');
  assert.match(src, /site\.keys\.(comentarioUrl|comentario_url).*\/comentario\.js/);
  assert.match(src, /<comentario-comments/);
  assert.doesNotMatch(src, /giscus|relay/);
});
