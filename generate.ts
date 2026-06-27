import type { SelectedKnowledge, Decision, ChatTurn, LlmClient } from '@/swh/types';
import { SWH_PERSONA, SWH_FACTS } from '@/swh/persona';

function actionDirective(decision: Decision): string {
  switch (decision) {
    case 'clarify':
      return 'Khách chưa rõ nhu cầu — hỏi lại đúng 1 câu ngắn gọn để làm rõ, đừng tư vấn dài.';
    case 'answer_cta':
      return 'Trả lời ngắn gọn rồi mời khách để lại Tên + SĐT và/hoặc gửi form phù hợp đã cung cấp.';
    default:
      return 'Trả lời ngắn gọn, đúng dữ liệu, đúng tone SwH. Không xin Tên + SĐT nếu khách chỉ hỏi thông tin lớp/giáo viên; chỉ xin khi khách muốn tư vấn chọn khoá, đăng ký, nhận ưu đãi/form, hoặc cần follow-up thật.';
  }
}

function birthYearFromTag(tag: string | undefined): number | null {
  if (!tag) return null;
  const t = tag.trim().toLowerCase();
  const twoK = t.match(/^2k(\d{1,2})$/u);
  if (twoK?.[1]) return 2000 + Number(twoK[1].padStart(2, '0'));
  const fourDigit = t.match(/^(19\d{2}|20\d{2})$/u);
  if (fourDigit?.[1]) return Number(fourDigit[1]);
  const twoDigit = t.match(/^\d{2}$/u);
  if (!twoDigit) return null;
  const yy = Number(t);
  return yy >= 30 ? 1900 + yy : 2000 + yy;
}

function formatTeacherMeta(t: SelectedKnowledge['teachers'][number]): string {
  const year = t.birth_year ?? birthYearFromTag(t.tag);
  const tag = t.tag && !birthYearFromTag(t.tag) ? t.tag : undefined;
  if (!year) return tag ? ` (${tag})` : '';
  const currentYear = new Date().getFullYear();
  const age = currentYear - year;
  const ageText = age > 0 ? `, khoảng ${Math.max(0, age - 1)}-${age} tuổi tuỳ sinh nhật` : '';
  const parts = [`sinh năm ${year}${ageText}`];
  if (tag) parts.push(tag);
  if (t.hometown) parts.push(`quê quán ${t.hometown}`);
  return ` (${parts.join('; ')})`;
}

function renderTeacher(t: SelectedKnowledge['teachers'][number]): string {
  const head = `• ${t.name}${formatTeacherMeta(t)}${t.role ? ` — ${t.role}` : ''}`;
  const extras = [
    t.profile_notes && `Hồ sơ: ${t.profile_notes}`,
    t.profile_url && `Link profile: ${t.profile_url}`,
    t.video_urls?.length && `Video record: ${t.video_urls.join(', ')}`,
  ].filter(Boolean);
  const profile = extras.length ? ` ${extras.join('. ')}.` : '';
  if (t.classes.length === 0) {
    const teaches = t.teaches.length ? ` Phụ trách: ${t.teaches.join(', ')}.` : '';
    return `${head}: hiện chưa có lớp đang mở ghi danh.${teaches}${profile}`;
  }
  const classes = t.classes
    .map((cl) => `   - ${cl.course} (mã ${cl.code})`
      + [cl.start && `, khai giảng ${cl.start}`, cl.time && `, ${cl.time}`, cl.days && ` (T${cl.days})`,
         cl.duration && `, ${cl.duration}`, cl.size && `, sĩ số ${cl.size}`,
         cl.price && `, học phí ${cl.price}`, cl.format && `, ${cl.format}`]
        .filter(Boolean).join(''))
    .join('\n');
  return `${head} đang dạy:\n${classes}${profile}`;
}

export function buildGeneratePrompt(sel: SelectedKnowledge, decision: Decision, allowedLinks: string[]): string {
  const courses = sel.courses
    .map((c) => `• ${c.name}: ${[c.helps_with, c.good_for, c.entry_level, c.formats, c.promo].filter((x): x is string => Boolean(x)).join(' | ')}`)
    .join('\n');
  const faqs = sel.faqs.map((f) => `Q: ${f.representative_q}\nA: ${f.answer}`).join('\n\n');
  const policies = sel.policies.map((p) => `• ${p.topic}: ${p.public_answer}`).join('\n');
  const teachers = sel.teachers.map(renderTeacher).join('\n');

  return [
    SWH_PERSONA,
    SWH_FACTS,
    courses ? `KHOÁ HỌC LIÊN QUAN:\n${courses}` : '',
    teachers ? `GIÁO VIÊN & LỚP ĐANG MỞ (chỉ dùng đúng dữ liệu này, kèm link hồ sơ GV nếu có để khách xem profile + video record):\n${teachers}` : '',
    faqs ? `CÂU TRẢ LỜI MẪU (ưu tiên dùng gần đúng, giữ nguyên ý + tone):\n${faqs}` : '',
    policies ? `CHÍNH SÁCH ĐƯỢC PHÉP NÓI:\n${policies}` : '',
    allowedLinks.length ? `CHỈ ĐƯỢC DÙNG CÁC LINK SAU (nếu cần):\n${allowedLinks.join('\n')}` : 'KHÔNG được chèn link nào.',
    'RÀNG BUỘC: không bịa học phí/lịch/chính sách/quy định ngoài dữ liệu trên; không tự tạo link; không dùng từ "bot/admin/AI"; tiếng Việt, tone SwH dễ thương. Với câu hỏi đời thường hoặc thông tin mềm về người/giáo viên/profile, nếu không biết thì nói tự nhiên kiểu "em cũng không biết nữa hehe" hoặc "cái này em chưa rõ á hehe"; tránh câu máy móc như "dữ liệu hiện tại chưa có thông tin". Không xin SĐT/chuyển tư vấn chỉ vì thiếu dữ liệu đời thường. Chỉ xin Tên + SĐT khi khách đang hỏi tư vấn khoá học/đăng ký/ưu đãi/form hoặc cần follow-up thật.',
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
