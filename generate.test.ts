import { describe, it, expect } from 'vitest';
import { buildGeneratePrompt } from '@/swh/generate';
import type { SelectedKnowledge, Decision } from '@/swh/types';

const sel: SelectedKnowledge = {
  courses: [{ slug: 'ngu-phap-can-ban', name: 'Ngữ pháp căn bản', good_for: 'mất gốc' }],
  faqs: [{ intent_group: 'Ưu đãi', representative_q: 'ưu đãi?', variants: [], answer: 'giảm 50k' }],
  policies: [{ topic: 'bao_luu', risk_level: 'low', public_answer: 'hông có bảo lưu', allowed_action: 'answer', requires_human: false }],
  teachers: [],
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
    const p = buildGeneratePrompt(sel, 'clarify' as Decision, []);
    expect(p).toContain('đúng 1 câu');
    expect(p).toContain('bạn nói rõ hơn một chút được không ạ?');
    expect(p).toContain('đừng xin SĐT');
  });

  it('renders matched teacher names, their current class and tuition', () => {
    const withTeacher: SelectedKnowledge = {
      ...sel,
      teachers: [
        {
          name: 'Phương Dung', tag: '2k2', role: 'Giáo viên', birth_year: 2002,
          teaches: ['Lớp IPA chuyên sâu'],
          classes: [{ code: 'IPA+L2', course: 'Lớp IPA chuyên sâu', start: 'Thứ 4, 5/8', price: '3.200.000đ', format: 'ONL' }],
        },
      ],
    };
    const p = buildGeneratePrompt(withTeacher, 'answer' as Decision, ['https://s.net.vn/EjyT']);
    expect(p).toContain('Phương Dung');
    expect(p).toContain('sinh năm 2002');
    expect(p).toContain('Lớp IPA chuyên sâu');
    expect(p).toContain('3.200.000đ');
  });

  it('renders structured teacher profile facts and URLs when available', () => {
    const withTeacher: SelectedKnowledge = {
      ...sel,
      teachers: [
        {
          name: 'Thanh Hằng',
          tag: 'Founder',
          role: 'Founder & Giáo viên',
          birth_year: 1999,
          hometown: 'TP.Đà Lạt - Lâm Đồng',
          profile_notes: 'Founder SpeakwithHang; TESOL, TOEIC 945',
          profile_url: 'https://s.net.vn/EjyT',
          video_urls: ['https://drive.google.com/file/d/1a53hAW_eC01KohImnJYX0-Ae3PO0pKIx/view?usp=drive_link'],
          teaches: ['Phát âm & Giao tiếp'],
          classes: [{ code: 'OMH19', course: 'Lớp Giao tiếp Tiếng Anh & Phát âm IPA', price: '7.900.000đ', format: 'ONL' }],
        },
      ],
    };
    const p = buildGeneratePrompt(withTeacher, 'answer' as Decision, ['https://s.net.vn/EjyT']);
    expect(p).toContain('sinh năm 1999');
    expect(p).toContain('quê quán TP.Đà Lạt - Lâm Đồng');
    expect(p).toContain('Founder SpeakwithHang');
    expect(p).toContain('Link profile: https://s.net.vn/EjyT');
    expect(p).toContain('Video record: https://drive.google.com/file/d/1a53hAW_eC01KohImnJYX0-Ae3PO0pKIx/view?usp=drive_link');
  });

  it('demands precision on hard facts (fee/schedule/policy/rules) and flexibility on everyday questions', () => {
    const p = buildGeneratePrompt({ ...sel, courses: [], faqs: [], policies: [] }, 'answer' as Decision, []);
    // (1) hard facts must be exact — never improvised
    expect(p).toContain('PHẢI chính xác');
    expect(p).toContain('học phí');
    expect(p).toContain('chính sách, quy định');
    // (2) everyday / soft questions are general (teacher age is just one example)
    expect(p).toContain('câu hỏi đời thường');
    expect(p).toContain('phải trả lời đúng theo dữ liệu'); // answer from data when present
    expect(p).toContain('năm sinh, tuổi'); // example of a soft fact that lives in data
    expect(p).toContain('em cũng không rõ á hehe'); // hedge only when truly absent
    expect(p).toContain('tránh câu máy móc');
    // never escalate / ask for contact on a casual question
    expect(p).toContain('KHÔNG escalate');
    expect(p).toContain('Không xin SĐT');
  });

  it('forbids asserting a course/need the user has not actually stated', () => {
    const p = buildGeneratePrompt(sel, 'answer_cta' as Decision, []);
    expect(p).toContain('gán/khẳng định');
    expect(p).toContain('khách CHƯA nói');
    expect(p).toContain('quan tâm đến khoá X'); // the exact bad pattern to avoid
    expect(p).toContain('tự chọn giùm');
  });

  it('strictly forbids calling the founder "cô/chị" — inline reminder on the founder row', () => {
    const withFounder: SelectedKnowledge = {
      ...sel,
      teachers: [{ name: 'Thanh Hằng', role: 'Founder & Giáo viên', birth_year: 1999, teaches: [], classes: [] }],
    };
    const p = buildGeneratePrompt(withFounder, 'answer' as Decision, []);
    expect(p).toContain('luôn gọi thẳng tên "Thanh Hằng"');
    expect(p).toContain('KHÔNG xưng "cô"');
  });

  it('does NOT add the founder reminder for a normal teacher (cô/thầy is fine)', () => {
    const withTeacher: SelectedKnowledge = {
      ...sel,
      teachers: [{ name: 'Phương Dung', role: 'Giáo viên', birth_year: 2002, teaches: [], classes: [] }],
    };
    const p = buildGeneratePrompt(withTeacher, 'answer' as Decision, []);
    expect(p).not.toContain('luôn gọi thẳng tên');
  });

  it('offers a sendable image as markdown when one is selected', () => {
    const withImage: SelectedKnowledge = {
      ...sel,
      images: [{ type: 'image', key: 'img_schedule', label: 'Lịch khai giảng các lớp', value: 'https://cdn.example/lich-khai-giang.png', when_to_use: 'Khách hỏi lịch / học phí' }],
    };
    const p = buildGeneratePrompt(withImage, 'answer' as Decision, []);
    expect(p).toContain('HÌNH ẢNH ĐƯỢC PHÉP GỬI KÈM');
    expect(p).toContain('![Lịch khai giảng các lớp](https://cdn.example/lich-khai-giang.png)');
  });

  it('renders no image section when none selected', () => {
    expect(buildGeneratePrompt(sel, 'answer' as Decision, [])).not.toContain('HÌNH ẢNH ĐƯỢC PHÉP GỬI KÈM');
  });

  it('tells the model not to collect contact info for plain teacher/class info answers', () => {
    const p = buildGeneratePrompt(sel, 'answer' as Decision, []);
    expect(p).toContain('Không xin Tên + SĐT nếu khách chỉ hỏi thông tin lớp/giáo viên');
  });
});
