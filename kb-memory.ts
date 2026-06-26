import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import type { Course, Faq, PolicyRow, Asset, KnowledgeBase } from './types';

// In-memory KB loaded straight from the seed-data files (no Supabase).
// Used by the seed script and the live paraphrase eval.

export function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(resolve('swh/seed-data', file), 'utf8')) as T;
}

export function parseFaqs(): Faq[] {
  const csv = readFileSync(resolve('swh/seed-data/faq.csv'), 'utf8');
  const { data } = Papa.parse<string[]>(csv, { skipEmptyLines: true });
  return data
    .slice(1) // drop header
    .filter((r) => (r[0] ?? '').trim() && (r[3] ?? '').trim())
    .map((r) => ({
      intent_group: (r[0] ?? '').trim(),
      representative_q: (r[1] ?? '').trim(),
      variants: (r[2] ?? '').split('\n').map((v) => v.replace(/^[-•\s]+/, '').trim()).filter(Boolean),
      answer: (r[3] ?? '').trim(),
      attachment: (r[4] ?? '').trim() || undefined,
    }));
}

export function loadKnowledgeBaseFromFiles(): KnowledgeBase {
  return {
    courses: loadJson<Course[]>('courses.json'),
    policies: loadJson<PolicyRow[]>('policies.json'),
    assets: loadJson<Asset[]>('assets.json'),
    faqs: parseFaqs(),
  };
}
