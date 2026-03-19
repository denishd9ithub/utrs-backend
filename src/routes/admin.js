import { Router } from 'express';
import * as adminController from '../controllers/adminController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/margin-monitor', requireAuth, requireRole('admin', 'ops'), adminController.getMarginMonitor);

export default router;
