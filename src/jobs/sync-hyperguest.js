/**
 * ETL Sync Job: HyperGuest
 * Run: npm run sync:hyperguest
 */
import 'dotenv/config';
import { syncPartner } from '../services/syncService.js';

async function main() {
  console.log('[Sync] Starting HyperGuest sync...');
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date();
  future.setDate(future.getDate() + 60);
  const result = await syncPartner('hyperguest', {
    checkIn: today,
    checkOut: future.toISOString().slice(0, 10),
  });
  console.log('[Sync] Done:', result);
}
    
main().catch((e) => {
  console.error('[Sync] Failed:', e);
  process.exit(1);
});

