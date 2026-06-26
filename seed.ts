import { config } from 'dotenv';
import pg from 'pg';
import type { Course, PolicyRow, Asset } from './types';
import { loadJson, parseFaqs } from './kb-memory';

config({ path: '.env.local' });

// Uses pg directly (not supabase-js) so it runs reliably in plain Node,
// where supabase-js's Realtime client needs a global WebSocket.
function pgUrl(): string {
  const raw = process.env.POSTGRES_URL_NON_POOLING ?? process.env.POSTGRES_URL;
  if (!raw) throw new Error('Missing POSTGRES_URL_NON_POOLING / POSTGRES_URL');
  return raw.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');
}

async function main() {
  const client = new pg.Client({ connectionString: pgUrl(), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const courses = loadJson<Course[]>('courses.json');
  for (const c of courses) {
    await client.query(
      `insert into swh_courses (slug,name,helps_with,good_for,entry_level,curriculum,formats,promo,reference_materials)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       on conflict (slug) do update set name=excluded.name, helps_with=excluded.helps_with, good_for=excluded.good_for,
         entry_level=excluded.entry_level, curriculum=excluded.curriculum, formats=excluded.formats,
         promo=excluded.promo, reference_materials=excluded.reference_materials, updated_at=now()`,
      [c.slug, c.name, c.helps_with, c.good_for, c.entry_level, c.curriculum, c.formats, c.promo, c.reference_materials],
    );
  }
  console.log(`upserted ${courses.length} -> swh_courses`);

  const policies = loadJson<PolicyRow[]>('policies.json');
  for (const p of policies) {
    await client.query(
      `insert into swh_policies (topic,risk_level,public_answer,allowed_action,requires_human)
       values ($1,$2,$3,$4,$5)
       on conflict (topic) do update set risk_level=excluded.risk_level, public_answer=excluded.public_answer,
         allowed_action=excluded.allowed_action, requires_human=excluded.requires_human, updated_at=now()`,
      [p.topic, p.risk_level, p.public_answer, p.allowed_action, p.requires_human],
    );
  }
  console.log(`upserted ${policies.length} -> swh_policies`);

  const assets = loadJson<Asset[]>('assets.json');
  for (const a of assets) {
    await client.query(
      `insert into swh_assets (type,key,label,value,when_to_use)
       values ($1,$2,$3,$4,$5)
       on conflict (key) do update set type=excluded.type, label=excluded.label, value=excluded.value,
         when_to_use=excluded.when_to_use, updated_at=now()`,
      [a.type, a.key, a.label ?? null, a.value, a.when_to_use ?? null],
    );
  }
  console.log(`upserted ${assets.length} -> swh_assets`);

  const faqs = parseFaqs();
  await client.query('delete from swh_faqs');
  for (const f of faqs) {
    await client.query(
      'insert into swh_faqs (intent_group,representative_q,variants,answer,attachment) values ($1,$2,$3,$4,$5)',
      [f.intent_group, f.representative_q, f.variants, f.answer, f.attachment ?? null],
    );
  }
  console.log(`inserted ${faqs.length} -> swh_faqs`);

  await client.end();
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
