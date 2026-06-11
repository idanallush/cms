# Architecture Health Audit — Client CMS

**Date:** 2026-06-11
**Auditor:** Claude Code (automated full-codebase scan)
**Scope:** Every source file in the project (20 backend files, 8 frontend files, config files)

---

## Executive Summary

| Dimension | Score | Key Issue |
|---|---|---|
| 1. Error Handling | 4/10 | Silent catches, raw error leaks, no retry logic |
| 2. Data Fetching | 5/10 | N+1 queries in listAllSites and publisher |
| 3. Type Safety | 3/10 | Zero input validation on most endpoints |
| 4. Component Structure | 4/10 | editor.js is 2165 lines, sites controller is 756 lines |
| 5. Database Queries | 5/10 | No version pruning, full document loads, fragile version lookup |
| 6. State Management | 4/10 | Unbounded undo stack, interval leaks, global state |
| 7. API / Security | 3/10 | Plain-text owner password, open CORS, stored XSS, no CSP |
| 8. Middleware & Auth | 5/10 | Cookie/JWT expiry mismatch, timing-unsafe comparison, fail-open catch |
| 9. Code Organization | 6/10 | Good layer separation, but God files and dead code |
| 10. Performance | 5/10 | getComputedStyle loops, N iframe previews, no debounce on search |

**Overall: 4.4/10** — Functional but has critical security gaps and accumulating tech debt.

---

## Dimension 1: Error Handling (4/10)

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| ERR-1 | HIGH | `controllers/sites.js` | 23-36 | `ingestUrl`/`ingestHtml` calls have no try/catch; raw errors propagate to client |
| ERR-2 | MEDIUM | `middleware/errorHandler.js` | 10-12 | `err.message` returned to client unconditionally (leaks internal paths, DB strings) |
| ERR-3 | MEDIUM | `routes/editor.js` | 54 | `try { ... } catch {}` — completely empty catch swallows all errors silently |
| ERR-4 | MEDIUM | `server.js` | 91-93 | Storage init failure only logged; server starts broken, all requests will fail |
| ERR-5 | MEDIUM | `services/ingest.js` | 432-441 | `axios.get(url)` with no try/catch; raw AxiosError propagates |
| ERR-6 | LOW | `services/publisher.js` | 93-109 | Per-page error in publish loop kills entire deployment; no per-page isolation |
| ERR-7 | LOW | `storage/fileStore.js` | 82-95 | `listAllSites` — one corrupt JSON file kills the entire list |
| ERR-8 | LOW | `storage/mongoStore.js` | 151-173 | Version ID date parsing is fragile regex with no error handling |
| F-EH-01 | MEDIUM | `public/js/editor.js` | 213-219 | `loadMeta()` has no try/catch; failure leaves UI in "Loading..." state forever |
| F-EH-02 | MEDIUM | `public/js/editor.js` | 248-252 | `loadContent()` has no try/catch; contentMap stays empty on failure |
| F-EH-03 | HIGH | `public/js/editor.js` | 2086 | Rollback fetch doesn't check `res.ok`; treats HTTP errors as success |
| F-EH-04 | LOW | `public/js/editor.js` | 1831 | `loadPublishStatus` has silent empty `catch {}` |
| F-EH-06 | HIGH | `public/js/editor.js` | 2075-2078 | Version "Preview" buttons ignore the version ID; always open latest preview |
| F-EH-07 | LOW | `public/js/dashboard.js` | 823-831 | `saveClientName()` has empty `catch {}`; failure is completely silent |
| F-EH-08 | LOW | `public/js/dashboard.js` | 629-643 | Vercel settings save has no `res.ok` check |
| F-EH-10 | LOW | `public/js/dashboard.js` | 290-330 | Settings load failure silent; badges show "--" forever |

---

