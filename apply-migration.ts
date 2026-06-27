import { config } from 'dotenv';
import pg from 'pg';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

config({ path: '.env.local' });

function pgUrl(): string {
  const raw = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!raw) throw new Error('Missing POSTGRES_URL');
  return raw.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}

async function main() {
  const file = process.argv[2];
  if (!file) throw new Error('usage: tsx swh/apply-migration.ts <path-to-sql>');
  const sql = readFileSync(resolve(file), 'utf8');
  const client = new pg.Client({ connectionString: pgUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query(sql);
  await client.end();
  console.log(`applied ${file}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
