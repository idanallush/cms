import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireOwner, requireSiteAccess } from '../middleware/auth.js';
import * as ctrl from '../controllers/sites.js';

const router = Router();

function relaxCsp(req, res, next) {
  res.removeHeader('Content-Security-Policy');
  next();
}

// Global settings
router.get('/settings', requireOwner, asyncHandler(ctrl.getSettings));
router.post('/settings', requireOwner, asyncHandler(ctrl.saveGlobalSettings));

router.get('/', requireOwner, asyncHandler(ctrl.listSites));
router.post('/ingest', requireOwner, asyncHandler(ctrl.ingestSite));
router.get('/:siteId', requireSiteAccess, asyncHandler(ctrl.getSite));
router.get('/:siteId/content', requireSiteAccess, asyncHandler(ctrl.getContent));
router.put('/:siteId/content', requireSiteAccess, asyncHandler(ctrl.updateContent));
router.get('/:siteId/versions', requireSiteAccess, asyncHandler(ctrl.listVersions));
router.post('/:siteId/rollback/:versionId', requireSiteAccess, asyncHandler(ctrl.rollback));
router.get('/:siteId/preview', relaxCsp, requireSiteAccess, asyncHandler(ctrl.preview));
router.get('/:siteId/render', relaxCsp, requireSiteAccess, asyncHandler(ctrl.render));
router.get('/:siteId/export', requireSiteAccess, asyncHandler(ctrl.exportSite));
router.get('/:siteId/seo', requireSiteAccess, asyncHandler(ctrl.getSeo));
router.put('/:siteId/seo', requireSiteAccess, asyncHandler(ctrl.saveSeo));
router.get('/:siteId/styles', requireSiteAccess, asyncHandler(ctrl.getStyles));
router.put('/:siteId/styles', requireSiteAccess, asyncHandler(ctrl.saveStyles));
// Pages
router.get('/:siteId/pages', requireSiteAccess, asyncHandler(ctrl.listPages));
router.post('/:siteId/pages', requireOwner, asyncHandler(ctrl.createPage));
router.get('/:siteId/pages/:pageId', requireSiteAccess, asyncHandler(ctrl.getPageDetail));
router.delete('/:siteId/pages/:pageId', requireOwner, asyncHandler(ctrl.deletePageHandler));
router.get('/:siteId/pages/:pageId/content', requireSiteAccess, asyncHandler(ctrl.getPageContentHandler));
router.put('/:siteId/pages/:pageId/content', requireSiteAccess, asyncHandler(ctrl.updatePageContent));
router.get('/:siteId/pages/:pageId/render', relaxCsp, requireSiteAccess, asyncHandler(ctrl.renderPage));
router.get('/:siteId/pages/:pageId/styles', requireSiteAccess, asyncHandler(ctrl.getPageStylesHandler));
router.put('/:siteId/pages/:pageId/styles', requireSiteAccess, asyncHandler(ctrl.savePageStylesHandler));
router.get('/:siteId/pages/:pageId/seo', requireSiteAccess, asyncHandler(ctrl.getPageSeoHandler));
router.put('/:siteId/pages/:pageId/seo', requireSiteAccess, asyncHandler(ctrl.savePageSeoHandler));

router.delete('/:siteId', requireOwner, asyncHandler(ctrl.deleteSite));
router.put('/:siteId/settings', requireOwner, asyncHandler(ctrl.updateSettings));
router.post('/:siteId/password', requireOwner, asyncHandler(ctrl.setClientPassword));
router.post('/:siteId/access-token', requireOwner, asyncHandler(ctrl.generateAccessToken));

export default router;