## Dimension 2: Data Fetching Patterns (5/10)

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| PERF-1 | HIGH | `storage/mongoStore.js` | 181-215 | N+1 query: `listAllSites` runs separate `Version.countDocuments` per site |
| PERF-2 | MEDIUM | `storage/fileStore.js` | 82-95 | N+1 sequential reads: `getMeta` + `listVersions` per site in a loop |
| PERF-3 | MEDIUM | `services/publisher.js` | 93-109 | N+1 page fetches in publish: `store.getPage()` per page in loop |
| PERF-4 | LOW | `controllers/sites.js` | 104-157 | `updateContent`: 3-4 sequential DB calls per request (`siteExists` + `getPageContent` + `savePageContent` + `updateMeta`) |
| PERF-5 | LOW | `storage/mongoStore.js` | 177 | `siteExists` uses `countDocuments` instead of `exists()` (scans vs. stops at first) |
| PERF-6 | LOW | `storage/mongoStore.js` | 323-347 | `getPages`/`getPage`/`getIndexPage` load full site document including frozenTemplate (MB+ of HTML) |
| F-EH-05 | LOW | `public/js/editor.js` | 1716-1780 | Save handler: partial failure (content OK, styles fail) has unclear UX |

---

## Dimension 3: Type Safety (3/10)

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| SEC-9 | MEDIUM | `routes/auth.js` | 34-57 | `siteId` from `req.body` passed directly to store with no UUID format validation |
| SEC-10 | MEDIUM | `storage/fileStore.js` | 7-9 | `siteId` in `path.join` — potential path traversal if siteId contains `../` |
| OTHER-2 | LOW | `controllers/sites.js` | 740-755 | Settings values (API keys, domain, name) have no length or format validation |
| OTHER-3 | LOW | `controllers/sites.js` | 348 | Site name has no sanitization or length cap |
| OTHER-4 | LOW | `controllers/sites.js` | 620-621 | `ogImage` and `canonicalUrl` accept arbitrary strings (no URL validation) |
| SEC-6 | MEDIUM | `controllers/sites.js` | 456-468 | `pageTitle` interpolated into HTML template without escaping |

**Note:** Zero endpoints validate input format, length, or type beyond existence checks. Every `req.body` field is trusted as-is.

---

## Dimension 4: Component Structure (4/10)

### Files over 400 lines

| File | Lines | Issue |
|---|---|---|
| `public/js/editor.js` | 2,165 | Single IIFE, no modules, all concerns mixed |
| `public/css/editor.css` | 1,999 | Large but acceptable for single-page CSS |
| `public/css/dashboard.css` | 1,328 | Large but acceptable |
| `public/js/dashboard.js` | 908 | Single IIFE, all dashboard logic |
| `src/controllers/sites.js` | 756 | God controller: content, versions, SEO, styles, pages, settings |
| `src/services/ingest.js` | 639 | Mixes scraping, template freezing, slot detection, content parsing |
| `src/storage/mongoStore.js` | 426 | Borderline; schema + all operations |

### Dead / Unused Code

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| DEAD-1 | MEDIUM | `controllers/sites.js` | 183-251 | `preview` and `render` are identical functions |
| DEAD-2 | LOW | `services/aiChat.js` | 3 | `ANTHROPIC_URL` constant never used |
| DEAD-3 | LOW | `storage/mongoStore.js` | 78-80 | `ensureSiteDir` is a no-op |
| DEAD-4 | LOW | `storage/mongoStore.js` | 359-369 | `updatePage` exported but never called |
| DEAD-5 | LOW | `storage/mongoStore.js` | 398-401 | `getPageTemplate` exported but never called |
| DEAD-6 | LOW | `services/aiChat.js` | 6-12 | `provider` variable set but never used |
| F-DEAD-01 | LOW | `public/css/editor.css` | 185-200 | `mode-label` CSS rules never referenced |
| F-DEAD-02 | LOW | `public/dashboard.html` | 111-116 | Dead `#config-section` HTML block |
| F-DEAD-04 | LOW | `public/js/dashboard.js` | 385 | `pageCount` hardcoded to 1, never reflects actual count |
| F-DEAD-05 | LOW | `public/js/editor.js` | 2075-2079 | Version preview buttons nonfunctional |

### Duplicated Code

| Finding | Files |
|---|---|
| `escapeHtml` — two different implementations | `editor.js:1462`, `dashboard.js:44` |
| `formatDate` — function vs inline, same logic | `editor.js:2105`, `dashboard.js:777` |
| `preview`/`render` — identical controller functions | `controllers/sites.js:183-251` |

