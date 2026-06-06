import { Router } from 'express';
import { asyncHandler } from '../utils/asyncHandler.js';
import { requireOwner, requireSiteAccess } from '../middleware/auth.js';
import * as ctrl from '../controllers/sites.js';

const router = Router();

router.get('/', requireOwner, asyncHandler(ctrl.listSites));
router.post('/ingest', requireOwner, asyncHandler(ctrl.ingestSite));
router.get('/:siteId', requireSiteAccess, asyncHandler(ctrl.getSite));
router.get('/:siteId/content', requireSiteAccess, asyncHandler(ctrl.getContent));
router.put('/:siteId/content', requireSiteAccess, asyncHandler(ctrl.updateContent));
router.get('/:siteId/versions', requireSiteAccess, asyncHandler(ctrl.listVersions));
router.post('/:siteId/rollback/:versionId', requireSiteAccess, asyncHandler(ctrl.rollback));
router.get('/:siteId/preview', requireSiteAccess, asyncHandler(ctrl.preview));
router.get('/:siteId/render', requireSiteAccess, asyncHandler(ctrl.render));
router.delete('/:siteId', requireOwner, asyncHandler(ctrl.deleteSite));
router.put('/:siteId/settings', requireOwner, asyncHandler(ctrl.updateSettings));
router.post('/:siteId/password', requireOwner, asyncHandler(ctrl.setClientPassword));

export default router;
