import type { Classification, ChatTurn, Intent, LlmClient, Entities } from '@/swh/types';
import { INTENTS } from '@/swh/intents';

export function buildClassifyPrompt(text: string, history: ChatTurn[]): string {
  const ctx = history.slice(-4).map((m) => `${m.role === 'user' ? 'Khách' : 'SwH'}: ${m.content}`).join('\n');
  return [
    'Bạn là bộ phân loại intent cho trợ lý tư vấn trung tâm tiếng Anh SpeakwithHang.',
    'Phân loại tin nhắn MỚI NHẤT của khách. Trả về JSON DUY NHẤT, không giải thích.',
    `intent phải là một trong: ${INTENTS.join(', ')}.`,
    'entities (tuỳ chọn): course_name, level, format(online|offline|video|1-1), preferred_time, policy_topic, teacher_name, name, phone, email.',
    'Quy ước phân biệt:',
    '- "giáo viên X dạy lớp nào / cô X dạy gì / có những giáo viên nào / profile giáo viên / ai dạy lớp này" => teacher_info (kèm teacher_name nếu khách nêu tên GV, vd "Phương Dung", "cô Lym").',
    '- Hỏi tuổi/năm sinh/2k mấy của một giáo viên/người trong trung tâm, vd "Hằng bao nhiêu tuổi", "cô Dung 2k mấy", "Miss Lym sinh năm 90" => teacher_info (KHÔNG phải ask_price/ask_human/out_of_scope). 2k2 nghĩa là sinh năm 2002; sinh năm 90 nghĩa là 1990.',
    '- "có chính sách bảo lưu/hoàn tiền/học bù không" => policy_question (kèm policy_topic: bao_luu|refund_policy|absence_makeup|transfer_class|record_policy).',
    '- "em muốn hoàn tiền/hoàn cọc" (yêu cầu cá nhân) => refund hoặc deposit_refund.',
    '- "em muốn đóng tiền" => payment_intent. "em chuyển khoản rồi" => payment_confirm.',
    '- "giảm thêm cho em" => discount_private. "gặp tư vấn viên/người thật" => ask_human.',
    'confidence là số 0..1.',
    'Ví dụ:',
    '- "học phí/giá/tốn bao nhiêu tiền" => ask_price',
    '- "lớp online hay offline, địa chỉ ở đâu, sĩ số bao nhiêu" => class_info',
    '- "học thứ mấy, ca mấy giờ, lịch khai giảng" => ask_schedule',
    '- "em mất gốc / muốn giao tiếp thì nên học khoá nào" => course_consulting',
    '- "có học thử/demo không" => trial_class',
    '- "giáo viên Phương Dung dạy lớp nào / cô Lym dạy gì / trung tâm có những giáo viên nào" => teacher_info',
    '- "Hằng bao nhiêu tuổi / cô Dung sinh năm mấy / Miss Lym 2k mấy" => teacher_info',
    '- "có ưu đãi/giảm giá gì không" => promo',
    '- "đóng tiền / chuyển khoản / số tài khoản" => payment_intent hoặc payment_confirm (KHÔNG phải ask_price)',
    '- "trung tâm dạy tệ / chán / thất vọng" => complaint',
    '- "em muốn bảo lưu khoá học" => bao_luu',
    '- "bên mình có tuyển trợ giảng/TA không" => recruitment',
    '- "muốn test/kiểm tra trình độ đầu vào" => placement_test',
    '- "em cần/muốn tư vấn (chung chung)" => greeting (KHÔNG phải ask_human)',
    '- "trung tâm/cơ sở ở địa chỉ nào, ở đâu" => class_info',
    '- "có tài liệu khoá học không" => class_info',
    ctx ? `Ngữ cảnh gần đây:\n${ctx}` : '',
    `Tin nhắn mới: "${text}"`,
    'JSON: {"intent": "...", "entities": {...}, "confidence": 0.0}',
  ].filter(Boolean).join('\n');
}

export function parseClassification(raw: string): Classification {
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
    const o = JSON.parse(cleaned) as { intent?: string; entities?: Entities; confidence?: number };
    const intent = (INTENTS as string[]).includes(o.intent ?? '') ? (o.intent as Intent) : 'unknown';
    let conf = typeof o.confidence === 'number' ? o.confidence : 0;
    conf = Math.max(0, Math.min(1, conf));
    return { intent, entities: o.entities ?? {}, confidence: conf };
  } catch {
    return { intent: 'unknown', entities: {}, confidence: 0 };
  }
}

export async function classifyMessage(text: string, history: ChatTurn[], llm: LlmClient): Promise<Classification> {
  return llm.classify(buildClassifyPrompt(text, history));
}
