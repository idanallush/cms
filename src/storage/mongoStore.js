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
  name: { type: String, required: true, index: true },
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

// ── Connection (serverless-optimized with global cache) ──

let cached = global.__mongooseCache;
if (!cached) {
  cached = global.__mongooseCache = { conn: null, promise: null };
}

export function isConnected() {
  return !!cached.conn && mongoose.connection.readyState === 1;
}

export async function connect() {
  if (cached.conn) return cached.conn;

  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error('MONGODB_URI not set');

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      maxPoolSize: 5,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      bufferCommands: false,
    }).then(conn => {
      console.log('MongoDB connected');
      return conn;
    });
  }

  try {
    cached.conn = await cached.promise;
    return cached.conn;
  } catch (err) {
    cached.promise = null;
    console.error('[mongoStore.connect] Error:', err.message);
    throw err;
  }
}

// ── Storage API (same interface as fileStore) ──

export async function saveMeta(siteId, meta) {
  try {
    const existing = await Site.findOne({ siteId });
    if (existing) {
      Object.assign(existing, meta);
      await existing.save();
    } else {
      await Site.create(meta);
    }
  } catch (err) {
    console.error('[mongoStore.saveMeta] Error:', err.message);
    throw err;
  }
}

export async function getMeta(siteId) {
  try {
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
  } catch (err) {
    console.error('[mongoStore.getMeta] Error:', err.message);
    return null;
  }
}

export async function saveTemplate(siteId, html) {
  try {
    await Site.updateOne({ siteId }, { frozenTemplate: html });
  } catch (err) {
    console.error('[mongoStore.saveTemplate] Error:', err.message);
    throw err;
  }
}

export async function getTemplate(siteId) {
  try {
    const site = await Site.findOne({ siteId }, { frozenTemplate: 1 }).lean();
    return site?.frozenTemplate || null;
  } catch (err) {
    console.error('[mongoStore.getTemplate] Error:', err.message);
    return null;
  }
}

export async function saveContent(siteId, contentMap) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await Version.create({ siteId, contentMap, createdAt: new Date() });
    await Site.updateOne({ siteId }, { contentMap });
    return timestamp;
  } catch (err) {
    console.error('[mongoStore.saveContent] Error:', err.message);
    throw err;
  }
}

export async function getContent(siteId) {
  try {
    const site = await Site.findOne({ siteId }, { contentMap: 1 }).lean();
    return site?.contentMap || null;
  } catch (err) {
    console.error('[mongoStore.getContent] Error:', err.message);
    return null;
  }
}

export async function listVersions(siteId) {
  try {
    const versions = await Version.find({ siteId })
      .sort({ createdAt: -1 })
      .select({ createdAt: 1 })
      .lean();
    return versions.map(v => v.createdAt.toISOString().replace(/[:.]/g, '-'));
  } catch (err) {
    console.error('[mongoStore.listVersions] Error:', err.message);
    return [];
  }
}

export async function getVersion(siteId, versionId) {
  try {
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
  } catch (err) {
    console.error('[mongoStore.getVersion] Error:', err.message);
    return null;
  }
}

export async function siteExists(siteId) {
  try {
    const count = await Site.countDocuments({ siteId });
    return count > 0;
  } catch (err) {
    console.error('[mongoStore.siteExists] Error:', err.message);
    return false;
  }
}

