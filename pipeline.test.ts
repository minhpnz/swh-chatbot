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
  teachers: [],
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
});
