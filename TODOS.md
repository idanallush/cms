# TODOS

## Future Work

### Orphaned Blob Cleanup
- **What:** Add mechanism to detect and delete unused images from Vercel Blob storage.
- **Why:** When clients upload images but don't use them (or replace them), the old blobs persist indefinitely on Vercel's CDN. Over time, this accumulates storage cost.
- **Context:** The upload flow (Phase A) stores images via `@vercel/blob put()` and returns a CDN URL. There's no tracking of which blob URLs are actually referenced in the live content map. A cleanup job would need to: (1) list all blob URLs for a site, (2) compare against current contentMap values, (3) delete orphans via Vercel Blob's `del()` API.
- **Depends on:** Image upload feature (Phase A) must ship first.
- **Priority:** Low — negligible cost for 1-5 clients. Becomes real at 20+ clients with frequent image changes.

### Per-Element Computed Style Bounds
- **What:** During ingest, extract computed CSS values for each slot and store them. Slider bounds become +/-20% of original values instead of global hardcoded limits.
- **Why:** Global bounds (fontSize: 8-120px) allow clients to make drastic visual changes. Per-element bounds (original 32px → slider 26-38px) enforce the "can't break layout" promise more strictly.
- **Context:** Requires adding a `computedStyles` field to the content map during ingest. The ingest engine would need to evaluate CSS (or use a headless browser) to get computed values — cheerio alone can't do this. Consider puppeteer-based ingest enhancement.
- **Depends on:** Ingest hardening (Phase 1 from design doc) — don't add complexity to ingest until it's proven reliable on real sites.
- **Priority:** Medium — nice-to-have for launch, becomes important as more non-technical clients use the tool.
