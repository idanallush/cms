import { v4 as uuidv4 } from 'uuid';
import { ingestUrl, ingestHtml } from '../services/ingest.js';
import { renderTemplate } from '../services/template.js';
import { generatePublishHtml } from '../services/publisher.js';
import { validateChanges } from '../services/guardian.js';
import { hashPassword } from '../services/auth.js';
import * as store from '../storage/index.js';

export async function listSites(req, res) {
  try {
    const sites = await store.listAllSites();
    res.json({ sites });
  } catch (err) {
    console.error('[sites.listSites] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function ingestSite(req, res) {
  try {
    const { url, name, html: rawHtml } = req.body;

    if (!url && !rawHtml) {
      return res.status(400).json({ error: { message: 'url or html is required' } });
    }

    let frozenTemplate, contentMap, originalUrl;

    if (rawHtml && typeof rawHtml === 'string') {
      ({ frozenTemplate, contentMap } = await ingestHtml(rawHtml, url || undefined));
      originalUrl = url || 'pasted-html';
    } else {
      if (typeof url !== 'string') {
        return res.status(400).json({ error: { message: 'url must be a string' } });
      }
      try {
        new URL(url);
      } catch {
        return res.status(400).json({ error: { message: 'Invalid URL format' } });
      }
      ({ frozenTemplate, contentMap } = await ingestUrl(url));
      originalUrl = url;
    }

    const siteId = uuidv4();
    const indexPageId = uuidv4();
    const pages = [{
      pageId: indexPageId,
      slug: 'index',
      title: 'Home',
      isIndex: true,
      frozenTemplate,
      contentMap,
      styles: {},
      seo: {},
      slotCount: Object.keys(contentMap).length,
    }];

    const meta = {
      siteId,
      name: name || (url ? new URL(url).hostname : 'Pasted Site'),
      originalUrl,
      createdAt: new Date().toISOString(),
      lastEditedAt: new Date().toISOString(),
      slotCount: Object.keys(contentMap).length,
      pages,
      clientPasswordHash: null,
      clientDisplayName: null,
      customDomain: null,
    };

    await store.saveMeta(siteId, meta);
    await store.saveTemplate(siteId, frozenTemplate);
    await store.saveContent(siteId, contentMap);

    res.status(201).json({
      siteId,
      meta,
      slotCount: Object.keys(contentMap).length,
    });
  } catch (err) {
    console.error('[sites.ingestSite] Error:', err.message);
    res.status(500).json({ error: { message: `Ingest failed: ${err.message}` } });
  }
}

export async function getSite(req, res) {
  try {
    const { siteId } = req.params;
    const meta = await store.getMeta(siteId);
    if (!meta) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    res.json(meta);
  } catch (err) {
    console.error('[sites.getSite] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function getContent(req, res) {
  try {
    const { siteId } = req.params;
    const pageId = req.query.pageId;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    let content;
    if (pageId) {
      content = await store.getPageContent(siteId, pageId);
      if (content === null) return res.status(404).json({ error: { message: 'Page not found' } });
    } else {
      const indexPage = await store.getIndexPage(siteId);
      content = indexPage ? indexPage.contentMap : await store.getContent(siteId);
    }
    res.json(content);
  } catch (err) {
    console.error('[sites.getContent] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function updateContent(req, res) {
  try {
    const { siteId } = req.params;
    const pageId = req.query.pageId;
    const changes = req.body;

    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return res.status(400).json({ error: { message: 'Body must be an object of {slotId: newValue}' } });
    }

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    let currentContent;
    if (pageId) {
      currentContent = await store.getPageContent(siteId, pageId);
      if (currentContent === null) return res.status(404).json({ error: { message: 'Page not found' } });
    } else {
      const indexPage = await store.getIndexPage(siteId);
      if (indexPage) {
        currentContent = indexPage.contentMap;
      } else {
        currentContent = await store.getContent(siteId);
      }
    }

    const result = validateChanges(changes, currentContent);

    if (!result.valid) {
      return res.status(422).json({
        valid: false,
        errors: result.errors,
      });
    }

    const updatedContent = { ...currentContent, ...result.sanitizedChanges };

    if (pageId) {
      const versionId = await store.savePageContent(siteId, pageId, updatedContent);
      await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
      res.json({ valid: true, versionId, updatedSlots: Object.keys(result.sanitizedChanges) });
    } else {
      const indexPage = await store.getIndexPage(siteId);
      if (indexPage) {
        const versionId = await store.savePageContent(siteId, indexPage.pageId, updatedContent);
        await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
        res.json({ valid: true, versionId, updatedSlots: Object.keys(result.sanitizedChanges) });
      } else {
        const versionId = await store.saveContent(siteId, updatedContent);
        await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
        res.json({ valid: true, versionId, updatedSlots: Object.keys(result.sanitizedChanges) });
      }
    }
  } catch (err) {
    console.error('[sites.updateContent] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function listVersions(req, res) {
  try {
    const { siteId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const versions = await store.listVersions(siteId);
    res.json({ versions });
  } catch (err) {
    console.error('[sites.listVersions] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function rollback(req, res) {
  try {
    const { siteId, versionId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const versionContent = await store.getVersion(siteId, versionId);
    if (!versionContent) {
      return res.status(404).json({ error: { message: 'Version not found' } });
    }

    const newVersionId = await store.saveContent(siteId, versionContent);
    res.json({ rolledBackTo: versionId, newVersionId });
  } catch (err) {
    console.error('[sites.rollback] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function preview(req, res) {
  try {
    const { siteId } = req.params;
    const pageId = req.query.pageId;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    let template, content, styles;
    if (pageId) {
      const page = await store.getPage(siteId, pageId);
      if (!page) return res.status(404).json({ error: { message: 'Page not found' } });
      template = page.frozenTemplate;
      content = page.contentMap;
      styles = page.styles;
    } else {
      const indexPage = await store.getIndexPage(siteId);
      if (indexPage) {
        template = indexPage.frozenTemplate;
        content = indexPage.contentMap;
        styles = indexPage.styles;
      } else {
        template = await store.getTemplate(siteId);
        content = await store.getContent(siteId);
        styles = await store.getStyles(siteId);
      }
    }

    const html = renderTemplate(template, content, styles);

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[sites.preview] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export { preview as render };

export async function deleteSite(req, res) {
  try {
    const { siteId } = req.params;
    const deleted = await store.deleteSite(siteId);
    if (!deleted) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[sites.deleteSite] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function setClientPassword(req, res) {
  try {
    const { siteId } = req.params;
    const { password } = req.body;

    if (!password || typeof password !== 'string') {
      return res.status(400).json({ error: { message: 'Password is required' } });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: { message: 'Password must be at least 8 characters' } });
    }

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const hash = await hashPassword(password);
    await store.updateMeta(siteId, { clientPasswordHash: hash });
    res.json({ success: true, hasClientPassword: true });
  } catch (err) {
    console.error('[sites.setClientPassword] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function exportSite(req, res) {
  try {
    const { siteId } = req.params;
    const meta = await store.getMeta(siteId);
    if (!meta) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const template = await store.getTemplate(siteId);
    const content = await store.getContent(siteId);
    if (!template || !content) {
      return res.status(404).json({ error: { message: 'Site has no content' } });
    }

    const styles = await store.getStyles(siteId);
    const html = generatePublishHtml(template, content, meta, styles);
    const filename = (meta.name || 'site').replace(/[^a-z0-9]/gi, '-').toLowerCase();

    res.setHeader('Content-Type', 'text/html');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.html"`);
    res.send(html);
  } catch (err) {
    console.error('[sites.exportSite] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function generateAccessToken(req, res) {
  try {
    const { siteId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const token = uuidv4().replace(/-/g, '').slice(0, 24);
    await store.updateMeta(siteId, { accessToken: token });
    res.json({ success: true, token });
  } catch (err) {
    console.error('[sites.generateAccessToken] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function getSettings(req, res) {
  try {
    const settings = await store.getAllSettings();
    const hasAiKey = !!(settings.openrouter_api_key || process.env.OPENROUTER_API_KEY);
    const hasVercelToken = !!(settings.vercel_token || process.env.VERCEL_TOKEN);
    const hasDb = !!process.env.MONGODB_URI;

    res.json({
      ai: {
        connected: hasAiKey,
        provider: settings.ai_provider || 'openrouter',
        model: settings.ai_model || 'openai/gpt-4o-mini',
      },
      vercel: {
        connected: hasVercelToken,
        teamId: settings.vercel_team_id || process.env.VERCEL_TEAM_ID || null,
      },
      db: {
        connected: hasDb,
        mode: hasDb ? 'mongodb' : 'filesystem',
      },
      ownerKey: process.env.OWNER_PASSWORD ? '***' : null,
    });
  } catch (err) {
    console.error('[sites.getSettings] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function updateSettings(req, res) {
  try {
    const { siteId } = req.params;
    const { name, customDomain, clientDisplayName, requireApproval, vercelProjectName } = req.body;

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const updates = {};
    if (name !== undefined) updates.name = name;
    if (customDomain !== undefined) updates.customDomain = customDomain;
    if (clientDisplayName !== undefined) updates.clientDisplayName = clientDisplayName;
    if (requireApproval !== undefined) updates.requireApproval = requireApproval;
    if (vercelProjectName !== undefined) {
      updates.vercelProjectName = vercelProjectName;
      const currentMeta = await store.getMeta(siteId);
      if (currentMeta && currentMeta.vercelProjectName !== vercelProjectName) {
        updates.vercelProjectId = null;
      }
    }

    const updated = await store.updateMeta(siteId, updates);
    res.json(updated);
  } catch (err) {
    console.error('[sites.updateSettings] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

// ── Pages ──

export async function listPages(req, res) {
  try {
    const { siteId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const pages = await store.getPages(siteId);
    res.json({ pages });
  } catch (err) {
    console.error('[sites.listPages] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function getPageDetail(req, res) {
  try {
    const { siteId, pageId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const page = await store.getPage(siteId, pageId);
    if (!page) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    res.json(page);
  } catch (err) {
    console.error('[sites.getPageDetail] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function createPage(req, res) {
  try {
    const { siteId } = req.params;
    const { title, slug, templateType } = req.body;

    if (!title || !slug) {
      return res.status(400).json({ error: { message: 'title and slug are required' } });
    }

    const cleanSlug = slug.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!cleanSlug || cleanSlug === 'index') {
      return res.status(400).json({ error: { message: 'Invalid slug' } });
    }

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const pages = await store.getPages(siteId);
    if (pages.find(p => p.slug === cleanSlug)) {
      return res.status(409).json({ error: { message: 'A page with this slug already exists' } });
    }

    const indexPage = await store.getIndexPage(siteId);
    const template = await buildPageTemplate(indexPage?.frozenTemplate, title, templateType || 'blank');
    const { ingestHtml } = await import('../services/ingest.js');
    const { frozenTemplate, contentMap } = await ingestHtml(template, undefined);

    const page = {
      pageId: uuidv4(),
      slug: cleanSlug,
      title,
      isIndex: false,
      frozenTemplate,
      contentMap,
      styles: {},
      seo: { title },
      slotCount: Object.keys(contentMap).length,
    };

    await store.addPage(siteId, page);
    await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });

    res.status(201).json(page);
  } catch (err) {
    console.error('[sites.createPage] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

async function buildPageTemplate(indexTemplate, pageTitle, templateType) {
  const cheerio = await import('cheerio');
  let headContent = '';
  let headerHtml = '';
  let footerHtml = '';

  if (indexTemplate) {
    const $ = cheerio.load(indexTemplate, { decodeEntities: false });
    const headEl = $('head');
    if (headEl.length) {
      headEl.find('title').remove();
      headContent = headEl.html() || '';
    }
    const header = $('header').first();
    if (header.length) headerHtml = $.html(header);
    const nav = $('nav').first();
    if (!headerHtml && nav.length) headerHtml = $.html(nav);
    const footer = $('footer').first();
    if (footer.length) footerHtml = $.html(footer);
  }

  let bodyContent = '';
  if (templateType === 'article') {
    bodyContent = `
    <article style="max-width:800px;margin:40px auto;padding:0 20px;">
      <h1>${pageTitle}</h1>
      <p style="color:#666;font-size:14px;">${new Date().toLocaleDateString()}</p>
      <img src="https://placehold.co/800x400?text=Hero+Image" alt="Hero image" style="width:100%;border-radius:8px;margin:20px 0;">
      <p>Start writing your article content here. This is a placeholder paragraph that you can edit using the CMS editor.</p>
      <p>Add more paragraphs, images, and other content to build out your page.</p>
    </article>`;
  } else {
    bodyContent = `
    <main style="max-width:1200px;margin:40px auto;padding:0 20px;">
      <h1>${pageTitle}</h1>
      <p>This is a new page. Click on any element to start editing.</p>
    </main>`;
  }

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${pageTitle}</title>
  ${headContent}
</head>
<body>
  ${headerHtml}
  ${bodyContent}
  ${footerHtml}
</body>
</html>`;
}

export async function deletePageHandler(req, res) {
  try {
    const { siteId, pageId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const page = await store.getPage(siteId, pageId);
    if (!page) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    if (page.isIndex) {
      return res.status(400).json({ error: { message: 'Cannot delete the index page' } });
    }
    const deleted = await store.deletePage(siteId, pageId);
    if (!deleted) {
      return res.status(500).json({ error: { message: 'Failed to delete page' } });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[sites.deletePageHandler] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function getPageContentHandler(req, res) {
  try {
    const { siteId, pageId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const content = await store.getPageContent(siteId, pageId);
    if (content === null) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }
    res.json(content);
  } catch (err) {
    console.error('[sites.getPageContentHandler] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function updatePageContent(req, res) {
  try {
    const { siteId, pageId } = req.params;
    const changes = req.body;

    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
      return res.status(400).json({ error: { message: 'Body must be an object of {slotId: newValue}' } });
    }

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const currentContent = await store.getPageContent(siteId, pageId);
    if (currentContent === null) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }

    const result = validateChanges(changes, currentContent);
    if (!result.valid) {
      return res.status(422).json({ valid: false, errors: result.errors });
    }

    const updatedContent = { ...currentContent, ...result.sanitizedChanges };
    const versionId = await store.savePageContent(siteId, pageId, updatedContent);
    await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });

    res.json({ valid: true, versionId, updatedSlots: Object.keys(result.sanitizedChanges) });
  } catch (err) {
    console.error('[sites.updatePageContent] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function renderPage(req, res) {
  try {
    const { siteId, pageId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const page = await store.getPage(siteId, pageId);
    if (!page) {
      return res.status(404).json({ error: { message: 'Page not found' } });
    }

    const { renderTemplate } = await import('../services/template.js');
    const html = renderTemplate(page.frozenTemplate, page.contentMap, page.styles);

    res.removeHeader('X-Frame-Options');
    res.removeHeader('Content-Security-Policy');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  } catch (err) {
    console.error('[sites.renderPage] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function getPageStylesHandler(req, res) {
  try {
    const { siteId, pageId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const styles = await store.getPageStyles(siteId, pageId);
    res.json(styles);
  } catch (err) {
    console.error('[sites.getPageStylesHandler] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function savePageStylesHandler(req, res) {
  try {
    const { siteId, pageId } = req.params;
    const styles = req.body;

    if (!styles || typeof styles !== 'object' || Array.isArray(styles)) {
      return res.status(400).json({ error: { message: 'Body must be an object' } });
    }

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const { validateStyleOverrides } = await import('../services/guardian.js');
    const result = validateStyleOverrides(styles);
    if (!result.valid) {
      return res.status(422).json({ valid: false, errors: result.errors });
    }

    const existing = await store.getPageStyles(siteId, pageId);
    const merged = { ...existing, ...result.sanitizedStyles };
    await store.savePageStyles(siteId, pageId, merged);
    await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
    res.json({ valid: true, styles: merged });
  } catch (err) {
    console.error('[sites.savePageStylesHandler] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function getPageSeoHandler(req, res) {
  try {
    const { siteId, pageId } = req.params;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }
    const seo = await store.getPageSeo(siteId, pageId);
    res.json(seo);
  } catch (err) {
    console.error('[sites.getPageSeoHandler] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function savePageSeoHandler(req, res) {
  try {
    const { siteId, pageId } = req.params;
    const { title, description, ogImage, canonicalUrl, noIndex } = req.body;

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const seo = {};
    if (title !== undefined) seo.title = String(title).slice(0, 120);
    if (description !== undefined) seo.description = String(description).slice(0, 320);
    if (ogImage !== undefined) seo.ogImage = String(ogImage);
    if (canonicalUrl !== undefined) seo.canonicalUrl = String(canonicalUrl);
    if (noIndex !== undefined) seo.noIndex = !!noIndex;

    await store.savePageSeo(siteId, pageId, seo);
    await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
    res.json({ success: true, seo });
  } catch (err) {
    console.error('[sites.savePageSeoHandler] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

// ── SEO ──

export async function getSeo(req, res) {
  try {
    const { siteId } = req.params;
    const pageId = req.query.pageId;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    if (pageId) {
      const seo = await store.getPageSeo(siteId, pageId);
      res.json(seo);
    } else {
      const indexPage = await store.getIndexPage(siteId);
      const seo = indexPage ? (indexPage.seo || {}) : await store.getSeo(siteId);
      res.json(seo);
    }
  } catch (err) {
    console.error('[sites.getSeo] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function saveSeo(req, res) {
  try {
    const { siteId } = req.params;
    const pageId = req.query.pageId;
    const { title, description, ogImage, canonicalUrl, noIndex } = req.body;

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const seo = {};
    if (title !== undefined) seo.title = String(title).slice(0, 120);
    if (description !== undefined) seo.description = String(description).slice(0, 320);
    if (ogImage !== undefined) seo.ogImage = String(ogImage);
    if (canonicalUrl !== undefined) seo.canonicalUrl = String(canonicalUrl);
    if (noIndex !== undefined) seo.noIndex = !!noIndex;

    if (pageId) {
      await store.savePageSeo(siteId, pageId, seo);
    } else {
      const indexPage = await store.getIndexPage(siteId);
      if (indexPage) {
        await store.savePageSeo(siteId, indexPage.pageId, seo);
      } else {
        await store.saveSeo(siteId, seo);
      }
    }
    await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
    res.json({ success: true, seo });
  } catch (err) {
    console.error('[sites.saveSeo] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

// ── Styles ──

export async function getStyles(req, res) {
  try {
    const { siteId } = req.params;
    const pageId = req.query.pageId;
    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    if (pageId) {
      const styles = await store.getPageStyles(siteId, pageId);
      res.json(styles);
    } else {
      const indexPage = await store.getIndexPage(siteId);
      const styles = indexPage ? (indexPage.styles || {}) : await store.getStyles(siteId);
      res.json(styles);
    }
  } catch (err) {
    console.error('[sites.getStyles] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function saveStyles(req, res) {
  try {
    const { siteId } = req.params;
    const pageId = req.query.pageId;
    const styles = req.body;

    if (!styles || typeof styles !== 'object' || Array.isArray(styles)) {
      return res.status(400).json({ error: { message: 'Body must be an object of {slotId: styleOverrides}' } });
    }

    if (!(await store.siteExists(siteId))) {
      return res.status(404).json({ error: { message: 'Site not found' } });
    }

    const { validateStyleOverrides } = await import('../services/guardian.js');
    const result = validateStyleOverrides(styles);
    if (!result.valid) {
      return res.status(422).json({ valid: false, errors: result.errors });
    }

    if (pageId) {
      const existing = await store.getPageStyles(siteId, pageId);
      const merged = { ...existing, ...result.sanitizedStyles };
      await store.savePageStyles(siteId, pageId, merged);
      await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
      res.json({ valid: true, styles: merged });
    } else {
      const indexPage = await store.getIndexPage(siteId);
      if (indexPage) {
        const existing = indexPage.styles || {};
        const merged = { ...existing, ...result.sanitizedStyles };
        await store.savePageStyles(siteId, indexPage.pageId, merged);
        await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
        res.json({ valid: true, styles: merged });
      } else {
        const existing = await store.getStyles(siteId);
        const merged = { ...existing, ...result.sanitizedStyles };
        await store.saveStyles(siteId, merged);
        await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });
        res.json({ valid: true, styles: merged });
      }
    }
  } catch (err) {
    console.error('[sites.saveStyles] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function saveGlobalSettings(req, res) {
  try {
    const { key, value, provider, model, teamId } = req.body;

    if (key === 'ai') {
      if (value) await store.setSetting('openrouter_api_key', value);
      if (provider) await store.setSetting('ai_provider', provider);
      if (model) await store.setSetting('ai_model', model);
    } else if (key === 'vercel') {
      if (value) await store.setSetting('vercel_token', value);
      if (teamId) await store.setSetting('vercel_team_id', teamId);
    } else {
      return res.status(400).json({ error: { message: 'Unknown setting key' } });
    }

    res.json({ success: true });
  } catch (err) {
    console.error('[sites.saveGlobalSettings] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

// ── Submissions (Inbox) ──

export async function listSubmissions(req, res) {
  try {
    const { siteId } = req.params;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);
    const result = await store.listSubmissions(siteId, { page, limit });
    const totalPages = Math.ceil((result.total || 0) / limit);
    res.json({
      submissions: result.items,
      total: result.total,
      page: result.page,
      totalPages,
    });
  } catch (err) {
    console.error('[sites.listSubmissions] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function getUnreadCount(req, res) {
  try {
    const { siteId } = req.params;
    const count = await store.getUnreadCount(siteId);
    res.json({ count });
  } catch (err) {
    console.error('[sites.getUnreadCount] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function markSubmissionRead(req, res) {
  try {
    const { siteId, submissionId } = req.params;
    await store.markSubmissionRead(siteId, submissionId);
    res.json({ success: true });
  } catch (err) {
    console.error('[sites.markSubmissionRead] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}

export async function deleteSubmission(req, res) {
  try {
    const { siteId, submissionId } = req.params;
    await store.deleteSubmission(siteId, submissionId);
    res.json({ success: true });
  } catch (err) {
    console.error('[sites.deleteSubmission] Error:', err.message);
    res.status(500).json({ error: { message: 'Internal server error' } });
  }
}
