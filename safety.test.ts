import { describe, it, expect } from 'vitest';
import { detectHighRisk } from '@/swh/safety';

describe('detectHighRisk', () => {
  it('detects each high-risk category', () => {
    expect(detectHighRisk('em muốn hoàn lại tiền khoá học')).toBe('refund');
    expect(detectHighRisk('cho em rút cọc đã đóng')).toBe('deposit_refund');
    expect(detectHighRisk('em chuyển khoản rồi nha')).toBe('payment_confirm');
    expect(detectHighRisk('em muốn đóng học phí luôn')).toBe('payment_intent');
    expect(detectHighRisk('trung tâm dạy chán quá em thất vọng')).toBe('complaint');
    expect(detectHighRisk('giảm thêm cho em chút nữa được không')).toBe('discount_private');
    expect(detectHighRisk('cho em gặp tư vấn viên trực tiếp')).toBe('ask_human');
  });

  it('does not flag benign messages', () => {
    expect(detectHighRisk('học phí bao nhiêu ạ')).toBeNull();
    expect(detectHighRisk('lớp online hay offline vậy')).toBeNull();
    expect(detectHighRisk('em mất gốc nên học lớp nào')).toBeNull();
    expect(detectHighRisk('có ưu đãi giảm giá gì không ạ')).toBeNull();
    expect(detectHighRisk('có học thử không ạ')).toBeNull();
  });
});
