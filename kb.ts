import type {
  Classification, Course, PolicyRow, Teacher, KnowledgeBase, SelectedKnowledge,
} from '@/swh/types';

const STOP = new Set([
  'em', 'mình', 'ạ', 'có', 'không', 'ko', 'là', 'cho', 'hỏi', 'của',
  'bên', 'được', 'dạ', 'về', 'thì', 'và', 'nha', 'ad', 'cần', 'với',
  'minh', 'co', 'khong', 'la', 'hoi', 'cua', 'ben', 'duoc', 'da', 've', 'thi', 'va', 'can',
  'dung',
]);
export function normalizeVietnamese(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/đ/gu, 'd');
}
function tokens(s: string): string[] {
  return (normalizeVietnamese(s).match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter((t) => t.length > 1 && !STOP.has(t));
}
function overlap(a: string[], b: Set<string>): number {
  return a.reduce((n, t) => n + (b.has(t) ? 1 : 0), 0);
}
function textIncludesAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

const ALL_COURSE_INTENTS = new Set<string>([
  'ask_price', 'ask_schedule', 'class_info', 'course_consulting', 'placement_test', 'trial_class', 'promo',
]);

// Vietnamese teacher titles that precede a name ("cô Dung", "Miss Lym", "giáo viên Quỳnh").
const TEACHER_TITLE = '(?:co|thay|miss|mr|ms|gv|co giao|thay giao|giao vien|tro giang)';

// Match teachers referenced in a message — by the classifier's teacher_name entity,
// by full name appearing in the text, or by a titled given/family name token.
export function matchTeachers(text: string, teacherName: string | undefined, teachers: Teacher[]): Teacher[] {
  const hay = ` ${normalizeVietnamese(text)} `;
  const textToks = new Set(tokens(text));
  const needle = teacherName ? normalizeVietnamese(teacherName).trim() : undefined;
  const needleToks = needle ? needle.split(/\s+/).filter((p) => p.length > 1) : [];
  return teachers.filter((t) => {
    const full = normalizeVietnamese(t.name);
    if (needle && (full.includes(needle) || needle.includes(full))) return true;
    if (hay.includes(full)) return true;
    const toks = full.split(/\s+/).filter((p) => p.length > 1);
    return toks.some(
      (p) =>
        needleToks.includes(p) ||
        textToks.has(p) ||
        new RegExp(`${TEACHER_TITLE}\\s+(?:[\\p{L}]+\\s+)?${p}(?![\\p{L}])`, 'u').test(hay),
    );
  });
}

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
  if (courses.length === 0) {
    const hay = normalizeVietnamese(text);
    const mentionedCourse = textIncludesAny(hay, ['ipa', 'phat am', 'giao tiep', 'ngu phap', 'video', '1 1']);
    if (mentionedCourse) {
      courses = kb.courses.filter((co) => {
        const blob = normalizeVietnamese([
          co.slug, co.name, co.helps_with, co.good_for, co.entry_level, co.curriculum, co.formats,
        ].filter(Boolean).join(' '));
        return (
          (hay.includes('ipa') && blob.includes('ipa')) ||
          (hay.includes('phat am') && blob.includes('phat am')) ||
          (hay.includes('giao tiep') && blob.includes('giao tiep')) ||
          (hay.includes('ngu phap') && blob.includes('ngu phap')) ||
          (hay.includes('video') && blob.includes('video')) ||
          (hay.includes('1 1') && blob.includes('1 1'))
        );
      });
    }
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

  // Teachers: match by name; for teacher_info with no specific name, return all.
  const allTeachers = kb.teachers ?? [];
  let teachers: Teacher[] = matchTeachers(text, c.entities.teacher_name, allTeachers);
  const hay = normalizeVietnamese(text);
  if (textIncludesAny(hay, ['ipa', 'phat am', 'giao tiep', 'ngu phap'])) {
    const classMatches = allTeachers.filter((t) => {
      const blob = normalizeVietnamese([
        ...t.teaches,
        ...t.classes.flatMap((cl) => [cl.code, cl.course]),
      ].filter(Boolean).join(' '));
      return (
        (hay.includes('ipa') && blob.includes('ipa')) ||
        (hay.includes('phat am') && blob.includes('phat am')) ||
        (hay.includes('giao tiep') && blob.includes('giao tiep')) ||
        (hay.includes('ngu phap') && blob.includes('ngu phap'))
      );
    });
    teachers = [...teachers, ...classMatches.filter((t) => !teachers.some((existing) => existing.name === t.name))];
  }
  // Match by class code too (e.g. "thông tin lớp OMH19"). Codes are stored on
  // each teacher's classes; only treat code-like tokens (no spaces, len>=4) as
  // lookups so a stray "1-1" can't false-match.
  const codeMatches = allTeachers.filter((t) =>
    t.classes.some((cl) => {
      const code = normalizeVietnamese(cl.code);
      return /^[a-z0-9+]{4,}$/u.test(code) && hay.includes(code);
    }),
  );
  teachers = [...teachers, ...codeMatches.filter((t) => !teachers.some((existing) => existing.name === t.name))];
  if (c.intent === 'teacher_info' && teachers.length === 0) teachers = allTeachers;
  teachers.forEach((t) => refs.push(`teacher:${t.name}`));
  if (c.intent === 'teacher_info' || teachers.length > 0) {
    const link = kb.assets.find((a) => a.key === 'link_teacher_info');
    if (link) refs.push(`asset:${link.key}`);
  }

  return { courses, faqs, policies, teachers, refs };
}
