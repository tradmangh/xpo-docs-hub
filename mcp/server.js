// mcp/server.js
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const { z } = require('zod')
const { ComentarioClient } = require('../lib/comentario')

const SCHEMAS = {
  list_comments: {
    domainId: z.string().min(1),
    path: z.string().min(1),
    pendingOnly: z.boolean().optional()
  },
  reply: {
    domainId: z.string().min(1),
    path: z.string().min(1),
    parentId: z.string().min(1).optional(),
    markdown: z.string().min(1)
  },
  moderate: {
    commentId: z.string().min(1),
    approve: z.boolean()
  },
  set_sticky: {
    commentId: z.string().min(1),
    sticky: z.boolean()
  },
  set_page_readonly: {
    pageId: z.string().min(1),
    readonly: z.boolean()
  },
  list_audit: {
    domainId: z.string().min(1)
  }
}

function createTools (client) {
  return {
    async list_comments ({ domainId, path, pendingOnly }) {
      const data = await client.listComments({ domainId, path })
      if (pendingOnly && Array.isArray(data?.comments)) {
        return { ...data, comments: data.comments.filter((c) => c.isPending) }
      }
      return data
    },
    async reply ({ domainId, path, parentId, markdown }) {
      return client.reply({ domainId, path, parentId, markdown })
    },
    async moderate ({ commentId, approve }) {
      return client.moderate(commentId, approve)
    },
    async set_sticky ({ commentId, sticky }) {
      return client.setSticky(commentId, sticky)
    },
    async set_page_readonly ({ pageId, readonly }) {
      return client.setPageReadonly(pageId, readonly)
    },
    async list_audit ({ domainId }) {
      return client.listAudit(domainId)
    }
  }
}

function createMcpServer (client) {
  const server = new McpServer({ name: 'comentario-mcp', version: '0.1.0' })
  const tools = createTools(client)

  const register = (name, description, schema, fn) => {
    server.tool(name, description, schema, async (args) => {
      const result = await fn(args)
      return { content: [{ type: 'text', text: JSON.stringify(result ?? { ok: true }) }] }
    })
  }

  register('list_comments', 'List comments for a Comentario domain page', SCHEMAS.list_comments, tools.list_comments)
  register('reply', 'Post a reply comment as Docs Bot', SCHEMAS.reply, tools.reply)
  register('moderate', 'Approve or reject a comment', SCHEMAS.moderate, tools.moderate)
  register('set_sticky', 'Pin or unpin a comment', SCHEMAS.set_sticky, tools.set_sticky)
  register('set_page_readonly', 'Lock or unlock commenting on a page', SCHEMAS.set_page_readonly, tools.set_page_readonly)
  register('list_audit', 'Read the domain audit log', SCHEMAS.list_audit, tools.list_audit)

  return server
}

async function main () {
  const client = new ComentarioClient({
    baseUrl: process.env.COMENTARIO_URL,
    email: process.env.BOT_EMAIL,
    password: process.env.BOT_PASSWORD
  })
  const server = createMcpServer(client)
  const transport = new StdioServerTransport()
  await server.connect(transport)
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}

module.exports = { SCHEMAS, createTools, createMcpServer }
