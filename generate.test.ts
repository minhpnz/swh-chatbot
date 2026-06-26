import { describe, it, expect } from 'vitest';
import { buildGeneratePrompt } from '@/swh/generate';
import type { SelectedKnowledge, Decision } from '@/swh/types';

const sel: SelectedKnowledge = {
  courses: [{ slug: 'ngu-phap-can-ban', name: 'Ngữ pháp căn bản', good_for: 'mất gốc' }],
  faqs: [{ intent_group: 'Ưu đãi', representative_q: 'ưu đãi?', variants: [], answer: 'giảm 50k' }],
  policies: [{ topic: 'bao_luu', risk_level: 'low', public_answer: 'hông có bảo lưu', allowed_action: 'answer', requires_human: false }],
  refs: [],
};

describe('buildGeneratePrompt', () => {
  it('includes persona, selected KB, and the action directive', () => {
    const p = buildGeneratePrompt(sel, 'answer' as Decision, ['https://forms.gle/ABC']);
    expect(p).toContain('SpeakwithHang');
    expect(p).toContain('Ngữ pháp căn bản');
    expect(p).toContain('giảm 50k');
    expect(p).toContain('hông có bảo lưu');
    expect(p).toContain('https://forms.gle/ABC');
  });

  it('tells the model to ask exactly one question when clarifying', () => {
    expect(buildGeneratePrompt(sel, 'clarify' as Decision, [])).toContain('đúng 1 câu');
  });
});
