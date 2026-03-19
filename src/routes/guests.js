import { Router } from 'express';
import * as guestController from '../controllers/guestController.js';
import { optionalAuth, requireAuth } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', optionalAuth, guestController.create);
router.get('/me', requireAuth, guestController.getMe);

export default router;
