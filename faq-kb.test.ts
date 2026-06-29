import { describe, it, expect } from 'vitest';
import { loadKnowledgeBaseFromFiles } from '@/swh/kb-memory';
import { selectKnowledge } from '@/swh/kb';
import { buildGeneratePrompt } from '@/swh/generate';
import type { Classification, KnowledgeBase } from '@/swh/types';

// Grounds the FAQ knowledge base (swh_data "SWH_FAQ_KnowledgeBase_Reply_Full" →
// seed-data/faq.csv → swh_faqs). For an FAQ question, selectKnowledge must
// retrieve the right FAQ so its canned answer reaches the prompt — the LLM can
// only reply "đúng như FAQ" if the FAQ is actually in front of it. Uses the REAL
// faq.csv via parseFaqs(), same path the seed uses.
const kb: KnowledgeBase = loadKnowledgeBaseFromFiles();
const C = (intent: Classification['intent'] = 'class_info'): Classification => ({ intent, entities: {}, confidence: 0.8 });

function promptFor(text: string, intent?: Classification['intent']): string {
  return buildGeneratePrompt(selectKnowledge(C(intent), text, kb), 'answer', []);
}

describe('FAQ data integrity: every FAQ is retrievable by its representative question', () => {
  it('selectKnowledge returns the FAQ when queried with its own representative_q', () => {
    const missing: string[] = [];
    for (const f of kb.faqs) {
      const sel = selectKnowledge(C(), f.representative_q, kb);
      if (!sel.faqs.includes(f)) missing.push(f.representative_q);
    }
    expect(missing).toEqual([]);
  });

  it('loaded the FAQ csv (sanity: non-trivial number of FAQs with answers)', () => {
    expect(kb.faqs.length).toBeGreaterThanOrEqual(20);
    expect(kb.faqs.every((f) => f.answer.length > 0)).toBe(true);
  });
});

describe('FAQ grounding: real user phrasings retrieve the correct canned answer', () => {
  // { a real variant/paraphrase from faq.csv : a distinctive substring of its answer }
  const cases: { q: string; answerHas: string; intent?: Classification['intent'] }[] = [
    { q: 'Lớp học online hay offline, địa chỉ ở đâu ạ?', answerHas: 'Kỳ Đồng' },
    { q: 'Lớp bao nhiêu học viên ạ', answerHas: '10-12' },
    { q: 'có ưu đãi cho học sinh sinh viên gì k chị', answerHas: 'Giảm 50k', intent: 'promo' },
    { q: 'Nếu mà nghỉ học thì có được học bù không ạ', answerHas: 'không có chính sách học bù', intent: 'policy_question' },
    { q: 'trong quá trình học mà cảm thấy ko hiệu quả thì có được hoàn tiền ko ạ', answerHas: 'không có chính sách bảo lưu', intent: 'policy_question' },
    { q: 'Dạ mình đăng ký lớp Online rồi thì sau đó có thể chuyển qua lớp Offline được không ạ', answerHas: 'chuyển sang lớp khác', intent: 'policy_question' },
    { q: 'Bên bạn có nhận dạy TOEIC/IELTS không ạ?', answerHas: '3 lộ trình' },
    { q: 'Lớp Phát âm & Giao tiếp cơ bản có dạy ngữ pháp không?', answerHas: 'hăm có dạy về ngữ pháp', intent: 'course_consulting' },
    { q: 'Học phí bên SpeakwithHang sẽ đóng như thế nào?', answerHas: 'cọc 1 chẹo', intent: 'ask_price' },
    { q: 'Mình có thể đăng kí học song song lớp Ngữ pháp + Phát âm & Giao tiếp không ạ?', answerHas: 'chỉ nên học 1 khoá', intent: 'course_consulting' },
    { q: 'Bên mình còn tuyển Trợ giảng không ạ', answerHas: 'Trợ giảng', intent: 'recruitment' },
    { q: 'Tại sao các lớp/giáo viên lại có các mức học phí khác nhau', answerHas: 'Founder Thanh Hằng', intent: 'ask_price' },
    { q: 'Lịch khai giảng có đúng với lịch dự kiến ban đầu hong ạ', answerHas: 'chênh lệch', intent: 'ask_schedule' },
    { q: 'Bên mình có học thử/demo không ạ?', answerHas: 'video record', intent: 'trial_class' },
    { q: 'Trong khoá học mình có được sửa bài kỹ không ạ?', answerHas: 'Short Clip' },
  ];

  for (const { q, answerHas, intent } of cases) {
    it(`"${q.slice(0, 48)}…" → prompt carries: "${answerHas}"`, () => {
      expect(promptFor(q, intent)).toContain(answerHas);
    });
  }
});
