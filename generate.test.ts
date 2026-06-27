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

  it('tells the model not to collect contact info for casual missing teacher/profile data', () => {
    const p = buildGeneratePrompt({ ...sel, courses: [], faqs: [], policies: [] }, 'answer' as Decision, []);
    expect(p).toContain('câu hỏi đời thường');
    expect(p).toContain('em cũng không biết nữa hehe');
    expect(p).toContain('tránh câu máy móc');
    expect(p).toContain('Không xin SĐT');
  });

  it('tells the model not to collect contact info for plain teacher/class info answers', () => {
    const p = buildGeneratePrompt(sel, 'answer' as Decision, []);
    expect(p).toContain('Không xin Tên + SĐT nếu khách chỉ hỏi thông tin lớp/giáo viên');
  });
});
