// lib/components.js
const fs = require('node:fs')
const path = require('node:path')
const yaml = require('js-yaml')

function loadComponents (file = path.join(__dirname, '..', 'components.yml')) {
  return yaml.load(fs.readFileSync(file, 'utf8'))
}

function parseKey (key) {
  if (typeof key !== 'string') return null
  const m = key.trim().match(/^([a-z0-9-]+):([A-Za-z0-9_-]+):(.+\.adoc)$/)
  return m ? { component: m[1], module: m[2], page: m[3] } : null
}

function resolveRepo (registry, component) {
  const entry = registry.components[component]
  return entry ? { repo: entry.repo, routed: true } : { repo: registry.fallbackRepo, routed: false }
}

module.exports = { loadComponents, parseKey, resolveRepo }
