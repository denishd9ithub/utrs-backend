/**
 * Sync scheduler: runs HyperGuest sync every 1 minute (temporary test cadence)
 * Enable via ENABLE_SYNC_SCHEDULER=true
 * Optional override for testing:
 *   SYNC_INTERVAL_MS=60000
 */
import { config } from '../config/index.js';
import { syncPartner } from '../services/syncService.js';

const DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const rawInterval = Number(process.env.SYNC_INTERVAL_MS);
const INTERVAL_MS = Number.isFinite(rawInterval) && rawInterval >= 5000
  ? rawInterval
  : DEFAULT_INTERVAL_MS;

let isRunning = false;

async function runSync() {
  if (isRunning) {
    console.log('[SyncScheduler] Skipping - previous sync still running');
    return;
  }
  isRunning = true;
  try {
    const today = new Date().toISOString().slice(0, 10);
    const future = new Date();
    future.setDate(future.getDate() + 30);
    const result = await syncPartner('hyperguest', {
      checkIn: today,
      checkOut: future.toISOString().slice(0, 10),
    });
    console.log('[SyncScheduler] HyperGuest sync done:', result);
  } catch (err) {
    console.error('[SyncScheduler] Sync failed:', err?.message || err);
  } finally {
    isRunning = false;
  }
}

export function startSyncScheduler() {
  if (process.env.ENABLE_SYNC_SCHEDULER !== 'true') return;

  console.log('[SyncScheduler] Starting (every 1 min)');
  runSync();
  setInterval(runSync, INTERVAL_MS);
}
