import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectKnowledge } from '@/swh/kb';
import { buildGeneratePrompt } from '@/swh/generate';
import { normalizeVietnamese } from '@/swh/kb';
import type { KnowledgeBase, Classification, Teacher, Course, Asset } from '@/swh/types';

// These tests load the REAL seed-data — the exact source that gets seeded into
// Supabase (swh_teachers / swh_courses / swh_assets). They guarantee that for a
// question about DB-stored info, selectKnowledge picks the right row AND
// buildGeneratePrompt grounds the LLM with the correct values. The LLM can only
// answer "đúng như DB" if these facts actually reach its prompt.
const SEED = join(process.cwd(), 'swh', 'seed-data');
const load = <T>(f: string): T => JSON.parse(readFileSync(join(SEED, f), 'utf8')) as T;

const teachers = load<Teacher[]>('teachers.json');
const courses = load<Course[]>('courses.json');
const assets = load<Asset[]>('assets.json');
const kb: KnowledgeBase = { courses, faqs: [], policies: [], assets, teachers };

const cls = (over: Partial<Classification> = {}): Classification => ({
  intent: 'teacher_info', entities: {}, confidence: 0.9, ...over,
});

function prompt(text: string, c: Partial<Classification> = {}): string {
  return buildGeneratePrompt(selectKnowledge(cls(c), text, kb), 'answer', []);
}

describe('DB-backed answers: teacher & class facts reach the prompt', () => {
  const cases: { q: string; teacher: string; must: string[]; c?: Partial<Classification> }[] = [
    { q: 'giáo viên Phương Dung dạy lớp nào ạ', teacher: 'Phương Dung', must: ['Phương Dung', 'IPA+L2', '3.200.000đ', 'sinh năm 2002'] },
    { q: 'cô Lym Quỳnh sinh năm mấy', teacher: 'Lym Quỳnh', must: ['Lym Quỳnh', 'sinh năm 1990'] },
    { q: 'Thanh Hằng bao nhiêu tuổi', teacher: 'Thanh Hằng', must: ['Thanh Hằng', 'sinh năm 1999'] },
    { q: 'quê của cô Búp Loan ở đâu', teacher: 'Búp Loan', must: ['Búp Loan', 'Quảng Ngãi'] },
    { q: 'cô Anh Thư trình độ thế nào', teacher: 'Anh Thư', must: ['Anh Thư', 'TOEIC 900'] },
    { q: 'thông tin lớp OMH19', teacher: 'Thanh Hằng', must: ['OMH19', '7.900.000đ'], c: { intent: 'class_info', confidence: 0.8 } },
    { q: 'lớp GLL4 học phí bao nhiêu', teacher: 'Lym Quỳnh', must: ['GLL4', '6.900.000đ'], c: { intent: 'ask_price', confidence: 0.8 } },
    { q: 'lớp OFFT3 khai giảng khi nào', teacher: 'Anh Thư', must: ['OFFT3', 'Thứ 3, 11/8'], c: { intent: 'ask_schedule', confidence: 0.8 } },
    { q: 'lớp IPA+L2 của Phương Dung mấy giờ', teacher: 'Phương Dung', must: ['IPA+L2', '18h30-20h00'], c: { intent: 'ask_schedule', confidence: 0.8 } },
  ];
  for (const { q, teacher, must, c } of cases) {
    it(`"${q}" selects ${teacher} and grounds DB facts`, () => {
      const sel = selectKnowledge(cls(c), q, kb);
      expect(sel.teachers.map((t) => t.name)).toContain(teacher);
      const p = buildGeneratePrompt(sel, 'answer', []);
      for (const m of must) expect(p).toContain(m);
    });
  }
});

describe('DB integrity: every row in the DB is reachable', () => {
  it('every teacher is found by full name', () => {
    for (const t of teachers) {
      const sel = selectKnowledge(cls(), `cho mình thông tin về ${t.name}`, kb);
      expect(sel.teachers.map((x) => x.name)).toContain(t.name);
    }
  });

  it('every code-like class code resolves to its owning teacher', () => {
    for (const t of teachers) {
      for (const c of t.classes) {
        const code = normalizeVietnamese(c.code);
        if (!/^[a-z0-9+]{4,}$/u.test(code)) continue; // skip non-code labels like "Kèm 1-1"
        const sel = selectKnowledge(cls({ intent: 'class_info', confidence: 0.8 }), `thông tin lớp ${c.code}`, kb);
        expect(sel.teachers.map((x) => x.name)).toContain(t.name);
      }
    }
  });

  it('every teacher with a birth_year exposes "sinh năm <year>" in the prompt', () => {
    for (const t of teachers) {
      if (!t.birth_year) continue;
      const p = prompt(`${t.name} sinh năm mấy`);
      expect(p).toContain(`sinh năm ${t.birth_year}`);
    }
  });

  it('every class price appears verbatim in the prompt when its teacher is asked', () => {
    for (const t of teachers) {
      if (t.classes.length === 0) continue;
      const p = prompt(`${t.name} đang dạy lớp nào, học phí bao nhiêu`);
      for (const c of t.classes) {
        if (c.price) expect(p).toContain(c.price);
      }
    }
  });

  it('every course is selectable by its own name', () => {
    for (const co of courses) {
      const sel = selectKnowledge(
        cls({ intent: 'course_consulting', entities: { course_name: co.name.toLowerCase() }, confidence: 0.9 }),
        co.name, kb,
      );
      expect(sel.courses.map((x) => x.slug)).toContain(co.slug);
    }
  });
});
