import { describe, it, expect } from 'vitest';
import { policyGate } from '@/swh/policy';
import { runPipeline } from '@/swh/pipeline';
import { selectKnowledge } from '@/swh/kb';
import { buildGeneratePrompt } from '@/swh/generate';
import type {
  LlmClient, KnowledgeBase, Classification, Entities, PolicyRow, SelectedKnowledge,
} from '@/swh/types';

// Deterministic coverage of the 6-step student consulting playbook
// (swh_data/"1.2 Quy trình tư vấn học viên"). Each describe block = one step.
// We assert the bot-controllable behaviour at each step: the routing decision,
// escalation/handoff for money, lead capture, and that the flow's hard knowledge
// (entry criteria by score, deposit/payment terms) actually reaches the prompt.
// The fuzzy, conversational advisory (score->level wording, goal/ability nuance)
// is specified as live eval cases in eval-data.ts.

const policies: PolicyRow[] = [
  { topic: 'payment', risk_level: 'high', public_answer: 'x', allowed_action: 'escalate', requires_human: true },
  { topic: 'deposit', risk_level: 'high', public_answer: 'x', allowed_action: 'escalate', requires_human: true },
];

const kb: KnowledgeBase = {
  courses: [
    { slug: 'ngu-phap-can-ban', name: 'Ngữ pháp căn bản', good_for: 'mất gốc' },
    { slug: 'phat-am-giao-tiep', name: 'Phát âm & Giao tiếp', good_for: 'đã có nền' },
  ],
  faqs: [],
  policies,
  assets: [
    { type: 'template', key: 'holding_payment', value: 'Tụi mình nhờ tư vấn viên hỗ trợ phần đóng phí nha, bạn để lại SĐT giúp nhé' },
    { type: 'template', key: 'holding_default', value: 'Bạn để lại Tên + SĐT giúp tụi mình nha' },
    { type: 'form', key: 'form_dang_ky_tu_van', value: 'https://forms.gle/2TpDaYTAGaEMXyKN8' },
  ],
  teachers: [
    {
      name: 'Thanh Hằng', tag: 'Founder', role: 'Founder & Giáo viên', birth_year: 1999,
      profile_url: 'https://s.net.vn/EjyT',
      video_urls: ['https://drive.google.com/file/d/1a53hAW_eC01KohImnJYX0-Ae3PO0pKIx/view'],
      teaches: ['Phát âm & Giao tiếp'],
      classes: [{ code: 'OMH19', course: 'Lớp Giao tiếp Tiếng Anh & Phát âm IPA', price: '7.900.000đ', format: 'ONL' }],
    },
  ],
};

const C = (intent: Classification['intent'], confidence = 0.9, entities: Entities = {}): Classification =>
  ({ intent, entities, confidence });
const fakeLlm = (c: Classification, reply: string): LlmClient => ({ classify: async () => c, complete: async () => reply });
const EMPTY_SEL: SelectedKnowledge = { courses: [], faqs: [], policies: [], teachers: [], refs: [] };
// The prompt always embeds SWH_PERSONA + SWH_FACTS, so this is the flow knowledge the LLM sees.
const factsPrompt = buildGeneratePrompt(EMPTY_SEL, 'answer', []);

describe('Bước 1 — Nắm thông tin học viên & gửi form đăng ký tư vấn', () => {
  it('khách muốn tư vấn chọn khoá → answer_cta (xin Tên + SĐT / gửi form)', () => {
    expect(policyGate(C('course_consulting'), policies, { alreadyClarified: false }).decision).toBe('answer_cta');
  });

  it('khách muốn test trình độ đầu vào → answer_cta (gửi form/bài test)', () => {
    expect(policyGate(C('placement_test'), policies, { alreadyClarified: false }).decision).toBe('answer_cta');
  });

  it('nhu cầu chung chung, thiếu dữ kiện → clarify đúng 1 câu (chưa xin SĐT)', () => {
    expect(policyGate(C('course_consulting', 0.3), policies, { alreadyClarified: false }).decision).toBe('clarify');
  });

  it('khách để lại Tên + SĐT → ghi nhận lead, vẫn ở nhánh tư vấn (answer_cta)', async () => {
    const llm = fakeLlm(
      C('course_consulting', 0.9, { name: 'Vy', phone: '0900000000', course_name: 'giao tiếp' }),
      'Dạ Vy ơi, tụi mình lưu thông tin rồi nha...',
    );
    const r = await runPipeline({ text: 'em tên Vy, sđt 0900000000, muốn học giao tiếp', history: [], kb }, llm);
    expect(r.lead?.name).toBe('Vy');
    expect(r.lead?.phone).toBe('0900000000');
    expect(r.decision).toBe('answer_cta');
  });
});

