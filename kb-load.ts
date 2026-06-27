import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Course, Faq, PolicyRow, Asset, Teacher, KnowledgeBase } from '@/swh/types';

// Server-only: loads the active knowledge base from Supabase.
// Kept separate from kb.ts so the pure selectKnowledge() (and its tests)
// never transitively import `server-only`.
export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  const db = createAdminClient();
  const [c, f, p, a, t] = await Promise.all([
    db.from('swh_courses').select('*').eq('status', 'active'),
    db.from('swh_faqs').select('*').eq('status', 'active'),
    db.from('swh_policies').select('*').eq('status', 'active'),
    db.from('swh_assets').select('*').eq('status', 'active'),
    db.from('swh_teachers').select('*').eq('status', 'active'),
  ]);
  return {
    courses: (c.data ?? []) as Course[],
    faqs: (f.data ?? []) as Faq[],
    policies: (p.data ?? []) as PolicyRow[],
    assets: (a.data ?? []) as Asset[],
    teachers: (t.data ?? []) as Teacher[],
  };
}
