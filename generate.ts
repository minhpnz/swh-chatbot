import type { SelectedKnowledge, Decision, ChatTurn, LlmClient } from '@/swh/types';
import { SWH_PERSONA, SWH_FACTS } from '@/swh/persona';

function actionDirective(decision: Decision): string {
  switch (decision) {
    case 'clarify':
      return 'Khách chưa rõ nhu cầu — hỏi lại đúng 1 câu ngắn gọn để làm rõ, đừng tư vấn dài.';
    case 'answer_cta':
      return 'Trả lời ngắn gọn rồi mời khách để lại Tên + SĐT và/hoặc gửi form phù hợp đã cung cấp.';
    default:
      return 'Trả lời ngắn gọn, đúng dữ liệu, đúng tone SwH. Nếu hợp lý thì xin Tên + SĐT.';
  }
}

export function buildGeneratePrompt(sel: SelectedKnowledge, decision: Decision, allowedLinks: string[]): string {
  const courses = sel.courses
    .map((c) => `• ${c.name}: ${[c.helps_with, c.good_for, c.entry_level, c.formats, c.promo].filter((x): x is string => Boolean(x)).join(' | ')}`)
    .join('\n');
  const faqs = sel.faqs.map((f) => `Q: ${f.representative_q}\nA: ${f.answer}`).join('\n\n');
  const policies = sel.policies.map((p) => `• ${p.topic}: ${p.public_answer}`).join('\n');

  return [
    SWH_PERSONA,
    SWH_FACTS,
    courses ? `KHOÁ HỌC LIÊN QUAN:\n${courses}` : '',
    faqs ? `CÂU TRẢ LỜI MẪU (ưu tiên dùng gần đúng, giữ nguyên ý + tone):\n${faqs}` : '',
    policies ? `CHÍNH SÁCH ĐƯỢC PHÉP NÓI:\n${policies}` : '',
    allowedLinks.length ? `CHỈ ĐƯỢC DÙNG CÁC LINK SAU (nếu cần):\n${allowedLinks.join('\n')}` : 'KHÔNG được chèn link nào.',
    'RÀNG BUỘC: không bịa học phí/lịch ngoài dữ liệu trên; không tự tạo link; không dùng từ "bot/admin/AI"; tiếng Việt, tone SwH dễ thương.',
    `NHIỆM VỤ: ${actionDirective(decision)}`,
  ].filter(Boolean).join('\n\n');
}

export async function generateReply(
  sel: SelectedKnowledge,
  decision: Decision,
  allowedLinks: string[],
  history: ChatTurn[],
  userText: string,
  llm: LlmClient,
): Promise<string> {
  const system = buildGeneratePrompt(sel, decision, allowedLinks);
  return llm.complete(system, [...history, { role: 'user', content: userText }]);
}
