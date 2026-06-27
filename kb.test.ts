import { describe, it, expect } from 'vitest';
import { selectKnowledge } from '@/swh/kb';
import type { KnowledgeBase, Classification } from '@/swh/types';

const kb: KnowledgeBase = {
  courses: [
    { slug: 'ngu-phap-can-ban', name: 'Ngữ pháp căn bản', good_for: 'mất gốc' },
    { slug: 'phat-am-giao-tiep', name: 'Phát âm và Giao tiếp cơ bản', good_for: 'đã có nền' },
    { slug: 'phat-am-plus', name: 'Phát âm plus', good_for: 'căn bản' },
  ],
  faqs: [
    { intent_group: 'Học thử', representative_q: 'Bên mình có học thử không ạ?', variants: ['có học thử ko'], answer: 'Hiện chưa có lớp học thử...' },
    { intent_group: 'Ưu đãi', representative_q: 'Hiện có ưu đãi gì không ạ?', variants: ['giảm giá'], answer: 'Đang có giảm 50k...' },
  ],
  policies: [
    { topic: 'bao_luu', risk_level: 'low', public_answer: 'Hông có bảo lưu', allowed_action: 'answer', requires_human: false },
  ],
  assets: [
    { type: 'link', key: 'link_teacher_info', label: 'Hồ sơ giáo viên', value: 'https://s.net.vn/EjyT', when_to_use: 'Khách hỏi về giáo viên' },
  ],
  teachers: [
    {
      name: 'Phương Dung', tag: '2k2', role: 'Giáo viên',
      teaches: ['Lớp IPA chuyên sâu'],
      classes: [{ code: 'IPA+L2', course: 'Lớp IPA chuyên sâu', start: 'Thứ 4, 5/8', price: '3.200.000đ', format: 'ONL' }],
    },
    {
      name: 'Lym Quỳnh', tag: '90', role: 'Giáo viên',
      teaches: ['Ngữ pháp căn bản'],
      classes: [{ code: 'GLL4', course: 'Lớp Ngữ pháp căn bản', price: '6.900.000đ', format: 'ONL' }],
    },
  ],
};

describe('selectKnowledge', () => {
  it('returns matching course by entity name', () => {
    const c: Classification = { intent: 'course_consulting', entities: { course_name: 'giao tiếp' }, confidence: 0.9 };
    const sel = selectKnowledge(c, 'em muốn học giao tiếp', kb);
    expect(sel.courses.map((x) => x.slug)).toContain('phat-am-giao-tiep');
    expect(sel.refs.length).toBeGreaterThan(0);
  });

  it('includes the policy row for a policy_question by topic', () => {
    const c: Classification = { intent: 'policy_question', entities: { policy_topic: 'bao_luu' }, confidence: 0.9 };
    const sel = selectKnowledge(c, 'có bảo lưu không', kb);
    expect(sel.policies.map((p) => p.topic)).toContain('bao_luu');
  });

  it('matches a FAQ by keyword overlap', () => {
    const c: Classification = { intent: 'trial_class', entities: {}, confidence: 0.8 };
    const sel = selectKnowledge(c, 'cho em hỏi có học thử không', kb);
    expect(sel.faqs.some((f) => f.intent_group === 'Học thử')).toBe(true);
  });

  it('selects a teacher by name mentioned in the message', () => {
    const c: Classification = { intent: 'teacher_info', entities: {}, confidence: 0.9 };
    const sel = selectKnowledge(c, 'hiện tại giáo viên Phương Dung đang dạy lớp nào', kb);
    expect(sel.teachers.map((t) => t.name)).toContain('Phương Dung');
    expect(sel.teachers.map((t) => t.name)).not.toContain('Lym Quỳnh');
    expect(sel.refs).toContain('teacher:Phương Dung');
  });

  it('selects a teacher by the classifier teacher_name entity', () => {
    const c: Classification = { intent: 'teacher_info', entities: { teacher_name: 'Lym Quỳnh' }, confidence: 0.9 };
    const sel = selectKnowledge(c, 'cô Lym dạy lớp gì vậy ạ', kb);
    expect(sel.teachers.map((t) => t.name)).toContain('Lym Quỳnh');
  });

  it('includes the teacher-info link ref for any teacher_info question', () => {
    const c: Classification = { intent: 'teacher_info', entities: {}, confidence: 0.9 };
    const sel = selectKnowledge(c, 'trung tâm có những giáo viên nào', kb);
    expect(sel.refs).toContain('asset:link_teacher_info');
    expect(sel.teachers.length).toBeGreaterThan(0);
  });
});
