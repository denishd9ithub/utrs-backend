import { Router } from 'express';
import * as partnerController from '../controllers/partnerController.js';

const router = Router();

router.get('/', partnerController.list);
router.get('/:id', partnerController.get);

export default router;
