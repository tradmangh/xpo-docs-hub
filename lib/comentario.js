// lib/comentario.js
// Thin client for Comentario REST API (pinned against v3.19.0 swagger).

class ComentarioClient {
  constructor ({ baseUrl, email, password, domainId, fetch = globalThis.fetch } = {}) {
    if (!baseUrl) throw new Error('baseUrl is required')
    this.baseUrl = String(baseUrl).replace(/\/+$/, '')
    this.email = email
    this.password = password
    this.domainId = domainId
    this.fetch = fetch
    this.sessions = new Map()
  }

  async login (domainId = this.domainId) {
    const res = await this.fetch(`${this.baseUrl}/api/embed/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.email, password: this.password, domainId })
    })
    if (!res.ok) throw new Error(`Comentario login failed: ${res.status}`)
    let token = res.headers?.get?.('x-user-session') || res.headers?.get?.('X-User-Session')
    const text = await res.text()
    const data = text ? JSON.parse(text) : {}
    if (!token) token = data.sessionToken || data.token
    if (!token) throw new Error('Comentario login did not return a session token')
    this.sessions.set(domainId || '_', token)
    return token
  }

  async call (method, apiPath, body, { domainId = this.domainId } = {}) {
    const key = domainId || '_'
    let token = this.sessions.get(key)
    if (!token) token = await this.login(domainId)

    const send = (tok) => this.fetch(`${this.baseUrl}/api${apiPath}`, {
      method,
      headers: {
        'content-type': 'application/json',
        'X-User-Session': tok
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })

    let res = await send(token)
    if (res.status === 401) {
      token = await this.login(domainId)
      res = await send(token)
    }
    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`Comentario ${method} ${apiPath} failed: ${res.status} ${errText}`.trim())
    }
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  getComment (id) {
    return this.call('GET', `/comments/${encodeURIComponent(id)}`)
  }

  listComments ({ domainId = this.domainId, path, host } = {}) {
    return this.call('POST', '/embed/comments', { domainId, path, host }, { domainId })
  }

  reply ({ domainId = this.domainId, path, parentId, markdown }) {
    return this.call('PUT', '/embed/comments', {
      domainId,
      path,
      parentId,
      markdown,
      unregistered: false
    }, { domainId })
  }

  moderate (id, approve) {
    return this.call('POST', `/embed/comments/${encodeURIComponent(id)}/moderate`, { approve: Boolean(approve) })
  }

  setSticky (id, sticky) {
    return this.call('POST', `/embed/comments/${encodeURIComponent(id)}/sticky`, { sticky: Boolean(sticky) })
  }

  setPageReadonly (pageId, isReadonly) {
    return this.call('PUT', `/embed/page/${encodeURIComponent(pageId)}`, { isReadonly: Boolean(isReadonly) })
  }

  listAudit (domainId = this.domainId) {
    return this.call('GET', `/domains/${encodeURIComponent(domainId)}/audit`, undefined, { domainId })
  }
}

module.exports = { ComentarioClient }
