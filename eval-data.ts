import type { Intent, Decision } from '@/swh/types';

// Paraphrase / utterance-variation test set, GROUNDED IN THE REAL SwH DATA
// (FAQ.csv topics + quick-reply topics) plus paraphrases. 6-10 cases per intent
// across all 20 intents. Acceptable intents/decisions are lists (classification is
// fuzzy at the edges). Safety-critical money/dispute/complaint cases MUST escalate —
// a deterministic safety net in the pipeline guarantees this even if the LLM misses.
// Runs locally (Ollama), no quota.
export interface EvalCase {
  utterance: string;
  expectIntents: Intent[];
  expectDecisions: Decision[];
  safetyCritical?: boolean;
}

const ANSWERY: Decision[] = ['answer', 'answer_cta', 'clarify'];
const POLICY: Decision[] = ['answer', 'answer_cta'];
const ESC: Decision[] = ['escalate'];
const OOS: Decision[] = ['escalate', 'clarify', 'answer', 'answer_cta']; // out_of_scope: lenient

export const EVAL_CASES: EvalCase[] = [
  // ===================== BENIGN =====================
  // greeting (8) — FAQ "Nhu cầu tư vấn" variants
  { utterance: 'Em chào trung tâm ạ', expectIntents: ['greeting'], expectDecisions: ANSWERY },
  { utterance: 'Hello shop ơi', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },
  { utterance: 'Ad ơi cho em hỏi xíu', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },
  { utterance: 'Dạ em cần tư vấn ạ', expectIntents: ['greeting', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Tư vấn giúp mình với ạ', expectIntents: ['greeting', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Hi chị, em muốn tư vấn để chọn khoá phù hợp', expectIntents: ['greeting', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Mình muốn tư vấn các khoá học bên SpeakwithHang ạ', expectIntents: ['greeting', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Xin chào, cho mình hỏi chút', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },

  // ask_price (9) — FAQ "học phí", "tại sao học phí khác nhau"
  { utterance: 'Cho em xin học phí khóa này ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Học phí như nào ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Giá khoá học như nào ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Chi phí một khoá khoảng bao nhiêu ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Học ở đây tốn khoảng bao nhiêu tiền', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Bảng giá các lớp như nào ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Tại sao các lớp lại có mức học phí khác nhau ạ', expectIntents: ['ask_price', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Khoá kèm 1-1 học phí tính sao ạ', expectIntents: ['ask_price', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Khoá video record bao nhiêu tiền ạ', expectIntents: ['ask_price', 'class_info'], expectDecisions: ANSWERY },

  // ask_schedule (8) — FAQ "thứ mấy ca mấy giờ", "khai giảng", "lịch đúng dự kiến"
  { utterance: 'Lớp học vào thứ mấy, ca mấy giờ ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Bên mình sắp có lớp mới khai giảng khi nào ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Có lớp học buổi tối không ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lịch khai giảng có đúng với dự kiến ban đầu không ạ', expectIntents: ['ask_schedule', 'policy_question', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp tối học từ mấy giờ đến mấy giờ ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Một tuần học mấy buổi vậy ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Có lớp vào cuối tuần không ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Khi nào lớp giao tiếp mới khai giảng ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },

  // class_info (9) — FAQ "online/offline địa chỉ", "sĩ số", "khác biệt", "tài liệu", quick-reply "khoá video", "địa chỉ"
  { utterance: 'Lớp học online hay offline, địa chỉ ở đâu ạ', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Lớp bao nhiêu học viên ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp Offline và Online có khác biệt gì không ạ', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Mình có tài liệu khoá học không ạ', expectIntents: ['class_info', 'policy_question'], expectDecisions: ANSWERY },
  { utterance: 'Trung tâm ở địa chỉ nào vậy ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Học online thì học qua nền tảng nào ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Cho em thông tin về khoá video record với ạ', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Sĩ số mỗi lớp khoảng bao nhiêu bạn ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Cơ sở offline ở quận mấy vậy ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },

  // course_consulting (10) — FAQ "mất gốc", "giao tiếp lớp nào", "xin lớp PA/NP", "PA&GT dạy ngữ pháp", "học song song", "viết được câu", "sửa bài", "kèm 1-1"
  { utterance: 'Em mất gốc/ngữ pháp yếu thì học lớp nào ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn học giao tiếp/speaking thì lớp nào phù hợp ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Cho em xin thông tin lộ trình lớp Phát âm chuyên sâu', expectIntents: ['course_consulting', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Cho em xin thông tin lớp Ngữ pháp cơ bản', expectIntents: ['course_consulting', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp Phát âm & Giao tiếp cơ bản có dạy ngữ pháp không ạ', expectIntents: ['course_consulting', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Em đăng ký học song song lớp Ngữ pháp với Giao tiếp được không', expectIntents: ['course_consulting', 'policy_question'], expectDecisions: ANSWERY },
  { utterance: 'Học xong lớp ngữ pháp em viết được câu hoàn chỉnh không ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Trong khoá học em có được sửa bài kỹ không ạ', expectIntents: ['course_consulting', 'class_info', 'policy_question'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn học kèm 1-1 thì học như thế nào ạ', expectIntents: ['course_consulting', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Em đi làm bận rộn thì nên học khoá nào ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },

  // trial_class (6) — FAQ "học thử/demo"
  { utterance: 'Bên mình có học thử/demo không ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Em được học thử một buổi không ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Có buổi học thử miễn phí nào không ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Mình học thử trước khi đăng ký được không ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Cho em xem video record thử cách dạy được không ạ', expectIntents: ['trial_class', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn dự thính một buổi xem sao ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },

  // promo (8) — FAQ + quick-reply "Chính sách ưu đãi"
  { utterance: 'Hiện có ưu đãi/giảm giá nào không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Đăng ký hai bạn có được ưu đãi gì không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Có ưu đãi cho học sinh sinh viên không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Học viên cũ đăng ký lại có ưu đãi gì không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Giới thiệu bạn bè thì có được gì không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Bên mình đang có chương trình khuyến mãi nào không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Nhà em xa hơn 10km có được ưu đãi không ạ', expectIntents: ['promo', 'discount_private'], expectDecisions: ['answer', 'answer_cta', 'clarify', 'escalate'] },
  { utterance: 'Có mã giảm giá nào đang áp dụng không ạ', expectIntents: ['promo', 'discount_private'], expectDecisions: ['answer', 'answer_cta', 'clarify', 'escalate'] },

  // placement_test (6) — FAQ "kiểm tra đầu vào/xếp lớp"
  { utterance: 'Em có cần kiểm tra đầu vào/xếp lớp không ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn test trình độ đầu vào ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Có bài kiểm tra xếp lớp không ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn làm bài test xem mình ở level nào ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Trước khi học có cần test gì không ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Em đăng ký làm bài test đầu vào như nào ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },

  // policy_question (8) — FAQ "học bù", "chuyển lớp", "record", "lớp off record", quick-reply "Nội quy"
  { utterance: 'Nếu bận/vắng thì có được học bù không ạ', expectIntents: ['policy_question'], expectDecisions: POLICY },
  { utterance: 'Mình đăng ký lớp rồi chuyển lớp khác được không ạ', expectIntents: ['policy_question'], expectDecisions: POLICY },
  { utterance: 'Sau buổi học có record không ạ', expectIntents: ['policy_question', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp off thì có bài record không ạ', expectIntents: ['policy_question', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Một tháng được nghỉ tối đa mấy buổi ạ', expectIntents: ['policy_question'], expectDecisions: POLICY },
  { utterance: 'Nghỉ học có được cấp lại video bài giảng không ạ', expectIntents: ['policy_question', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp Online có nội quy gì không ạ', expectIntents: ['policy_question', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Có chính sách gì nếu em bận giữa khoá không ạ', expectIntents: ['policy_question', 'bao_luu'], expectDecisions: POLICY },

  // bao_luu (6)
  { utterance: 'Bên mình có chính sách bảo lưu không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Em muốn bảo lưu khoá học được không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Cho em bảo lưu lại vài tháng được không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Giữa chừng bận thì bảo lưu khoá được không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Bảo lưu khoá học có mất phí gì không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Em chưa học buổi nào, bảo lưu sang khoá sau được không', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },

  // recruitment (6) — FAQ "Tuyển dụng"
  { utterance: 'Bên mình còn tuyển Trợ giảng không ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn ứng tuyển vị trí TA thì làm sao ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Trung tâm có tuyển cộng tác viên không ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Em nộp CV ứng tuyển trợ giảng ở đâu ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Bên mình đang tuyển vị trí nào không ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn xin làm trợ giảng tiếng Anh ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },

  // out_of_scope (7) — FAQ "TOEIC/IELTS", quick-reply "khảo sát TOEIC", "nói trước đám đông"; founder/internal
  { utterance: 'Bên bạn có nhận dạy TOEIC/IELTS không ạ', expectIntents: ['out_of_scope', 'course_consulting', 'unknown'], expectDecisions: OOS },
  { utterance: 'Học xong khoá ngữ pháp thi TOEIC và IELTS được không ạ', expectIntents: ['out_of_scope', 'course_consulting'], expectDecisions: OOS },
  { utterance: 'Trung tâm có lớp luyện thi IELTS không ạ', expectIntents: ['out_of_scope', 'course_consulting'], expectDecisions: OOS },
  { utterance: 'Bên mình có dạy tiếng Nhật không ạ', expectIntents: ['out_of_scope', 'course_consulting', 'unknown'], expectDecisions: OOS },
  { utterance: 'Có lớp luyện nói trước đám đông không ạ', expectIntents: ['out_of_scope', 'course_consulting'], expectDecisions: OOS },
  { utterance: 'Cô Thanh Hằng năm nay bao nhiêu tuổi ạ', expectIntents: ['out_of_scope', 'unknown'], expectDecisions: OOS },
  { utterance: 'Cho em xin giáo trình nội bộ của trung tâm', expectIntents: ['out_of_scope', 'unknown', 'course_consulting'], expectDecisions: OOS },

  // unknown (6)
  { utterance: 'abc xyz ???', expectIntents: ['unknown'], expectDecisions: ['clarify', 'answer'] },
  { utterance: 'asdkj qwop', expectIntents: ['unknown'], expectDecisions: ['clarify', 'answer'] },
  { utterance: '🙂🙂🙂', expectIntents: ['unknown', 'greeting'], expectDecisions: ['clarify', 'answer'] },
  { utterance: '...', expectIntents: ['unknown', 'greeting'], expectDecisions: ['clarify', 'answer'] },
  { utterance: 'ờ thì là mà', expectIntents: ['unknown', 'greeting'], expectDecisions: ['clarify', 'answer'] },
  { utterance: 'k', expectIntents: ['unknown', 'greeting'], expectDecisions: ['clarify', 'answer'] },

  // ===================== SAFETY-CRITICAL (must escalate) =====================
  // refund (7)
  { utterance: 'Em muốn hoàn lại tiền khoá học ạ', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em xin lại tiền được không', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đổi ý rồi, trả lại tiền cho em nha', expectIntents: ['refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn lấy lại học phí đã đóng', expectIntents: ['refund', 'payment_confirm', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Học không hiệu quả, em muốn hoàn tiền', expectIntents: ['refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em nghỉ ngang giữa khoá có được hoàn phí không', expectIntents: ['refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em thấy không hợp, cho em hoàn lại tiền nha', expectIntents: ['refund'], expectDecisions: ESC, safetyCritical: true },

  // deposit_refund (6)
  { utterance: 'Em muốn rút cọc đã đóng', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em hoàn cọc lại với ạ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em không học nữa, lấy lại tiền cọc được không', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Tiền cọc của em có rút lại được không ạ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn trả lại cọc giữ chỗ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Lỡ đóng cọc rồi giờ muốn lấy lại cọc ạ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },

  // payment_intent (8) — incl. STK (quick-reply "Stk Hằng/Cty"), "Học phí đóng như thế nào"
  { utterance: 'Em muốn đóng học phí luôn ạ', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đóng tiền vào số tài khoản nào ạ', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em xin STK để chuyển khoản', expectIntents: ['payment_intent', 'payment_confirm'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Số tài khoản của trung tâm là gì ạ', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn thanh toán khoá học bây giờ luôn', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đóng cọc giữ chỗ như nào ạ', expectIntents: ['payment_intent', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em nộp học phí qua hình thức nào ạ', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em chuyển khoản học phí cho mình nhé', expectIntents: ['payment_intent', 'payment_confirm'], expectDecisions: ESC, safetyCritical: true },

  // payment_confirm (6)
  { utterance: 'Em chuyển khoản rồi nha shop', expectIntents: ['payment_confirm'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đã đóng tiền xong rồi ạ', expectIntents: ['payment_confirm', 'payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em vừa chuyển khoản học phí xong', expectIntents: ['payment_confirm'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em chuyển tiền cọc rồi nhé', expectIntents: ['payment_confirm', 'payment_intent', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đã thanh toán xong, check giúp em với', expectIntents: ['payment_confirm', 'payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em nộp tiền rồi đó ạ', expectIntents: ['payment_confirm', 'payment_intent'], expectDecisions: ESC, safetyCritical: true },

  // complaint (7)
  { utterance: 'Trung tâm dạy chán quá, em thất vọng', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Dịch vụ bên này tệ thật sự', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em không hài lòng về khoá học chút nào', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Giáo viên dạy dở quá ạ', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em thấy trung tâm làm việc quá tệ', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Khoá học chán, em muốn phàn nàn', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em thấy bị lừa đảo, học không như quảng cáo', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },

  // discount_private (6)
  { utterance: 'Giảm thêm cho em chút nữa được không ạ', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Bớt giá cho em được không', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em sinh viên, giảm thêm cho em với', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Fix giá cho em xíu được không ạ', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Có giảm thêm được nữa không ạ', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Bớt cho em một xíu đi mà', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },

  // ask_human (7)
  { utterance: 'Cho em gặp tư vấn viên trực tiếp với', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn nói chuyện với người thật ạ', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em gặp nhân viên tư vấn nha', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em cần gặp người tư vấn chứ không phải tự động', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em gặp trực tiếp tư vấn viên với ạ', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn được tư vấn trực tiếp bởi người ạ', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Có ai tư vấn trực tiếp cho em được không ạ', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
];
