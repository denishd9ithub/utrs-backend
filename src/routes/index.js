
import { Router } from 'express';
import authRoutes from './auth.js';
import villaRoutes from './villas.js';
import searchRoutes from './search.js';
import bookingRoutes from './bookings.js';
import guestRoutes from './guests.js';
import partnerRoutes from './partners.js';
import pricingRoutes from './pricing.js';
import whatsappRoutes from './whatsapp.js';
import adminRoutes from './admin.js';
import hyperguestRoutes from './hyperguest.js';

const router = Router();

router.use('/auth', authRoutes);
router.use('/guests', guestRoutes);
router.use('/hyperguest', hyperguestRoutes);
router.use('/villas', villaRoutes);
router.use('/search', searchRoutes);
router.use('/bookings', bookingRoutes);
router.use('/partners', partnerRoutes);
router.use('/pricing', pricingRoutes);
router.use('/whatsapp', whatsappRoutes);
router.use('/admin', adminRoutes);

export default router;                                                                                                      
