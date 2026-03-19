import { Router } from 'express';
import * as villaController from '../controllers/villaController.js';
import { requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

router.get('/', villaController.list);
router.get('/by-slug/:slug', villaController.getBySlug);
router.get('/:id', villaController.getById);
router.patch('/:id', requireAuth, requireRole('admin', 'ops'), villaController.update);
router.post('/:id/lock', requireAuth, requireRole('admin', 'ops'), villaController.lockFields);

export default router;
