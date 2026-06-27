import { describe, it, expect } from 'vitest';
import { runPipeline } from '@/swh/pipeline';
import type { LlmClient, KnowledgeBase, Classification } from '@/swh/types';

const kb: KnowledgeBase = {
  courses: [{ slug: 'phat-am-giao-tiep', name: 'Phát âm và Giao tiếp cơ bản', good_for: 'đã có nền' }],
  faqs: [{ intent_group: 'Ưu đãi', representative_q: 'ưu đãi?', variants: ['giảm giá'], answer: 'Đang có giảm 50k nha' }],
  policies: [
    { topic: 'bao_luu', risk_level: 'low', public_answer: 'Hông có bảo lưu nha', allowed_action: 'answer', requires_human: false },
    { topic: 'refund', risk_level: 'high', public_answer: 'x', allowed_action: 'escalate', requires_human: true },
  ],
  assets: [{ type: 'template', key: 'holding_refund', value: 'Tụi mình nhờ tư vấn viên hỗ trợ nha, để lại SĐT giúp nhé' }],
  teachers: [
    {
      name: 'Thanh Hằng', tag: 'Founder', role: 'Founder & Giáo viên',
      birth_year: 1999,
      profile_url: 'https://s.net.vn/EjyT',
      video_urls: ['https://drive.google.com/file/d/1a53hAW_eC01KohImnJYX0-Ae3PO0pKIx/view?usp=drive_link'],
      teaches: ['Phát âm & Giao tiếp'],
      classes: [{ code: 'OMH19', course: 'Lớp Giao tiếp Tiếng Anh & Phát âm IPA', price: '7.900.000đ' }],
    },
    {
      name: 'Phương Dung', tag: '2k2', role: 'Giáo viên',
      birth_year: 2002,
      teaches: ['Lớp IPA chuyên sâu'],
      classes: [{ code: 'IPA+L2', course: 'Lớp IPA chuyên sâu', price: '3.200.000đ' }],
    },
  ],
};

function fakeLlm(classification: Classification, reply: string): LlmClient {
  return { classify: async () => classification, complete: async () => reply };
}