---

## Dimension 5: Database Queries (5/10)

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| DB-1 | HIGH | `storage/mongoStore.js` | 130 | No version cap or TTL: `Version` collection grows unbounded forever |
| DB-2 | HIGH | `storage/mongoStore.js` | 151-173 | `getVersion` uses fragile timestamp-to-Date regex; sub-second collisions return wrong version |
| DB-3 | MEDIUM | `storage/mongoStore.js` | 323-347 | All page queries load full site document (no projection) |
| DB-4 | MEDIUM | `storage/mongoStore.js` | 326 | `migrateSiteToPages` called on every page read (should be one-time batch) |
| DB-5 | LOW | Schema | — | `contentMap` and `frozenTemplate` are `Schema.Types.Mixed` — no structural validation |
| DB-6 | LOW | Schema | — | Legacy root fields (`frozenTemplate`, `contentMap`, `slotCount`) carried on every site document |

**Indexes:** `siteId` is properly indexed (unique). Version compound index `{ siteId: 1, createdAt: -1 }` is correct. No missing indexes detected.

**16MB limit risk:** A site with a 500KB template and 300 slots with richtext values could approach 2-5MB per document. Multi-page sites multiply this. Not an immediate risk but worth monitoring.

---

## Dimension 6: State Management — Frontend (4/10)

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| F-SM-01 | LOW | `editor.js` | 1851-1860 | `placeholderInterval` leaks if chat is open during page reload |
| F-SM-02 | LOW | `editor.js` | 462 | `activeLabel` closures abandoned on iframe reload (old DOM discarded, minor) |
| F-SM-04 | MEDIUM | `editor.js` | 99, 122 | `undoStack` grows unbounded; base64 images (2MB each) cause memory pressure |
| F-SM-05 | LOW | `editor.js` | 1049 | `contentItemElements` holds detached DOM node refs until next rebuild |
| F-SM-06 | LOW | `dashboard.js` | 802 | `window.__restoreVersion` global function pollution |
| F-SM-07 | LOW | `dashboard.js` | 33 | `settingsCache` is null before first load; modal opened early shows defaults |

---

## Dimension 7: API / Security (3/10)

### Critical & High

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| SEC-1 | **CRITICAL** | `services/auth.js` | 18 | Owner password compared in plain text (`===`), not bcrypt |
| SEC-2 | HIGH | `services/auth.js` | 5 | JWT secret falls back to `'fallback-dev-secret'` if env var missing |
| SEC-3 | HIGH | `server.js` | 29 | CORS accepts all origins with credentials — any site can make authenticated requests |
| SEC-4 | HIGH | `server.js` | 24-28 | Content Security Policy entirely disabled |
| SEC-5 | HIGH | `template.js:62`, `guardian.js:38-43` | — | Stored XSS: richtext slots bypass Guardian HTML check; `$el.html(slot.value)` writes raw HTML |
| F-SEC-01 | HIGH | `editor.js` | 919 | XSS: `el.innerHTML = newVal` with user input for richtext slots |
| F-SEC-02 | HIGH | `editor.js` | 2006-2007 | XSS: `el.innerHTML = newValue` with AI API response data |
| F-SEC-03 | HIGH | `editor.js` | 1359 | XSS: `el.innerHTML = newVal` in Content panel apply |
| F-SEC-10 | HIGH | `dashboard.js` | 789-795 | Inline `onclick` with unescaped `siteId`/`versionId` — injection possible |

### Medium

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| SEC-6 | MEDIUM | `controllers/sites.js` | 456-468 | `pageTitle` injected into HTML without escaping |
| SEC-7 | MEDIUM | `routes/editor.js` | 35-38 | Owner password accepted as URL query parameter (logged in server logs, browser history) |
| SEC-8 | MEDIUM | `routes/editor.js` | 27 | Access token comparison not timing-safe |
| F-SEC-04 | MEDIUM | `editor.js` | 158-159 | XSS in undo handler via `innerHTML` |
| F-SEC-07 | MEDIUM | `editor.js` | 1558 | `postMessage` listener has no `e.origin` check |
| F-SEC-08 | MEDIUM | `editor.js` | 588 | `postMessage` sent with `'*'` targetOrigin |

