import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import type { Course, PolicyRow, Asset } from './types';
import { loadJson, parseFaqs } from './kb-memory';

config({ path: '.env.local' });

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  return createClient(url, key);
}

async function main() {
  const db = admin();
  const courses = loadJson<Course[]>('courses.json');
  const policies = loadJson<PolicyRow[]>('policies.json');
  const assets = loadJson<Asset[]>('assets.json');
  const faqs = parseFaqs();

  const upserts: ReadonlyArray<readonly [string, object[], string]> = [
    ['swh_courses', courses, 'slug'],
    ['swh_policies', policies, 'topic'],
    ['swh_assets', assets, 'key'],
  ];
  for (const [table, rows, conflict] of upserts) {
    const { error } = await db.from(table).upsert(rows, { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`upserted ${rows.length} -> ${table}`);
  }

  // FAQs have no natural unique key: replace-all.
  await db.from('swh_faqs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: faqErr } = await db.from('swh_faqs').insert(faqs);
  if (faqErr) throw new Error(`swh_faqs: ${faqErr.message}`);
  console.log(`inserted ${faqs.length} -> swh_faqs`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
