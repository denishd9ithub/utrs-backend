import { Router } from 'express';
import * as whatsappController from '../controllers/whatsappController.js';

const router = Router();

// GET: Webhook verification (POST handled at app level with raw body)
router.get('/', whatsappController.verify);

export default router;