### CSRF

No CSRF protection exists. The app relies on cookie-based JWT auth. Any page can make cross-origin requests with credentials since CORS is wide open. This is a compounding factor with SEC-3.

### Rate Limiting

Rate limiter (200 req/15min) is applied after static files and before auth. Keys by IP only, which breaks behind shared NAT/proxy. No per-route configuration for sensitive endpoints like login or publish.

---

## Dimension 8: Middleware & Auth (5/10)

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| AUTH-1 | MEDIUM | `services/auth.js` | 29-37 | Cookie `maxAge` is 7 days but JWT expires in 24h — cookie persists after token is invalid |
| AUTH-2 | MEDIUM | `routes/editor.js` | 54 | Empty catch in token verification — fail-open pattern (user silently redirected to login) |
| AUTH-3 | LOW | `middleware/auth.js` | — | All routes properly gated behind `requireOwner` or `requireAuth` |
| AUTH-4 | LOW | `services/auth.js` | 33-35 | Cookie settings: `httpOnly: true`, `secure: true` in production, `sameSite: 'lax'` — correct |

**Positive:** Auth middleware is consistently applied. No unprotected mutation routes found.

---

## Dimension 9: Code Organization (6/10)

### Strengths
- Clear layer separation: routes -> controllers -> services -> storage
- Storage abstraction (fileStore/mongoStore) behind proxy interface
- `asyncHandler` utility for route error forwarding

### Weaknesses
- `controllers/sites.js` is a God file (756 lines) handling 6+ domains
- `editor.js` is a 2165-line monolith with no module system
- Test files scattered (`test.js`, `test-phase2.js`, `test-phase3.js` at root; `test/` directory exists)
- No barrel files for routes
- No shared utilities between frontend files (duplicate `escapeHtml`, `formatDate`)

### Estimated Dead Code: ~8%
Across the codebase, approximately 200-250 lines are dead or duplicated code.

---

## Dimension 10: Performance & Scalability (5/10)

| ID | Priority | File | Lines | Finding |
|---|---|---|---|---|
| F-PERF-01 | MEDIUM | `editor.js` | 1051-1067 | `isElementVisible()` calls `getComputedStyle()` per ancestor per slot — O(slots * depth) |
| F-PERF-02 | LOW | `editor.js` | 1103-1166 | `buildSectionMap()` uses 16-selector querySelector on full iframe DOM |
| F-PERF-04 | MEDIUM | `editor.js` | 1478-1529 | Search filter runs on every keystroke with no debounce |
| F-PERF-05 | LOW | `editor.js` | 877 | Base64 images (up to 2MB) stored in memory and sent on every save |
| F-PERF-06 | MEDIUM | `dashboard.js` | 388-389 | Dashboard renders N iframes (2x resolution each) for site previews |
| VERCEL-1 | MEDIUM | `vercel.json` | — | No `maxDuration` set; default 10s may be too short for ingest/publish |
| VERCEL-2 | LOW | `vercel.json` | — | No cache headers for static assets; every request hits the function |
| VERCEL-3 | LOW | `vercel.json` | — | Uses legacy `routes` syntax instead of `rewrites` |

### Ingest Performance
The ingest engine (`services/ingest.js`) processes HTML synchronously via Cheerio. For a 500KB HTML file, Cheerio parsing is fast (~50ms). The slot detection iterates all elements once. The main bottleneck is the `forceExpandHiddenContent()` function that injects CSS — this is a string operation and is fast. No blocking issues identified for typical pages.

### Publisher Performance
Multi-page publish issues N sequential API calls (one `getPage` + one Vercel file per page). For a 10-page site, this is ~20 sequential async operations. Should batch the page fetches and use a single Vercel deployment API call.

### Frontend with 500+ Slots
`buildContentList` iterates all slots and calls `isElementVisible()` for each (which walks DOM ancestors). With 500 slots and average depth 8, that's ~4000 `getComputedStyle` calls. This could cause a noticeable UI freeze (~200-500ms) on Content tab switch. Should cache visibility results or compute lazily.

---

## CMS-Specific Issues

