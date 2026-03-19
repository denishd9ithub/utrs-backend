/**
 * ETL Sync Job: Roibos
 * Run: npm run sync:roibos
 */
import 'dotenv/config';
import { syncPartner } from '../services/syncService.js';

async function main() {
  console.log('[Sync] Starting Roibos sync...');
  const result = await syncPartner('roibos');
  console.log('[Sync] Done:', result);
}

main().catch((e) => {
  console.error('[Sync] Failed:', e);
  process.exit(1);
});
