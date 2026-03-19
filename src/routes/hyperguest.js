import { Router } from 'express';
import * as hyperguestController from '../controllers/hyperguestController.js';

const router = Router();

router.get('/search', hyperguestController.search);
router.post('/book', hyperguestController.createBooking);
router.post('/pre-book', hyperguestController.preBook);
router.get('/booking/:bookingId', hyperguestController.getBooking);
router.post('/booking/list', hyperguestController.listBookings);
router.post('/booking/:bookingId/cancel', hyperguestController.cancelBooking);

export default router;                                                              
