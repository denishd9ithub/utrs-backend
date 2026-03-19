import { Router } from 'express';
import * as pricingController from '../controllers/pricingController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/admin/flags', requireAuth, requireRole('admin', 'ops'), pricingController.getFlagged);
router.get('/:villaId', pricingController.getVillaPricing);

export default router;