describe('Bước 2 — Nắm năng lực: quy chuẩn đầu vào theo điểm reaches the prompt', () => {
  it('chứa quy chuẩn đầu vào IELTS/TOEIC/test cho từng mức', () => {
    expect(factsPrompt).toContain('TOEIC <= 400');
    expect(factsPrompt).toContain('test đầu vào <= 10');
    expect(factsPrompt).toContain('IELTS >= 5.0');
    expect(factsPrompt).toContain('TOEIC >= 650');
  });

  it('ánh xạ mức năng lực → lớp: yếu→Ngữ pháp, khá-giỏi→Phát âm & Giao tiếp', () => {
    expect(factsPrompt).toContain('Mất gốc / yếu → Lớp Ngữ pháp căn bản');
    expect(factsPrompt).toContain('Khá – giỏi → Lớp Phát âm & Giao tiếp');
  });
});

describe('Bước 3 — Xác định lớp phù hợp (mục tiêu + năng lực)', () => {
  it('chọn được khoá Ngữ pháp căn bản cho khách mất gốc', () => {
    const sel = selectKnowledge(C('course_consulting', 0.9, { course_name: 'ngữ pháp' }), 'em mất gốc muốn học ngữ pháp', kb);
    expect(sel.courses.map((c) => c.slug)).toContain('ngu-phap-can-ban');
  });

  it('chọn được khoá Phát âm & Giao tiếp khi khách hỏi giao tiếp', () => {
    const sel = selectKnowledge(C('course_consulting', 0.9, {}), 'em muốn cải thiện giao tiếp', kb);
    expect(sel.courses.map((c) => c.slug)).toContain('phat-am-giao-tiep');
  });
});

describe('Bước 4 — Tư vấn đúng/sai khớp mục tiêu & năng lực', () => {
  it('không hứa lớp luyện thi IELTS/TOEIC (SwH chưa có) — nói thật, gợi ý lớp bổ trợ', () => {
    expect(factsPrompt).toContain('CHƯA có lớp luyện thi IELTS/TOEIC');
    expect(factsPrompt).toContain('KHÔNG hứa có lớp luyện thi');
  });
});

describe('Bước 5 — Tư vấn khoá cụ thể (gửi video record GV được quan tâm)', () => {
  it('khách hỏi 1 GV → chọn đúng GV và có sẵn link video record để gửi', () => {
    const sel = selectKnowledge(C('teacher_info'), 'cho xin video record của Thanh Hằng', kb);
    expect(sel.teachers.map((t) => t.name)).toContain('Thanh Hằng');
    const links = sel.teachers.flatMap((t) => t.video_urls ?? []);
    expect(links.length).toBeGreaterThan(0);
  });
});

describe('Bước 6 — Chốt lớp & đóng phí (luôn chuyển người thật, không tự xác nhận tiền)', () => {
  it('khách muốn đóng học phí → escalate (holding_payment), không tự chốt tiền', async () => {
    const llm = fakeLlm(C('payment_intent'), 'SHOULD_NOT_APPEAR');
    const r = await runPipeline({ text: 'em muốn đóng học phí lớp OMH19', history: [], kb }, llm);
    expect(r.decision).toBe('escalate');
    expect(r.escalation?.reason).toBe('payment');
    expect(r.reply).not.toContain('SHOULD_NOT_APPEAR');
  });

  it('khách báo "đã chuyển khoản rồi" → escalate (không tự confirm đã nhận tiền)', () => {
    expect(policyGate(C('payment_confirm'), policies, { alreadyClarified: false }).decision).toBe('escalate');
  });

  it('khách hỏi hoàn cọc → escalate', () => {
    expect(policyGate(C('deposit_refund'), policies, { alreadyClarified: false }).decision).toBe('escalate');
  });

  it('điều khoản cọc giữ slot & chia học phí lớp Pro reaches the prompt', () => {
    expect(factsPrompt).toContain('đặt cọc 1.000.000đ');
    expect(factsPrompt).toContain('50% trước khai giảng');
    expect(factsPrompt).toContain('20% tháng thứ 2');
  });

  it('không tự xác nhận đã nhận thanh toán (giao cho người thật/kế toán)', () => {
    expect(factsPrompt).toContain('bot KHÔNG tự xác nhận thanh toán');
  });
});
