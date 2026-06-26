import type { Intent } from '@/swh/types';

// Deterministic high-risk detector. Money / dispute / complaint / human-handoff
// signals MUST escalate even if the LLM misclassifies them. Order matters
// (more specific first). Over-escalation is acceptable; leakage is not.
const RULES: { intent: Intent; re: RegExp }[] = [
  { intent: 'deposit_refund', re: /(hoàn|rút|lấy lại)\s*cọc/i },
  { intent: 'refund', re: /hoàn\s*(lại\s*)?tiền|trả\s*lại\s*tiền|lấy\s*lại\s*tiền|hoàn\s*phí|hoàn\s*fee/i },
  { intent: 'payment_confirm', re: /(đã|vừa)\s*(chuyển khoản|chuyển tiền|đóng|thanh toán)|chuyển khoản\s*(rồi|xong)/i },
  { intent: 'payment_intent', re: /đóng\s*(tiền|học phí|fee|cọc)|thanh toán|số\s*tài khoản|\bstk\b|chuyển khoản/i },
  { intent: 'complaint', re: /chán|(dạy|dịch vụ|trung tâm).{0,12}(tệ|dở|kém)|thất vọng|lừa đảo|không\s*hài lòng|phàn nàn|quá\s*tệ|tồi tệ/i },
  { intent: 'discount_private', re: /giảm\s*(thêm|nữa)|bớt\s*(giá|chút|xíu|tí)|fix\s*giá/i },
  { intent: 'ask_human', re: /gặp\s*(tư vấn viên|nhân viên|người|trực tiếp)|người\s*thật|nói chuyện với người|cho\s*gặp/i },
];

export function detectHighRisk(text: string): Intent | null {
  for (const r of RULES) if (r.re.test(text)) return r.intent;
  return null;
}
