import type {
  Classification, Course, PolicyRow, KnowledgeBase, SelectedKnowledge,
} from '@/swh/types';

const STOP = new Set([
  'em', 'mình', 'ạ', 'có', 'không', 'ko', 'là', 'cho', 'hỏi', 'của',
  'bên', 'được', 'dạ', 'về', 'thì', 'và', 'nha', 'ad', 'cần', 'với',
]);
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}
function overlap(a: string[], b: Set<string>): number {
  return a.reduce((n, t) => n + (b.has(t) ? 1 : 0), 0);
}

const ALL_COURSE_INTENTS = new Set<string>([
  'ask_price', 'ask_schedule', 'class_info', 'course_consulting', 'placement_test', 'trial_class', 'promo',
]);

export function selectKnowledge(c: Classification, text: string, kb: KnowledgeBase): SelectedKnowledge {
  const refs: string[] = [];
  const qtokens = tokens(text);

  // Courses
  let courses: Course[] = [];
  const name = c.entities.course_name?.toLowerCase();
  if (name) {
    courses = kb.courses.filter((co) => {
      const head = co.slug.split('-')[0] ?? '';
      return co.name.toLowerCase().includes(name) || (head.length > 0 && name.includes(head));
    });
  }
  if (courses.length === 0 && ALL_COURSE_INTENTS.has(c.intent)) courses = kb.courses;
  courses.forEach((co) => refs.push(`course:${co.slug}`));

  // FAQs: top 4 by keyword overlap against representative_q + variants
  const scored = kb.faqs
    .map((f) => {
      const set = new Set(tokens([f.representative_q, ...f.variants].join(' ')));
      return { f, score: overlap(qtokens, set) };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 4);
  const faqs = scored.map((x) => x.f);
  faqs.forEach((f) => refs.push(`faq:${f.intent_group}:${f.representative_q.slice(0, 24)}`));

  // Policies: by explicit topic, or by public-answer overlap
  let policies: PolicyRow[] = [];
  const topic = c.entities.policy_topic;
  if (topic) policies = kb.policies.filter((p) => p.topic === topic);
  if (policies.length === 0 && (c.intent === 'policy_question' || c.intent === 'bao_luu')) {
    policies = kb.policies.filter(
      (p) => overlap(qtokens, new Set(tokens(p.public_answer))) > 0 || p.topic === 'bao_luu',
    );
  }
  policies.forEach((p) => refs.push(`policy:${p.topic}`));

  return { courses, faqs, policies, refs };
}
