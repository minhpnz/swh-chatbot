import { describe, it, expect } from 'vitest';
import {
  normalizePrice, extractPriceMentions, buildAllowedPriceSet, validateReply,
} from '@/swh/guardrails';
import type { KnowledgeBase, Asset } from '@/swh/types';

describe('normalizePrice', () => {
  it('normalizes separated digits', () => {
    expect(normalizePrice('4.900.000')).toBe('4900000');
  });
  it('normalizes tr shorthand', () => {
    expect(normalizePrice('1tr9')).toBe('1900000');
    expect(normalizePrice('5tr')).toBe('5000000');
  });
  it('normalizes k shorthand', () => {
    expect(normalizePrice('50k')).toBe('50000');
  });
  it('normalizes "1 chẹo" and "1 triệu"', () => {
    expect(normalizePrice('1 chẹo')).toBe('1000000');
    expect(normalizePrice('1 triệu')).toBe('1000000');
  });
});

describe('extractPriceMentions', () => {
  it('finds price-like tokens in a sentence', () => {
    const m = extractPriceMentions('học phí khoảng 4.900.000đ tới 5.200.000đ, cọc 1 chẹo');
    expect(m.length).toBeGreaterThanOrEqual(3);
  });

  it('does not treat plain birth years as prices', () => {
    expect(extractPriceMentions('Cô Lym sinh năm 1990, cô Dung sinh năm 2002 nha')).toEqual([]);
  });

  it.each([
    'Cô Dung 2k2 nha, chắc cỡ 23-24 tuổi tuỳ sinh nhật.',
    'Cô Dung 2k mấy em cũng chưa rõ á hehe.',
    'Miss Lym sinh năm 90, không phải thông tin học phí đâu nha.',
    'Bạn đó gen Z, sinh năm 2001 á.',
  ])('does not treat birth-year wording as prices: %s', (text) => {
    expect(extractPriceMentions(text)).toEqual([]);
  });

  it('still detects real k-denominated prices after ignoring 2k birth-year shorthand', () => {
    expect(extractPriceMentions('ưu đãi giảm 50k, không phải 2k2')).toEqual(['50k']);
  });
});

describe('buildAllowedPriceSet', () => {
  it('collects normalized prices from KB text', () => {
    const kb: KnowledgeBase = {
      courses: [{ slug: 's', name: 'n', promo: 'giảm 50k' }],
      faqs: [{ intent_group: 'g', representative_q: 'q', variants: [], answer: 'cọc 1.000.000đ' }],
      policies: [], assets: [], teachers: [],
    };
    const set = buildAllowedPriceSet(kb);
    expect(set.has('50000')).toBe(true);
    expect(set.has('1000000')).toBe(true);
  });

  it('collects prices from teacher class data (so real tuition is not flagged)', () => {
    const kb: KnowledgeBase = {
      courses: [], faqs: [], policies: [], assets: [],
      teachers: [
        {
          name: 'Anh Thư', teaches: ['Phát âm & Giao tiếp'],
          classes: [
            { code: 'OFFT3', course: 'Giao tiếp', price: '8.300.000đ' },
            { code: 'PROT2', course: 'PRO Giao tiếp', price: '14.490.000đ (+290.000đ/buổi)' },
          ],
        },
      ],
    };
    const set = buildAllowedPriceSet(kb);
    expect(set.has('8300000')).toBe(true);
    expect(set.has('14490000')).toBe(true);
    expect(set.has('290000')).toBe(true);
  });
});

const assets: Asset[] = [
  { type: 'form', key: 'f', value: 'https://forms.gle/ABC' },
  { type: 'image', key: 'i', value: 'https://speakwithhang.com/a.jpg' },
];
const allowed = new Set(['4900000', '50000', '1000000']);

describe('validateReply', () => {
  const ctx = (over: Partial<Parameters<typeof validateReply>[1]> = {}) =>
    ({ allowedPrices: allowed, assets, requiresHuman: false, decision: 'answer' as const, ...over });

  it('passes a clean on-brand reply', () => {
    const r = validateReply('Học phí lớp online khoảng 4.900.000đ nha, bạn để lại SĐT nhé.', ctx());
    expect(r.ok).toBe(true);
  });

  it('flags an invented price not in KB', () => {
    const r = validateReply('Lớp này chỉ 3.500.000đ thôi nha.', ctx());
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('price'))).toBe(true);
  });

  it('flags a non-registry link', () => {
    const r = validateReply('Đăng ký ở https://evil.example.com nha', ctx());
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('link'))).toBe(true);
  });

  it('allows a registry link', () => {
    expect(validateReply('Form nè: https://forms.gle/ABC', ctx()).ok).toBe(true);
  });

  it('flags banned internal terms', () => {
    const r = validateReply('mình là bot của trung tâm nha', ctx());
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('term'))).toBe(true);
  });

  it('flags a high-risk case that was answered instead of escalated', () => {
    const r = validateReply('Bạn được hoàn cọc nha', ctx({ requiresHuman: true, decision: 'answer' }));
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('high_risk'))).toBe(true);
  });

  it('allows teacher birth years in normal replies', () => {
    const r = validateReply('Cô Dung sinh năm 2002, còn Miss Lym sinh năm 1990 nha.', ctx());
    expect(r.ok).toBe(true);
  });

  it('allows 2k shorthand in teacher replies without treating it as tuition', () => {
    const r = validateReply('Cô Dung 2k2 á, nên tầm 23-24 tuổi tuỳ sinh nhật nha.', ctx());
    expect(r.ok).toBe(true);
  });
});
