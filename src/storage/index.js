// Storage adapter: selects MongoDB or filesystem based on MONGODB_URI env var

let store;

export async function getStore() {
  if (store) return store;

  if (process.env.MONGODB_URI) {
    const mongo = await import('./mongoStore.js');
    await mongo.connect();
    store = mongo;
  } else {
    store = await import('./fileStore.js');
  }

  return store;
}

// Proxy all store methods so callers can import once
// Lazy-initialized on first call
const methods = [
  'ensureSiteDir', 'saveMeta', 'getMeta', 'saveTemplate', 'getTemplate',
  'saveContent', 'getContent', 'listVersions', 'getVersion',
  'siteExists', 'listAllSites', 'deleteSite', 'updateMeta',
  'getSetting', 'setSetting', 'getAllSettings',
  'saveSeo', 'getSeo', 'saveStyles', 'getStyles',
  // Multi-page methods
  'getPages', 'getPage', 'getIndexPage', 'addPage', 'updatePage', 'deletePage',
  'getPageContent', 'savePageContent', 'getPageTemplate',
  'getPageStyles', 'savePageStyles', 'getPageSeo', 'savePageSeo',
];

const proxyStore = {};

for (const method of methods) {
  proxyStore[method] = async (...args) => {
    const s = await getStore();
    return s[method](...args);
  };
}

export const {
  ensureSiteDir, saveMeta, getMeta, saveTemplate, getTemplate,
  saveContent, getContent, listVersions, getVersion,
  siteExists, listAllSites, deleteSite, updateMeta,
  getSetting, setSetting, getAllSettings,
  saveSeo, getSeo, saveStyles, getStyles,
  getPages, getPage, getIndexPage, addPage, updatePage, deletePage,
  getPageContent, savePageContent, getPageTemplate,
  getPageStyles, savePageStyles, getPageSeo, savePageSeo,
} = proxyStore;
