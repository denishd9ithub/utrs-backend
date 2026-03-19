#!/usr/bin/env node
/**
 * Run all pending migrations against the database.
 * Uses DATABASE_URL from .env (Supabase: Project Settings > Database > Connection string)
 * Falls back to pooler URL if old db.*.supabase.co host fails (ENOTFOUND)
 */
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, '..', 'supabase', 'migrations');

function getPoolerUrl(databaseUrl) {
  const match = databaseUrl.match(/postgres(?:ql)?:\/\/([^:]+):([^@]+)@db\.([a-z0-9]+)\.supabase\.co:(\d+)\/(.+)/);
  if (!match) return null;
  const [, , password, projectRef, , dbName] = match;
  const region = process.env.SUPABASE_DB_REGION || 'ap-southeast-2';
  const encodedPassword = encodeURIComponent(decodeURIComponent(password));
  return [
    `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:5432/${dbName}`,
    `postgresql://postgres.${projectRef}:${encodedPassword}@aws-0-${region}.pooler.supabase.com:6543/${dbName}`,
  ];
}

async function main() {
  let databaseUrl = (process.env.DATABASE_POOLER_URL || process.env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    console.error('[Migrate] DATABASE_URL or DATABASE_POOLER_URL not set.');
    console.error('Add it to .env from Supabase: Project Settings > Database > Connection string (URI)');
    process.exit(1);
  }

  const usePoolerFirst = !!process.env.DATABASE_POOLER_URL;
  let client = new pg.Client({ connectionString: databaseUrl });

  try {
    try {
      await client.connect();
      console.log('[Migrate] Connected to database');
    } catch (connectErr) {
      const isDirectFail = connectErr.code === 'ENOTFOUND' && databaseUrl.includes('db.') && databaseUrl.includes('.supabase.co');
      const isTenantFail = connectErr.message?.includes('Tenant or user not found');
      if ((isDirectFail || isTenantFail) && !usePoolerFirst) {
        const poolerUrls = getPoolerUrl(databaseUrl);
        if (poolerUrls) {
          let lastErr = connectErr;
          for (const poolerUrl of poolerUrls) {
            try {
              console.log('[Migrate] Trying pooler...');
              await client.end().catch(() => {});
              client = new pg.Client({ connectionString: poolerUrl });
              await client.connect();
              console.log('[Migrate] Connected via pooler');
              lastErr = null;
              break;
            } catch (e) {
              lastErr = e;
            }
          }
          if (lastErr) {
            console.error('[Migrate] Pooler failed:', lastErr.message);
            console.error('');
            console.error('Copy the EXACT connection string from Supabase Dashboard:');
            console.error('  Project Settings > Database > Connection string');
            console.error('  Choose "URI" and copy the Session mode string');
            console.error('  Add to .env as: DATABASE_POOLER_URL=<paste-here>');
            throw lastErr;
          }
        } else {
          throw connectErr;
        }
      } else {
        throw connectErr;
      }
    }

    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY,
        executed_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    const { rows: applied } = await client.query('SELECT name FROM schema_migrations');
    const appliedSet = new Set(applied.map((r) => r.name));

    const files = fs
      .readdirSync(MIGRATIONS_DIR)
      .filter((f) => f.endsWith('.sql'))
      .sort();

    let run = 0;
    for (const file of files) {
      const name = file.replace(/\.sql$/, '');
      if (appliedSet.has(name)) {
        console.log(`[Migrate] Skip ${file} (already applied)`);
        continue;
      }

      const filePath = path.join(MIGRATIONS_DIR, file);
      const sql = fs.readFileSync(filePath, 'utf8');

      console.log(`[Migrate] Running ${file}...`);
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      run++;
      console.log(`[Migrate] Done ${file}`);
    }

    console.log(`[Migrate] Complete. ${run} migration(s) applied.`);
  } catch (err) {
    console.error('[Migrate] Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
