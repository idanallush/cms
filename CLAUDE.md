# Client CMS

## Architecture

Node.js/Express backend with MongoDB (Mongoose) storage. Vanilla JS frontend (no bundler, IIFEs with `window.CMS` / `window.DASH` namespaces). Deployed to Vercel serverless.

**Flow**: ingest URL → Cheerio parses HTML → frozen template + slot detection → content map → editor UI → publish to Vercel.

### Backend structure
- `src/server.js` — Express app, middleware, route mounting
- `src/controllers/sites.js` — all site CRUD, content, SEO, styles, pages, preview/render
- `src/services/aiChat.js` — AI chat via OpenRouter API
- `src/services/publisher.js` — Vercel deploy integration
- `src/services/ingest.js` — HTML parsing, slot detection, template freezing
- `src/storage/index.js` — storage adapter proxy (MongoDB or filesystem)
- `src/storage/mongoStore.js` — MongoDB implementation
- `src/storage/fileStore.js` — filesystem fallback
- `src/middleware/auth.js` — owner auth (admin password) + per-site client auth

### Frontend modules (editor)
Scripts load in order via `<script>` tags in `editor.html`:
1. `cms-utils.js` — shared utilities (showToast, apiFetch, escapeHtml, sanitizeHtml, formatDate)
2. `editor-core.js` — state, refs, fn namespace, DOM setup, load functions, init
3. `editor-slots.js` — iframe injection, slot selection, style sliders, image upload
4. `editor-panels.js` — content panel, sections panel, search
5. `editor-seo.js` — SEO panel with live preview
6. `editor-publish.js` — save, publish, version history
7. `editor-chat.js` — AI chat panel

### Frontend modules (dashboard)
Scripts load in order via `<script>` tags in `dashboard.html`:
1. `cms-utils.js` — shared utilities
2. `dashboard-core.js` — DASH namespace, modal infrastructure, settings, site cards
3. `dashboard-config.js` — AI/Vercel/DB config modals
4. `dashboard-sites.js` — site manage modal (general/client/publishing/history tabs)
5. `dashboard-ingest.js` — ingest form handler

### Cross-module communication
- Editor: `window.CMS = { state, refs, fn, utils }` — modules read/write shared state
- Dashboard: `window.DASH = { API, refs, fn, settingsCache, selectedProvider }` + `window.CMS.utils`

### Key conventions
- All API routes prefixed with `/api/sites`
- Content stored as `contentMap` (slotId → { type, tag, value })
- Styles stored as `stylesMap` (slotId → { property: value })
- Pages use `pageId` with one `isIndex: true` page per site
- Versions are snapshots of contentMap, stored in separate Version collection

## Development

```bash
npm start          # starts on port 3500
```

Requires `MONGODB_URI` env var for MongoDB (falls back to filesystem). Optional: `ADMIN_PASSWORD`, `OPENROUTER_API_KEY`.

## Skill routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