describe('runPipeline', () => {
  it('answers a greeting', async () => {
    const llm = fakeLlm({ intent: 'greeting', entities: {}, confidence: 0.95 }, 'Hé lu, tụi mình là SwH nha!');
    const r = await runPipeline({ text: 'hi', history: [], kb }, llm);
    expect(r.decision).toBe('answer');
    expect(r.reply).toContain('SwH');
    expect(r.guardrail.ok).toBe(true);
  });

  it('escalates a personal refund request using the holding template (LLM not used)', async () => {
    const llm = fakeLlm({ intent: 'refund', entities: {}, confidence: 0.9 }, 'SHOULD_NOT_APPEAR');
    const r = await runPipeline({ text: 'em muốn hoàn tiền', history: [], kb }, llm);
    expect(r.decision).toBe('escalate');
    expect(r.reply).not.toContain('SHOULD_NOT_APPEAR');
    expect(r.escalation?.reason).toBe('refund');
  });

  it('downgrades to holding when the guardrail catches an invented price', async () => {
    const llm = fakeLlm({ intent: 'ask_price', entities: {}, confidence: 0.9 }, 'Lớp này chỉ 3.500.000đ thôi nha');
    const r = await runPipeline({ text: 'học phí bao nhiêu', history: [], kb }, llm);
    expect(r.guardrail.ok).toBe(false);
    expect(r.decision).toBe('holding');
    expect(r.escalation?.reason).toBe('guardrail');
  });

  it('extracts a lead from entities', async () => {
    const llm = fakeLlm({ intent: 'greeting', entities: { name: 'Vy', phone: '0900000000' }, confidence: 0.9 }, 'Dạ Vy ơi...');
    const r = await runPipeline({ text: 'mình tên Vy, sđt 0900000000', history: [], kb }, llm);
    expect(r.lead?.name).toBe('Vy');
    expect(r.lead?.phone).toBe('0900000000');
  });

  it('treats casual teacher age questions as teacher_info instead of price or escalation', async () => {
    const llm = fakeLlm(
      { intent: 'ask_price', entities: {}, confidence: 0.35 },
      'Thanh Hằng sinh năm 1999 nên hiện khoảng 26-27 tuổi tuỳ sinh nhật nha.',
    );
    const r = await runPipeline({ text: 'Hang bao nhieu tuoi', history: [], kb, alreadyClarified: true }, llm);
    expect(r.classification.intent).toBe('teacher_info');
    expect(r.decision).toBe('answer');
    expect(r.escalation).toBeUndefined();
    expect(r.guardrail.ok).toBe(true);
  });

  it('answers mixed IPA class, named teacher class, and age questions from structured data', async () => {
    const llm = fakeLlm(
      { intent: 'teacher_info', entities: {}, confidence: 0.9 },
      'Hiện có lớp IPA+L2 của Phương Dung, còn Thanh Hằng đang dạy OMH19. Thanh Hằng sinh năm 1999, khoảng 26-27 tuổi tuỳ sinh nhật nha.',
    );
    const r = await runPipeline({
      text: 'cho hỏi hiện tại có lớp ipa không và Hang có đang mở lớp gì không và Hang bao nhiêu tuổi',
      history: [],
      kb,
    }, llm);
    expect(r.decision).toBe('answer');
    expect(r.escalation).toBeUndefined();
    expect(r.guardrail.ok).toBe(true);
    expect(r.kb_refs).toEqual(expect.arrayContaining(['teacher:Thanh Hằng', 'teacher:Phương Dung']));
    expect(r.reply).not.toMatch(/SĐT|liên hệ lại|tư vấn thêm/u);
  });

  it.each([
    ['chị Hang sn bao nhiêu vậy ạ'],
    ['Thanh Hằng sinh năm nào á? em hỏi ngoài lề xíu'],
    ['Hằng mấy tuổi rồi nhỉ hehe'],
    ['Cho em hỏi vui: Hang là đời mấy vậy?'],
  ])('keeps casual teacher personal-info wording answerable: %s', async (text) => {
    const llm = fakeLlm(
      { intent: 'unknown', entities: {}, confidence: 0.2 },
      'Em cũng không biết nữa hehe.',
    );
    const r = await runPipeline({ text, history: [], kb, alreadyClarified: true }, llm);
    expect(r.classification.intent).toBe('teacher_info');
    expect(r.decision).toBe('answer');
    expect(r.escalation).toBeUndefined();
  });

  it('does not escalate casual low-confidence daily questions after a clarification', async () => {
    const llm = fakeLlm(
      { intent: 'unknown', entities: {}, confidence: 0.2 },
      'Em cũng không biết nữa hehe.',
    );
    const r = await runPipeline({ text: 'chị Hằng thích màu gì vậy', history: [], kb, alreadyClarified: true }, llm);
    expect(r.decision).toBe('answer');
    expect(r.escalation).toBeUndefined();
  });

  it.each([
    ['chị Hằng quê ở đâu vậy ạ, em hỏi chuyện ngoài lề thôi'],
    ['ngoài giờ dạy chị Hằng có hay livestream không ta?'],
    ['chị Hằng thích màu gì vậy\nem hỏi vui thôi chứ chưa cần tư vấn lớp'],
    ['Cô Lym có nghiêm không ạ? Em hơi rén nhưng hỏi vui trước hehe'],
    ['Đọc profile thấy chị Hằng dễ thương quá, chị có podcast hay blog cá nhân không?'],
  ])('answers casual daily/paragraph-style gaps without collecting contact: %s', async (text) => {
    const llm = fakeLlm(
      { intent: 'unknown', entities: {}, confidence: 0.18 },
      'Em cũng không biết nữa hehe.',
    );
    const r = await runPipeline({ text, history: [], kb, alreadyClarified: true }, llm);
    expect(r.decision).toBe('answer');
    expect(r.escalation).toBeUndefined();
    expect(r.reply).toContain('hehe');
  });

  it('still escalates critical KB topics that remain unknown after a clarification', async () => {
    const llm = fakeLlm({ intent: 'unknown', entities: {}, confidence: 0.2 }, 'SHOULD_NOT_APPEAR');
    const r = await runPipeline({ text: 'quy định chuyển lớp bên mình sao ạ', history: [], kb, alreadyClarified: true }, llm);
    expect(r.decision).toBe('escalate');
    expect(r.reply).not.toContain('SHOULD_NOT_APPEAR');
    expect(r.escalation?.reason).toBe('low_confidence');
  });

  it.each([
    ['cho em hỏi chính sách học bù nếu em nghỉ một buổi thì sao ạ?'],
    ['bên mình có quy định chuyển lớp sau khai giảng không'],
    ['lộ trình đầu ra của lớp giao tiếp cam kết như nào vậy'],
    ['em vắng 2 buổi liên tiếp thì make up được không ạ'],
    ['record lớp online giữ trong bao lâu, em đọc chưa thấy rõ'],
    ['học phí lớp offline đóng mấy đợt được không ạ'],
  ])('still escalates critical course/policy/rules gaps after clarification: %s', async (text) => {
    const llm = fakeLlm({ intent: 'unknown', entities: {}, confidence: 0.2 }, 'SHOULD_NOT_APPEAR');
    const r = await runPipeline({ text, history: [], kb, alreadyClarified: true }, llm);
    expect(r.decision).toBe('escalate');
    expect(r.reply).not.toContain('SHOULD_NOT_APPEAR');
    expect(r.escalation?.reason).toBe('low_confidence');
  });

  it.each([
    ['em chuyển khoản xong rồi nhưng muốn hỏi thêm lớp nào hợp'],
    ['trung tâm dạy tệ quá, có ai xử lý không'],
    ['em muốn hoàn cọc vì lịch bị trùng'],
    ['cho em gặp tư vấn viên trực tiếp với'],
  ])('keeps hard-risk paraphrases escalated even if the LLM misses them: %s', async (text) => {
    const llm = fakeLlm({ intent: 'greeting', entities: {}, confidence: 0.95 }, 'SHOULD_NOT_APPEAR');
    const r = await runPipeline({ text, history: [], kb }, llm);
    expect(r.decision).toBe('escalate');
    expect(r.reply).not.toContain('SHOULD_NOT_APPEAR');
    expect(r.escalation).toBeDefined();
  });
});