### 1. Ingest Robustness
- **Edge case:** Pages with `<iframe>` elements inside the content may cause nested iframe issues when loaded in the editor
- **Edge case:** SVG elements with text content are not detected as editable slots
- **Edge case:** Web Components (`<custom-element>`) are skipped entirely

### 2. Template Rendering
- Cheerio-based render (`template.js`) is reliable for standard HTML. Uses `$el.html()` for richtext and `$el.text()` for text — correct. However, self-closing tags (`<img>`, `<br>`) may be incorrectly serialized by Cheerio depending on the doctype.

### 3. Content Panel
- The section-based grouping relies on iframe DOM being loaded. If iframe fails to load, all items fall into "All Content" flat list — acceptable fallback.
- Orphan slots (in API but not in DOM) are correctly collected under "Hidden / Other".

### 4. Publish Pipeline
- No retry logic on Vercel API failures
- No rollback if deployment partially fails (some files uploaded, deployment creation fails)
- No deployment status polling — fires and forgets

### 5. Multi-Page
- Pages are properly integrated in storage layer
- Lazy migration from single-page to multi-page works but runs on every read
- `addPage` template builder has XSS via unescaped `pageTitle` (SEC-6)

### 6. Editor iframe
- `sandbox="allow-same-origin"` blocks JS in the iframe — intentional but means JS-driven CSS/animations won't render in preview
- No `load` error handler — error pages are silently treated as content
- `postMessage` has no origin validation

### 7. AI Chat
- OpenRouter integration works. `ANTHROPIC_URL` is dead code (never used)
- AI response is written via `innerHTML` — XSS vector if API response is compromised (F-SEC-02)
- No streaming; full response waited — acceptable for current use

---

## Priority Fix Roadmap

### P0 — This Week (Security)

| # | Finding | Fix |
|---|---|---|
| 1 | SEC-1: Plain-text owner password | Hash `OWNER_PASSWORD` with bcrypt on startup; compare with `bcrypt.compare()` |
| 2 | SEC-2: Fallback JWT secret | Remove fallback; throw on startup if `JWT_SECRET` env var is missing |
| 3 | SEC-3: Open CORS | Add `origin` whitelist to `cors()` config; restrict to actual domain |
| 4 | SEC-5 + F-SEC-01/02/03: Stored XSS via richtext | Sanitize richtext values with DOMPurify before `$el.html()` in template.js and before `innerHTML` in editor.js |
| 5 | SEC-4: CSP disabled | Enable CSP in Helmet with a policy that allows inline styles (needed for editor) but blocks inline scripts |
| 6 | F-SEC-10: onclick injection in dashboard | Replace inline `onclick` with `addEventListener`; remove `window.__restoreVersion` global |
| 7 | SEC-7: Password in URL query | Remove `?key=` auth from editor route; use cookie-only auth |

### P1 — Next Sprint (Stability)

| # | Finding | Fix |
|---|---|---|
| 8 | ERR-2: Raw error messages to client | Return generic message in production; log full error server-side |
| 9 | ERR-1/ERR-5: Missing try/catch on ingest | Wrap `ingestUrl`/`ingestHtml`/`axios.get` in try/catch with user-friendly error messages |
| 10 | ERR-3: Silent catch in editor route | Add `console.error(err)` to the empty catch block |
| 11 | ERR-4: Storage init failure | Exit process on storage init failure instead of continuing broken |
| 12 | AUTH-1: Cookie/JWT expiry mismatch | Align cookie `maxAge` with JWT `expiresIn` (both 24h or both 7d) |
| 13 | F-EH-03: Rollback res.ok | Add `if (!res.ok) throw` before processing rollback response |
| 14 | F-SEC-07: postMessage origin | Add `e.origin` check in message listener; restrict `postMessage` targetOrigin |
| 15 | SEC-9/SEC-10: Input validation | Validate `siteId` as UUID format before passing to storage layer |
| 16 | DB-1: Unbounded versions | Add TTL index on Version collection (e.g., 90 days) or cap at N versions per site |
| 17 | SEC-6: pageTitle XSS | Escape `pageTitle` before interpolating into HTML template |

### P2 — Next Month (Performance)

