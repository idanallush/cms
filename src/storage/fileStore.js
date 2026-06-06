import { mkdir, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DATA_DIR = process.env.DATA_DIR || './data';

function sitePath(siteId) {
  return path.join(DATA_DIR, 'sites', siteId);
}

function versionsPath(siteId) {
  return path.join(sitePath(siteId), 'versions');
}

export async function ensureSiteDir(siteId) {
  await mkdir(versionsPath(siteId), { recursive: true });
}

export async function saveMeta(siteId, meta) {
  await ensureSiteDir(siteId);
  await writeFile(path.join(sitePath(siteId), 'meta.json'), JSON.stringify(meta, null, 2));
}

export async function getMeta(siteId) {
  const file = path.join(sitePath(siteId), 'meta.json');
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf-8'));
}

export async function saveTemplate(siteId, html) {
  await ensureSiteDir(siteId);
  await writeFile(path.join(sitePath(siteId), 'template.html'), html);
}

export async function getTemplate(siteId) {
  const file = path.join(sitePath(siteId), 'template.html');
  if (!existsSync(file)) return null;
  return readFile(file, 'utf-8');
}

export async function saveContent(siteId, contentMap) {
  await ensureSiteDir(siteId);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(
    path.join(versionsPath(siteId), `${timestamp}.json`),
    JSON.stringify(contentMap, null, 2)
  );
  await writeFile(
    path.join(sitePath(siteId), 'content.json'),
    JSON.stringify(contentMap, null, 2)
  );
  return timestamp;
}

export async function getContent(siteId) {
  const file = path.join(sitePath(siteId), 'content.json');
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf-8'));
}

export async function listVersions(siteId) {
  const dir = versionsPath(siteId);
  if (!existsSync(dir)) return [];
  const files = await readdir(dir);
  return files
    .filter(f => f.endsWith('.json'))
    .map(f => f.replace('.json', ''))
    .sort()
    .reverse();
}

export async function getVersion(siteId, versionId) {
  const file = path.join(versionsPath(siteId), `${versionId}.json`);
  if (!existsSync(file)) return null;
  return JSON.parse(await readFile(file, 'utf-8'));
}

export async function siteExists(siteId) {
  return existsSync(path.join(sitePath(siteId), 'meta.json'));
}

export async function listAllSites() {
  const sitesDir = path.join(DATA_DIR, 'sites');
  if (!existsSync(sitesDir)) return [];
  const dirs = await readdir(sitesDir);
  const sites = [];
  for (const dir of dirs) {
    const meta = await getMeta(dir);
    if (meta) {
      const versions = await listVersions(dir);
      sites.push({ ...meta, versionCount: versions.length });
    }
  }
  return sites;
}

export async function deleteSite(siteId) {
  const dir = sitePath(siteId);
  if (!existsSync(dir)) return false;
  await rm(dir, { recursive: true, force: true });
  return true;
}

export async function updateMeta(siteId, updates) {
  const meta = await getMeta(siteId);
  if (!meta) return null;
  const updated = { ...meta, ...updates };
  await saveMeta(siteId, updated);
  return updated;
}

// SEO & Styles (stored in meta.json)

export async function saveSeo(siteId, seo) {
  return updateMeta(siteId, { seo });
}

export async function getSeo(siteId) {
  const meta = await getMeta(siteId);
  return meta?.seo || {};
}

export async function saveStyles(siteId, styles) {
  return updateMeta(siteId, { styles });
}

export async function getStyles(siteId) {
  const meta = await getMeta(siteId);
  return meta?.styles || {};
}

// Settings (file-based fallback)
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

async function loadSettings() {
  if (!existsSync(SETTINGS_FILE)) return {};
  return JSON.parse(await readFile(SETTINGS_FILE, 'utf-8'));
}

async function saveSettings(settings) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}

export async function getSetting(key) {
  const settings = await loadSettings();
  return settings[key] || null;
}

export async function setSetting(key, value) {
  const settings = await loadSettings();
  settings[key] = value;
  await saveSettings(settings);
}

export async function getAllSettings() {
  return loadSettings();
}
