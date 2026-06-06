import { v4 as uuidv4 } from 'uuid';
import { ingestUrl, ingestHtml } from '../services/ingest.js';
import { renderTemplate } from '../services/template.js';
import { generatePublishHtml } from '../services/publisher.js';
import { validateChanges } from '../services/guardian.js';
import { hashPassword } from '../services/auth.js';
import * as store from '../storage/index.js';

export async function listSites(req, res) {
  const sites = await store.listAllSites();
  res.json({ sites });
}

export async function ingestSite(req, res) {
  const { url, name, html: rawHtml } = req.body;

  if (!url && !rawHtml) {
    return res.status(400).json({ error: { message: 'url or html is required' } });
  }

  let frozenTemplate, contentMap, originalUrl;

  if (rawHtml && typeof rawHtml === 'string') {
    ({ frozenTemplate, contentMap } = await ingestHtml(rawHtml));
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
  const meta = {
    siteId,
    name: name || (url ? new URL(url).hostname : 'Pasted Site'),
    originalUrl,
    createdAt: new Date().toISOString(),
    lastEditedAt: new Date().toISOString(),
    slotCount: Object.keys(contentMap).length,
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
}

export async function getSite(req, res) {
  const { siteId } = req.params;
  const meta = await store.getMeta(siteId);
  if (!meta) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }
  res.json(meta);
}

export async function getContent(req, res) {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }
  const content = await store.getContent(siteId);
  res.json(content);
}

export async function updateContent(req, res) {
  const { siteId } = req.params;
  const changes = req.body;

  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) {
    return res.status(400).json({ error: { message: 'Body must be an object of {slotId: newValue}' } });
  }

  if (!(await store.siteExists(siteId))) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }

  const currentContent = await store.getContent(siteId);
  const result = validateChanges(changes, currentContent);

  if (!result.valid) {
    return res.status(422).json({
      valid: false,
      errors: result.errors,
    });
  }

  const updatedContent = { ...currentContent, ...result.sanitizedChanges };
  const versionId = await store.saveContent(siteId, updatedContent);
  await store.updateMeta(siteId, { lastEditedAt: new Date().toISOString() });

  res.json({ valid: true, versionId, updatedSlots: Object.keys(result.sanitizedChanges) });
}

export async function listVersions(req, res) {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }
  const versions = await store.listVersions(siteId);
  res.json({ versions });
}

export async function rollback(req, res) {
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
}

export async function preview(req, res) {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }

  const template = await store.getTemplate(siteId);
  const content = await store.getContent(siteId);
  const html = renderTemplate(template, content);

  res.type('html').send(html);
}

export async function render(req, res) {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }

  const template = await store.getTemplate(siteId);
  const content = await store.getContent(siteId);
  const html = renderTemplate(template, content);

  res.type('html').send(html);
}

export async function deleteSite(req, res) {
  const { siteId } = req.params;
  const deleted = await store.deleteSite(siteId);
  if (!deleted) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }
  res.json({ success: true });
}

export async function setClientPassword(req, res) {
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
}

export async function exportSite(req, res) {
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

  const html = generatePublishHtml(template, content, meta);
  const filename = (meta.name || 'site').replace(/[^a-z0-9]/gi, '-').toLowerCase();

  res.setHeader('Content-Type', 'text/html');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.html"`);
  res.send(html);
}

export async function generateAccessToken(req, res) {
  const { siteId } = req.params;
  if (!(await store.siteExists(siteId))) {
    return res.status(404).json({ error: { message: 'Site not found' } });
  }

  const token = uuidv4().replace(/-/g, '').slice(0, 24);
  await store.updateMeta(siteId, { accessToken: token });
  res.json({ success: true, token });
}

export async function getSettings(req, res) {
  const settings = await store.getAllSettings();
  const hasAiKey = !!(settings.openrouter_api_key || process.env.OPENROUTER_API_KEY);
  const hasVercelToken = !!(settings.vercel_token || process.env.VERCEL_TOKEN);
  const hasDb = !!process.env.MONGODB_URI;

  res.json({
    ai: {
      connected: hasAiKey,
      provider: settings.ai_provider || 'openrouter',
      model: settings.ai_model || 'anthropic/claude-sonnet-4.5',
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
}

export async function updateSettings(req, res) {
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
  if (vercelProjectName !== undefined) updates.vercelProjectName = vercelProjectName;

  const updated = await store.updateMeta(siteId, updates);
  res.json(updated);
}

export async function saveGlobalSettings(req, res) {
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
}