export async function listAllSites() {
  try {
    const sites = await Site.find({}, {
      frozenTemplate: 0,
      contentMap: 0,
      'pages.frozenTemplate': 0,
      'pages.contentMap': 0,
      'pages.styles': 0,
      'pages.seo': 0,
    }).lean();

    // Batch version counts instead of N+1 queries
    const siteIds = sites.map(s => s.siteId);
    const versionCounts = await Version.aggregate([
      { $match: { siteId: { $in: siteIds } } },
      { $group: { _id: '$siteId', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    for (const vc of versionCounts) {
      countMap[vc._id] = vc.count;
    }

    return sites.map(site => ({
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
      versionCount: countMap[site.siteId] || 0,
    }));
  } catch (err) {
    console.error('[mongoStore.listAllSites] Error:', err.message);
    return [];
  }
}

export async function deleteSite(siteId) {
  try {
    const result = await Site.deleteOne({ siteId });
    await Version.deleteMany({ siteId });
    return result.deletedCount > 0;
  } catch (err) {
    console.error('[mongoStore.deleteSite] Error:', err.message);
    return false;
  }
}

export async function updateMeta(siteId, updates) {
  try {
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
  } catch (err) {
    console.error('[mongoStore.updateMeta] Error:', err.message);
    return null;
  }
}

export async function saveSeo(siteId, seo) {
  try {
    await Site.updateOne({ siteId }, { $set: { seo } });
  } catch (err) {
    console.error('[mongoStore.saveSeo] Error:', err.message);
    throw err;
  }
}

export async function getSeo(siteId) {
  try {
    const site = await Site.findOne({ siteId }, { seo: 1 }).lean();
    return site?.seo || {};
  } catch (err) {
    console.error('[mongoStore.getSeo] Error:', err.message);
    return {};
  }
}

export async function saveStyles(siteId, styles) {
  try {
    await Site.updateOne({ siteId }, { $set: { styles } });
  } catch (err) {
    console.error('[mongoStore.saveStyles] Error:', err.message);
    throw err;
  }
}

export async function getStyles(siteId) {
  try {
    const site = await Site.findOne({ siteId }, { styles: 1 }).lean();
    return site?.styles || {};
  } catch (err) {
    console.error('[mongoStore.getStyles] Error:', err.message);
    return {};
  }
}

// ── Settings API ──

export async function getSetting(key) {
  try {
    const doc = await Settings.findOne({ key }).lean();
    return doc?.value || null;
  } catch (err) {
    console.error('[mongoStore.getSetting] Error:', err.message);
    return null;
  }
}

export async function setSetting(key, value) {
  try {
    await Settings.findOneAndUpdate(
      { key },
      { key, value },
      { upsert: true }
    );
  } catch (err) {
    console.error('[mongoStore.setSetting] Error:', err.message);
    throw err;
  }
}

export async function getAllSettings() {
  try {
    const docs = await Settings.find({}).lean();
    const result = {};
    for (const doc of docs) {
      result[doc.key] = doc.value;
    }
    return result;
  } catch (err) {
    console.error('[mongoStore.getAllSettings] Error:', err.message);
    return {};
  }
}

// ── Multi-page support ──

async function migrateSiteToPages(site) {
  if (site.pages && site.pages.length > 0) return site;
  if (!site.frozenTemplate && !site.contentMap) return site;

  try {
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
  } catch (err) {
    console.error('[mongoStore.migrateSiteToPages] Error:', err.message);
    return site;
  }
}

export async function getPages(siteId) {
  try {
    let site = await Site.findOne({ siteId }, {
      'pages.pageId': 1,
      'pages.slug': 1,
      'pages.title': 1,
      'pages.isIndex': 1,
      'pages.slotCount': 1,
      frozenTemplate: 1,
      contentMap: 1,
      slotCount: 1,
      siteId: 1,
      styles: 1,
      seo: 1,
    }).lean();
    if (!site) return null;
    site = await migrateSiteToPages(site);
    return (site.pages || []).map(p => ({
      pageId: p.pageId,
      slug: p.slug,
      title: p.title,
      isIndex: p.isIndex,
      slotCount: p.slotCount || 0,
    }));
  } catch (err) {
    console.error('[mongoStore.getPages] Error:', err.message);
    return null;
  }
}

export async function getPage(siteId, pageId) {
  try {
    let site = await Site.findOne({ siteId }).lean();
    if (!site) return null;
    site = await migrateSiteToPages(site);
    return (site.pages || []).find(p => p.pageId === pageId) || null;
  } catch (err) {
    console.error('[mongoStore.getPage] Error:', err.message);
    return null;
  }
}

export async function getIndexPage(siteId) {
  try {
    let site = await Site.findOne({ siteId }).lean();
    if (!site) return null;
    site = await migrateSiteToPages(site);
    return (site.pages || []).find(p => p.isIndex) || (site.pages || [])[0] || null;
  } catch (err) {
    console.error('[mongoStore.getIndexPage] Error:', err.message);
    return null;
  }
}

export async function addPage(siteId, page) {
  try {
    let site = await Site.findOne({ siteId });
    if (!site) return null;
    const siteObj = site.toObject();
    await migrateSiteToPages(siteObj);
    await site.updateOne({ $push: { pages: page } });
    return page;
  } catch (err) {
    console.error('[mongoStore.addPage] Error:', err.message);
    return null;
  }
}

export async function deletePage(siteId, pageId) {
  try {
    const site = await Site.findOne({ siteId }).lean();
    if (!site) return false;
    const page = (site.pages || []).find(p => p.pageId === pageId);
    if (!page || page.isIndex) return false;
    const result = await Site.updateOne(
      { siteId },
      { $pull: { pages: { pageId } } }
    );
    return result.modifiedCount > 0;
  } catch (err) {
    console.error('[mongoStore.deletePage] Error:', err.message);
    return false;
  }
}

export async function getPageContent(siteId, pageId) {
  try {
    const page = await getPage(siteId, pageId);
    return page?.contentMap || null;
  } catch (err) {
    console.error('[mongoStore.getPageContent] Error:', err.message);
    return null;
  }
}

export async function savePageContent(siteId, pageId, contentMap) {
  try {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    await Version.create({ siteId, contentMap, createdAt: new Date() });
    await Site.updateOne(
      { siteId, 'pages.pageId': pageId },
      { $set: { 'pages.$.contentMap': contentMap } }
    );
    return timestamp;
  } catch (err) {
    console.error('[mongoStore.savePageContent] Error:', err.message);
    throw err;
  }
}

export async function getPageStyles(siteId, pageId) {
  try {
    const page = await getPage(siteId, pageId);
    return page?.styles || {};
  } catch (err) {
    console.error('[mongoStore.getPageStyles] Error:', err.message);
    return {};
  }
}

export async function savePageStyles(siteId, pageId, styles) {
  try {
    await Site.updateOne(
      { siteId, 'pages.pageId': pageId },
      { $set: { 'pages.$.styles': styles } }
    );
  } catch (err) {
    console.error('[mongoStore.savePageStyles] Error:', err.message);
    throw err;
  }
}

export async function getPageSeo(siteId, pageId) {
  try {
    const page = await getPage(siteId, pageId);
    return page?.seo || {};
  } catch (err) {
    console.error('[mongoStore.getPageSeo] Error:', err.message);
    return {};
  }
}

export async function savePageSeo(siteId, pageId, seo) {
  try {
    await Site.updateOne(
      { siteId, 'pages.pageId': pageId },
      { $set: { 'pages.$.seo': seo } }
    );
  } catch (err) {
    console.error('[mongoStore.savePageSeo] Error:', err.message);
    throw err;
  }
}
