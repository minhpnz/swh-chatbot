import type { Intent, Decision } from '@/swh/types';

// Paraphrase / utterance-variation test set: 5-7 phrasings per intent across all
// 20 intents (~115 cases). Each case lists acceptable intents + decisions
// (classification is fuzzy at the edges). Safety-critical money/dispute/complaint
// cases MUST escalate — a deterministic safety net in the pipeline guarantees this
// even if the LLM misses. Runs locally (Ollama), no quota.
export interface EvalCase {
  utterance: string;
  expectIntents: Intent[];
  expectDecisions: Decision[];
  safetyCritical?: boolean;
}

const ANSWERY: Decision[] = ['answer', 'answer_cta', 'clarify'];
const POLICY: Decision[] = ['answer', 'answer_cta'];
const ESC: Decision[] = ['escalate'];

export const EVAL_CASES: EvalCase[] = [
  // ===================== BENIGN =====================
  // greeting (6)
  { utterance: 'Em chào trung tâm ạ', expectIntents: ['greeting'], expectDecisions: ANSWERY },
  { utterance: 'Alo shop ơi', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },
  { utterance: 'Hi ad, cho em hỏi chút', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },
  { utterance: 'Chào bạn, mình cần tư vấn', expectIntents: ['greeting', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Dạ em chào ạ', expectIntents: ['greeting'], expectDecisions: ANSWERY },
  { utterance: 'Xin chào, cho mình hỏi xíu', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },

  // ask_price (7)
  { utterance: 'Khoá này học phí bao nhiêu vậy ạ?', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Cho em xin giá khoá học với', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Học ở đây tốn khoảng bao nhiêu tiền thế', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Một khoá hết nhiêu tiền ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Bảng giá các lớp như nào ạ?', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Học phí trọn khoá là bao nhiêu vậy', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Lớp giao tiếp giá sao em ơi', expectIntents: ['ask_price'], expectDecisions: ANSWERY },

  // ask_schedule (6)
  { utterance: 'Có lớp học buổi tối không ạ?', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lịch khai giảng sắp tới khi nào vậy', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Mình học vào thứ mấy mấy giờ thế ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Bao giờ thì có lớp mới mở ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp tối học từ mấy giờ tới mấy giờ ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Có lớp học vào cuối tuần không ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },

  // class_info (6)
  { utterance: 'Lớp học online hay offline vậy ạ?', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Trung tâm mình ở địa chỉ nào thế', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Một lớp có bao nhiêu học viên ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp offline với online khác nhau gì không', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Học online thì học qua nền tảng nào ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Cơ sở của mình ở quận mấy vậy ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },

  // course_consulting (7)
  { utterance: 'Em mất gốc tiếng Anh thì nên học lớp nào ạ?', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn cải thiện giao tiếp thì học khoá nào hợp', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Tư vấn giúp em chọn khoá phù hợp với', expectIntents: ['course_consulting', 'greeting'], expectDecisions: ANSWERY },
  { utterance: 'Em ngại nói tiếng Anh thì nên học gì ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Em nên bắt đầu từ khoá nào ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn phát âm chuẩn hơn thì học khoá nào', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Người đi làm bận rộn thì học khoá nào hợp ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },

  // trial_class (5)
  { utterance: 'Bên mình có cho học thử không ạ?', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Em được học thử demo một buổi không', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Có buổi học thử miễn phí nào không ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Mình học thử trước khi đăng ký được không', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Cho em học thử coi có hợp không ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },

  // promo (6)
  { utterance: 'Hiện có ưu đãi gì không ạ?', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Đăng ký hai bạn có được giảm giá không', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Có khuyến mãi gì cho học sinh sinh viên không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Bên mình đang có chương trình ưu đãi nào không', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Học viên cũ đăng ký lại có ưu đãi gì không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Giới thiệu bạn bè thì có được gì không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },

  // placement_test (5)
  { utterance: 'Em muốn test trình độ đầu vào ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Có bài kiểm tra xếp lớp không ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn làm bài test xem mình ở level nào', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Trước khi học có cần kiểm tra trình độ không ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Em đăng ký test đầu vào như nào ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },

  // policy_question (6)
  { utterance: 'Nếu nghỉ buổi nào thì có được học bù không ạ', expectIntents: ['policy_question'], expectDecisions: POLICY },
  { utterance: 'Lớp có quay video record lại không ạ', expectIntents: ['policy_question', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Đăng ký rồi có chuyển lớp khác được không', expectIntents: ['policy_question'], expectDecisions: POLICY },
  { utterance: 'Một tháng được nghỉ tối đa mấy buổi vậy ạ', expectIntents: ['policy_question'], expectDecisions: POLICY },
  { utterance: 'Có chính sách gì nếu em bận không đi học được không', expectIntents: ['policy_question'], expectDecisions: POLICY },
  { utterance: 'Nghỉ học có được cấp lại bài giảng không ạ', expectIntents: ['policy_question'], expectDecisions: ANSWERY },

  // bao_luu (5)
  { utterance: 'Bên mình có chính sách bảo lưu không ạ?', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Em muốn bảo lưu khoá học được không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Cho em bảo lưu lại vài tháng được không', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Giữa chừng bận thì bảo lưu khoá được không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },
  { utterance: 'Bảo lưu khoá học có mất phí gì không ạ', expectIntents: ['bao_luu', 'policy_question'], expectDecisions: POLICY },

  // recruitment (5)
  { utterance: 'Bên mình còn tuyển trợ giảng không ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn ứng tuyển vị trí TA thì làm sao ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Trung tâm có tuyển cộng tác viên không ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Em nộp CV ứng tuyển trợ giảng ở đâu ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },
  { utterance: 'Bên mình đang tuyển vị trí nào không ạ', expectIntents: ['recruitment'], expectDecisions: ANSWERY },

  // out_of_scope (5, lenient)
  { utterance: 'Cô Thanh Hằng năm nay bao nhiêu tuổi ạ', expectIntents: ['out_of_scope', 'unknown', 'ask_human'], expectDecisions: ['escalate', 'clarify', 'answer'] },
  { utterance: 'Cho em xin giáo trình nội bộ của trung tâm', expectIntents: ['out_of_scope', 'unknown', 'course_consulting'], expectDecisions: ['escalate', 'clarify', 'answer'] },
  { utterance: 'Trung tâm có dạy tiếng Nhật không ạ', expectIntents: ['out_of_scope', 'unknown', 'course_consulting'], expectDecisions: ['escalate', 'clarify', 'answer'] },
  { utterance: 'Cho em hỏi đường đến trung tâm đi xe buýt số mấy', expectIntents: ['out_of_scope', 'unknown', 'class_info'], expectDecisions: ['escalate', 'clarify', 'answer'] },
  { utterance: 'Bên mình có liên kết trường đại học nào không ạ', expectIntents: ['out_of_scope', 'unknown', 'course_consulting'], expectDecisions: ['escalate', 'clarify', 'answer'] },

  // unknown (5, lenient)
  { utterance: 'abc xyz ???', expectIntents: ['unknown'], expectDecisions: ['clarify', 'answer'] },
  { utterance: 'asdkj qwop', expectIntents: ['unknown'], expectDecisions: ['clarify', 'answer'] },
  { utterance: '🙂🙂🙂', expectIntents: ['unknown', 'greeting'], expectDecisions: ['clarify', 'answer'] },
  { utterance: '...', expectIntents: ['unknown', 'greeting'], expectDecisions: ['clarify', 'answer'] },
  { utterance: 'ờ thì là mà', expectIntents: ['unknown', 'greeting'], expectDecisions: ['clarify', 'answer'] },

  // ===================== SAFETY-CRITICAL (must escalate) =====================
  // refund (6)
  { utterance: 'Em muốn hoàn lại tiền khoá học ạ', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em xin lại tiền được không', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đổi ý rồi, trả lại tiền cho em nha', expectIntents: ['refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn lấy lại học phí đã đóng', expectIntents: ['refund', 'payment_confirm', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Học không hiệu quả, em muốn hoàn tiền', expectIntents: ['refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em nghỉ ngang giữa khoá có được hoàn phí không', expectIntents: ['refund'], expectDecisions: ESC, safetyCritical: true },

  // deposit_refund (5)
  { utterance: 'Em muốn rút cọc đã đóng', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em hoàn cọc lại với ạ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em không học nữa, lấy lại tiền cọc được không', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Tiền cọc của em có rút lại được không ạ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn trả lại cọc giữ chỗ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ESC, safetyCritical: true },

  // payment_intent (6)
  { utterance: 'Em muốn đóng học phí luôn ạ', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đóng tiền vào số tài khoản nào ạ', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em xin STK để chuyển khoản', expectIntents: ['payment_intent', 'payment_confirm'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn thanh toán khoá học bây giờ luôn', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đóng cọc giữ chỗ như nào ạ', expectIntents: ['payment_intent', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em nộp học phí qua hình thức nào ạ', expectIntents: ['payment_intent'], expectDecisions: ESC, safetyCritical: true },

  // payment_confirm (5)
  { utterance: 'Em chuyển khoản rồi nha shop', expectIntents: ['payment_confirm'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đã đóng tiền xong rồi ạ', expectIntents: ['payment_confirm', 'payment_intent'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em vừa chuyển khoản học phí xong', expectIntents: ['payment_confirm'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em chuyển tiền cọc rồi nhé', expectIntents: ['payment_confirm', 'payment_intent', 'deposit_refund'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em đã thanh toán xong, check giúp em với', expectIntents: ['payment_confirm', 'payment_intent'], expectDecisions: ESC, safetyCritical: true },

  // complaint (6)
  { utterance: 'Trung tâm dạy chán quá, em thất vọng', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Dịch vụ bên này tệ thật sự', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em không hài lòng về khoá học chút nào', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Giáo viên dạy dở quá ạ', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em thấy trung tâm làm việc quá tệ', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Khoá học chán, em muốn phàn nàn', expectIntents: ['complaint'], expectDecisions: ESC, safetyCritical: true },

  // discount_private (5)
  { utterance: 'Giảm thêm cho em chút nữa được không ạ', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Bớt giá cho em được không', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em sinh viên, giảm thêm cho em với', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Fix giá cho em xíu được không ạ', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Có giảm thêm được nữa không ạ', expectIntents: ['discount_private'], expectDecisions: ESC, safetyCritical: true },

  // ask_human (6)
  { utterance: 'Cho em gặp tư vấn viên trực tiếp với', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn nói chuyện với người thật ạ', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em gặp nhân viên tư vấn nha', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em cần gặp người tư vấn chứ không phải tự động', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Cho em gặp trực tiếp tư vấn viên với ạ', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
  { utterance: 'Em muốn được tư vấn trực tiếp bởi người ạ', expectIntents: ['ask_human'], expectDecisions: ESC, safetyCritical: true },
];
