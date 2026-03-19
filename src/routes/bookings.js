import { Router } from 'express';
import * as bookingController from '../controllers/bookingController.js';
import { optionalAuth, requireAuth, requireRole } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/', optionalAuth, bookingController.create);
router.get('/:id', bookingController.get);
router.post('/:id/create-order', bookingController.createOrder);
router.post('/:id/verify-payment', bookingController.verifyPayment);
router.patch('/:id/status', bookingController.updateStatus);
router.post('/:id/refund', requireAuth, requireRole('admin'), bookingController.refund);

export default router;                                              
