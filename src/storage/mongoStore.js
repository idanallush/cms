import mongoose from 'mongoose';

const { Schema, model } = mongoose;

// ── Schemas ──

const pageSchema = new Schema({
  pageId: { type: String, required: true },
  slug: { type: String, required: true },
  title: { type: String, required: true },
  isIndex: { type: Boolean, default: false },
  frozenTemplate: { type: String, default: '' },
  contentMap: { type: Schema.Types.Mixed, default: {} },
  styles: { type: Schema.Types.Mixed, default: {} },
  seo: { type: Schema.Types.Mixed, default: {} },
  slotCount: { type: Number, default: 0 },
}, { _id: false });

const siteSchema = new Schema({
  siteId: { type: String, required: true, unique: true, index: true },
  name: { type: String, required: true },
  originalUrl: { type: String, required: true },
  // Legacy fields kept for migration
  frozenTemplate: { type: String, default: '' },
  contentMap: { type: Schema.Types.Mixed, default: {} },
  slotCount: { type: Number, default: 0 },
  // Pages array (new multi-page model)
  pages: { type: [pageSchema], default: [] },
  clientPasswordHash: { type: String, default: null },
  clientDisplayName: { type: String, default: null },
  clientHasAccessed: { type: Boolean, default: false },
  requireApproval: { type: Boolean, default: false },
  accessToken: { type: String, default: null },
  customDomain: { type: String, default: null },
  lastEditedAt: { type: Date, default: Date.now },
  publishedAt: { type: Date, default: null },
  publishUrl: { type: String, default: null },
  vercelProjectId: { type: String, default: null },
  vercelProjectName: { type: String, default: null },
  vercelDeploymentId: { type: String, default: null },
  seo: { type: Schema.Types.Mixed, default: {} },
  styles: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const settingsSchema = new Schema({
  key: { type: String, required: true, unique: true },
  value: { type: String, required: true },
}, { timestamps: true });

const Settings = model('Settings', settingsSchema);

const versionSchema = new Schema({
  siteId: { type: String, required: true, index: true },
  contentMap: { type: Schema.Types.Mixed, required: true },
  createdAt: { type: Date, default: Date.now },
});

versionSchema.index({ siteId: 1, createdAt: -1 });

const Site = model('Site', siteSchema);
const Version = model('Version', versionSchema);

// ── Connection ──

let connected = false;

export async function connect() {
  if (connected) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');
  await mongoose.connect(uri);
  connected = true;
  console.log('MongoDB connected');
}

// ── Storage API (same interface as fileStore) ──

export async function ensureSiteDir(siteId) {
  // No-op for MongoDB
}

export async function saveMeta(siteId, meta) {
  const existing = await Site.findOne({ siteId });
  if (existing) {
    Object.assign(existing, meta);
    await existing.save();
  } else {
    await Site.create(meta);
  }
}

export async function getMeta(siteId) {
  const site = await Site.findOne({ siteId }).lean();
  if (!site) return null;
  return {
    siteId: site.siteId,
    name: site.name,
    originalUrl: site.originalUrl,
    createdAt: site.createdAt?.toISOString?.() || site.createdAt,
    lastEditedAt: site.lastEditedAt?.toISOString?.() || site.lastEditedAt,
    slotCount: site.slotCount,
    clientPasswordHash: site.clientPasswordHash,
    clientDisplayName: site.clientDisplayName,
    clientHasAccessed: site.clientHasAccessed,
    requireApproval: site.requireApproval,
    accessToken: site.accessToken,
    customDomain: site.customDomain,
    publishedAt: site.publishedAt?.toISOString?.() || site.publishedAt,
    publishUrl: site.publishUrl,
    vercelProjectId: site.vercelProjectId,
    vercelProjectName: site.vercelProjectName,
    vercelDeploymentId: site.vercelDeploymentId,
    seo: site.seo || {},
    styles: site.styles || {},
  };
}

export async function saveTemplate(siteId, html) {
  await Site.updateOne({ siteId }, { frozenTemplate: html });
}

export async function getTemplate(siteId) {
  const site = await Site.findOne({ siteId }, { frozenTemplate: 1 }).lean();
  return site?.frozenTemplate || null;
}

export async function saveContent(siteId, contentMap) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  await Version.create({ siteId, contentMap, createdAt: new Date() });
  await Site.updateOne({ siteId }, { contentMap });

  return timestamp;
}

export async function getContent(siteId) {
  const site = await Site.findOne({ siteId }, { contentMap: 1 }).lean();
  return site?.contentMap || null;
}

export async function listVersions(siteId) {
  const versions = await Version.find({ siteId })
    .sort({ createdAt: -1 })
    .select({ createdAt: 1 })
    .lean();

  return versions.map(v => v.createdAt.toISOString().replace(/[:.]/g, '-'));
}

export async function getVersion(siteId, versionId) {
  // Convert versionId back to approximate date for querying
  const isoStr = versionId
    .replace(/-/g, (m, offset) => {
      if (offset === 4 || offset === 7) return '-';
      if (offset === 10) return 'T';
      if (offset === 13 || offset === 16) return ':';
      if (offset === 19) return '.';
      return m;
    });

  const targetDate = new Date(isoStr);
  if (isNaN(targetDate.getTime())) return null;

  // Find version within 1 second of the target timestamp
  const version = await Version.findOne({
    siteId,
    createdAt: {
      $gte: new Date(targetDate.getTime() - 1000),
      $lte: new Date(targetDate.getTime() + 1000),
    },
  }).lean();

  return version?.contentMap || null;
}

export async function siteExists(siteId) {
  const count = await Site.countDocuments({ siteId });
  return count > 0;
}

export async function listAllSites() {
  const sites = await Site.find({}, {
    frozenTemplate: 0,
    contentMap: 0,
  }).lean();

  const result = [];
  for (const site of sites) {
    const versionCount = await Version.countDocuments({ siteId: site.siteId });
    result.push({
      siteId: site.siteId,
      name: site.name,
      originalUrl: site.originalUrl,
      createdAt: site.createdAt?.toISOString?.() || site.createdAt,
      lastEditedAt: site.lastEditedAt?.toISOString?.() || site.lastEditedAt,
      slotCount: site.slotCount,
      clientPasswordHash: site.clientPasswordHash,
      clientDisplayName: site.clientDisplayName,
      clientHasAccessed: site.clientHasAccessed,
      requireApproval: site.requireApproval,
      accessToken: site.accessToken,
      customDomain: site.customDomain,
      publishedAt: site.publishedAt?.toISOString?.() || site.publishedAt,
      publishUrl: site.publishUrl,
      vercelProjectId: site.vercelProjectId,
      vercelProjectName: site.vercelProjectName,
      vercelDeploymentId: site.vercelDeploymentId,
      seo: site.seo || {},
      styles: site.styles || {},
      versionCount,
    });
  }

  return result;
}

export async function deleteSite(siteId) {
  const result = await Site.deleteOne({ siteId });
  await Version.deleteMany({ siteId });
  return result.deletedCount > 0;
}

export async function updateMeta(siteId, updates) {
  const site = await Site.findOneAndUpdate(
    { siteId },
    { $set: updates },
    { returnDocument: 'after', lean: true }
  );
  if (!site) return null;
  return {
    siteId: site.siteId,
    name: site.name,
    originalUrl: site.originalUrl,
    createdAt: site.createdAt?.toISOString?.() || site.createdAt,
    lastEditedAt: site.lastEditedAt?.toISOString?.() || site.lastEditedAt,
    slotCount: site.slotCount,
    clientPasswordHash: site.clientPasswordHash,
    clientDisplayName: site.clientDisplayName,
    clientHasAccessed: site.clientHasAccessed,
    requireApproval: site.requireApproval,
    accessToken: site.accessToken,
    customDomain: site.customDomain,
    publishedAt: site.publishedAt?.toISOString?.() || site.publishedAt,
    publishUrl: site.publishUrl,
    vercelProjectId: site.vercelProjectId,
    vercelProjectName: site.vercelProjectName,
    vercelDeploymentId: site.vercelDeploymentId,
    seo: site.seo || {},
    styles: site.styles || {},
  };
}

export async function saveSeo(siteId, seo) {
  await Site.updateOne({ siteId }, { $set: { seo } });
}

export async function getSeo(siteId) {
  const site = await Site.findOne({ siteId }, { seo: 1 }).lean();
  return site?.seo || {};
}

export async function saveStyles(siteId, styles) {
  await Site.updateOne({ siteId }, { $set: { styles } });
}

export async function getStyles(siteId) {
  const site = await Site.findOne({ siteId }, { styles: 1 }).lean();
  return site?.styles || {};
}

// ── Settings API ──

export async function getSetting(key) {
  const doc = await Settings.findOne({ key }).lean();
  return doc?.value || null;
}

export async function setSetting(key, value) {
  await Settings.findOneAndUpdate(
    { key },
    { key, value },
    { upsert: true }
  );
}

export async function getAllSettings() {
  const docs = await Settings.find({}).lean();
  const result = {};
  for (const doc of docs) {
    result[doc.key] = doc.value;
  }
  return result;
}

// ── Multi-page support ──

async function migrateSiteToPages(site) {
  if (site.pages && site.pages.length > 0) return site;
  if (!site.frozenTemplate && !site.contentMap) return site;

  const { v4: uuidv4 } = await import('uuid');
  const indexPage = {
    pageId: uuidv4(),
    slug: 'index',
    title: 'Home',
    isIndex: true,
    frozenTemplate: site.frozenTemplate || '',
    contentMap: site.contentMap || {},
    styles: site.styles || {},
    seo: site.seo || {},
    slotCount: site.slotCount || 0,
  };

  await Site.updateOne({ siteId: site.siteId }, {
    $set: { pages: [indexPage] },
  });

  console.log(`[migration] Site ${site.siteId} migrated to pages format`);
  site.pages = [indexPage];
  return site;
}

export async function getPages(siteId) {
  let site = await Site.findOne({ siteId }).lean();
  if (!site) return null;
  site = await migrateSiteToPages(site);
  return (site.pages || []).map(p => ({
    pageId: p.pageId,
    slug: p.slug,
    title: p.title,
    isIndex: p.isIndex,
    slotCount: p.slotCount || Object.keys(p.contentMap || {}).length,
  }));
}

export async function getPage(siteId, pageId) {
  let site = await Site.findOne({ siteId }).lean();
  if (!site) return null;
  site = await migrateSiteToPages(site);
  return (site.pages || []).find(p => p.pageId === pageId) || null;
}

export async function getIndexPage(siteId) {
  let site = await Site.findOne({ siteId }).lean();
  if (!site) return null;
  site = await migrateSiteToPages(site);
  return (site.pages || []).find(p => p.isIndex) || (site.pages || [])[0] || null;
}

export async function addPage(siteId, page) {
  let site = await Site.findOne({ siteId });
  if (!site) return null;
  const siteObj = site.toObject();
  await migrateSiteToPages(siteObj);
  await site.updateOne({ $push: { pages: page } });
  return page;
}

export async function updatePage(siteId, pageId, updates) {
  const setFields = {};
  for (const [key, value] of Object.entries(updates)) {
    setFields[`pages.$.${key}`] = value;
  }
  const result = await Site.updateOne(
    { siteId, 'pages.pageId': pageId },
    { $set: setFields }
  );
  return result.modifiedCount > 0;
}

export async function deletePage(siteId, pageId) {
  const site = await Site.findOne({ siteId }).lean();
  if (!site) return false;
  const page = (site.pages || []).find(p => p.pageId === pageId);
  if (!page || page.isIndex) return false;
  const result = await Site.updateOne(
    { siteId },
    { $pull: { pages: { pageId } } }
  );
  return result.modifiedCount > 0;
}

export async function getPageContent(siteId, pageId) {
  const page = await getPage(siteId, pageId);
  return page?.contentMap || null;
}

export async function savePageContent(siteId, pageId, contentMap) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  await Version.create({ siteId, contentMap, createdAt: new Date() });
  await Site.updateOne(
    { siteId, 'pages.pageId': pageId },
    { $set: { 'pages.$.contentMap': contentMap } }
  );
  return timestamp;
}

export async function getPageTemplate(siteId, pageId) {
  const page = await getPage(siteId, pageId);
  return page?.frozenTemplate || null;
}

export async function getPageStyles(siteId, pageId) {
  const page = await getPage(siteId, pageId);
  return page?.styles || {};
}

export async function savePageStyles(siteId, pageId, styles) {
  await Site.updateOne(
    { siteId, 'pages.pageId': pageId },
    { $set: { 'pages.$.styles': styles } }
  );
}

export async function getPageSeo(siteId, pageId) {
  const page = await getPage(siteId, pageId);
  return page?.seo || {};
}

export async function savePageSeo(siteId, pageId, seo) {
  await Site.updateOne(
    { siteId, 'pages.pageId': pageId },
    { $set: { 'pages.$.seo': seo } }
  );
}
