/**
 * ETL Sync Job: All Partners
 * Run: npm run sync:all
 * Target: Inventory sync lag <= 15 minutes
 */
import 'dotenv/config';
import { syncPartner } from '../services/syncService.js';

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date();
  future.setDate(future.getDate() + 60);
  const options = { checkIn: today, checkOut: future.toISOString().slice(0, 10) };

  const partners = ['hyperguest', 'roibos'];
  for (const code of partners) {
    console.log(`[Sync] Starting ${code}...`);
    try {
      const result = await syncPartner(code, options);
      console.log(`[Sync] ${code} done:`, result);
    } catch (e) {
      console.error(`[Sync] ${code} failed:`, e.message);
    }
  }
}

main().catch((e) => {
  console.error('[Sync] Failed:', e);
  process.exit(1);
});
