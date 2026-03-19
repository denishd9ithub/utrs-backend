import * as adminService from '../services/adminService.js';

export async function getMarginMonitor(req, res, next) {
  try {
    const data = await adminService.getMarginMonitor();
    res.json(data);
  } catch (err) {
    next(err);
  }
}
