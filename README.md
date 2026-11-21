# xpo-docs-hub

Multi-repo Antora documentation hub with self-hosted Comentario feedback loop.

## Structure

- `components.yml` — component-to-repo registry and feedback modes (`triage` default, `direct` opt-in)
- `antora-playbook.public.yml` / `antora-playbook.internal.yml` — public and internal Antora playbooks
- `lib/visibility-filter.js` — Antora extension filtering out non-`public` pages and downgrading xrefs to internal pages
- `scripts/leak-check.js` — post-build HTML check ensuring every public page has `<meta name="page-visibility" content="public">`
- `scripts/md2adoc.js` — Markdown-to-AsciiDoc conversion helper (`kramdoc` + `xref:` link rewriting)
- `ui/` — supplemental UI partials (`head-meta.hbs`, `footer-content.hbs`, `css/feedback.css`)
- `bridge/` — `comentario-bridge` service (webhook HMAC verification, GitHub App issue creation, status write-back)
- `mcp/` — `comentario-mcp` stdio MCP server for agent comment triage and moderation

## Tests

```bash
node --test test/components.test.js test/visibility-filter.test.js test/leak-check.test.js test/ui-partials.test.js test/feedback-route.test.js test/comentario.test.js test/md2adoc.test.js
cd bridge && node --test
cd mcp && node --test
```

Contract tests against a pinned Comentario `v3.19.0` + PostgreSQL 17 stack:

```bash
docker compose -f test/contract/compose.yml up -d
CONTRACT=1 COMENTARIO_URL=http://localhost:18080 BOT_EMAIL=... BOT_PASSWORD=... COMENTARIO_DOMAIN_ID=... node --test test/contract
```

## Coolify Deployment (VPS1)

1. **GitHub Secret (`GH_TOKEN`)**: Fine-grained read-only PAT (`xpo-docs-reader`, Contents: Read) stored as a Coolify build secret.
2. **docs**: Dockerfile build (`SITE=internal`), domain `docs.xpo.at` (internal-only) with Traefik WireGuard IP allowlist (`traefik.http.middlewares.wg-only.ipallowlist.sourcerange=<wg-subnet>`). *(Optional public build `SITE=public` is available via `antora-playbook.public.yml` if ever needed.)*
3. **comentario-db**: Dedicated PostgreSQL 17 container with persistent volume and nightly `pg_dump` backup (14-day retention).
4. **comentario**: `registry.gitlab.com/comentario/comentario:v3.19.0`, domain `comments.xpo.at`, internal hostname `comentario`, DB credentials from `comentario-db`, webhooks enabled with `--wh.allow-insecure` and `--wh.allow-private-targets`, Authentik OIDC (`oidc:authentik`), domain `docs.xpo.at`, local **Docs Bot** moderator user, webhook pointing to `http://comentario-bridge:8080/comentario`.
5. **comentario-bridge**: `bridge/Dockerfile` (context = repo root), internal hostname `comentario-bridge`, Traefik route `comments.xpo.at` `PathPrefix(/bridge/status)` stripping `/bridge` to `/status`.
6. **Split DNS**: Technitium internal zone entry for `docs.xpo.at` (and `comments.xpo.at` if internal-only, or public DNS if GitHub status write-back / external access is used).
