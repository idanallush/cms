import { v4 as uuidv4 } from 'uuid';
import { ingestUrl } from '../services/ingest.js';
import { renderTemplate } from '../services/template.js';
import { validateChanges } from '../services/guardian.js';
import * as store from '../storage/fileStore.js';

export async function ingestSite(req, res) {
  const { url } = req.body;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: { message: 'url is required' } });
  }

  try {
    new URL(url);
  } catch {
    return res.status(400).json({ error: { message: 'Invalid URL format' } });
  }

  const siteId = uuidv4();
  const { frozenTemplate, contentMap } = await ingestUrl(url);

  const meta = {
    siteId,
    name: new URL(url).hostname,
    originalUrl: url,
    createdAt: new Date().toISOString(),
    slotCount: Object.keys(contentMap).length,
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