| # | Finding | Fix |
|---|---|---|
| 18 | PERF-1: N+1 in listAllSites | Replace per-site `Version.countDocuments` with `$group` aggregation |
| 19 | PERF-3: N+1 in publisher | Batch-fetch all pages for site in one query before building deployment |
| 20 | PERF-6: Full document loads | Add projection to `getPage`/`getPages` queries (exclude `frozenTemplate` when not needed) |
| 21 | F-PERF-01: getComputedStyle loop | Cache visibility results per build; compute lazily or in a single pass |
| 22 | F-PERF-04: Search debounce | Add 150ms debounce to `filterContentList` input handler |
| 23 | F-PERF-06: Dashboard N iframes | Replace iframe previews with static screenshot thumbnails generated at publish time |
| 24 | VERCEL-1: maxDuration | Add `functions` config with `maxDuration: 60` for ingest/publish routes |
| 25 | DB-2: Fragile version lookup | Store and look up versions by `_id` instead of timestamp string parsing |

### P3 — Backlog (Code Quality)

| # | Finding | Fix |
|---|---|---|
| 26 | DEAD-1: Duplicate preview/render | Remove one; share single implementation |
| 27 | DEAD-2/3/4/5/6: Dead code | Remove `ANTHROPIC_URL`, `ensureSiteDir` no-op, unused `updatePage`/`getPageTemplate`, unused `provider` |
| 28 | F-ORG-01: editor.js monolith | Split into modules with a build step (Vite) when next major feature is added |
| 29 | F-ORG-05/06: Duplicate utilities | Extract shared `escapeHtml`/`formatDate` into `public/js/utils.js` |
| 30 | God controller | Split `controllers/sites.js` into `pages.js`, `versions.js`, `seo.js`, `settings.js` |
| 31 | God service | Split `services/ingest.js` into `scraper.js`, `slotDetector.js`, `templateFreezer.js` |
| 32 | F-DEAD-02: Dead HTML | Remove `#config-section` from dashboard.html |
| 33 | F-DEAD-05: Version preview | Either implement per-version preview or remove misleading button |
| 34 | DB-4: Lazy migration | Run one-time batch migration script; remove `migrateSiteToPages` from read path |
| 35 | OTHER-1: Rate limiter order | Move rate limiter before static files; add per-route limits for login/publish |
| 36 | VERCEL-3: Legacy routes | Migrate `vercel.json` from `routes` to `rewrites` |
| 37 | F-SM-04: Unbounded undo | Cap `undoStack` at 50 entries; drop oldest on overflow |
| 38 | Missing env docs | Add `VERCEL_TEAM_ID`, `BLOB_READ_WRITE_TOKEN`, `OPENROUTER_MODEL` to `.env.example` |

---

## Appendix: File Line Counts

### Backend (`src/`)

| File | Lines |
|---|---|
| `controllers/sites.js` | 756 |
| `services/ingest.js` | 639 |
| `storage/mongoStore.js` | 426 |
| `services/publisher.js` | 196 |
| `services/guardian.js` | 174 |
| `storage/fileStore.js` | 158 |
| `services/aiChat.js` | 122 |
| `server.js` | 104 |
| `services/template.js` | 95 |
| `services/auth.js` | 42 |
| `routes/auth.js` | 77 |
| `routes/upload.js` | 70 |
| `routes/editor.js` | 69 |
| `middleware/auth.js` | 68 |
| `storage/index.js` | 51 |
| `routes/sites.js` | 44 |
| `routes/publish.js` | 34 |
| `routes/chat.js` | 29 |
| `middleware/errorHandler.js` | 13 |
| `utils/asyncHandler.js` | 5 |
| **Total backend** | **~3,170** |

### Frontend (`public/`)

| File | Lines |
|---|---|
| `js/editor.js` | 2,165 |
| `css/editor.css` | 1,999 |
| `css/dashboard.css` | 1,328 |
| `js/dashboard.js` | 908 |
| `editor.html` | 380 |
| `css/auth.css` | 196 |
| `dashboard.html` | 134 |
| `login.html` | 98 |
| **Total frontend** | **~7,208** |

**Grand total: ~10,378 lines** (excluding node_modules, data files, tests)
