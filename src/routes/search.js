import { Router } from 'express';
import * as searchController from '../controllers/searchController.js';

const router = Router();

router.post('/', searchController.search);

export default router;
