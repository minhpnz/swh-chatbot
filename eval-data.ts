import type { Intent, Decision } from '@/swh/types';

// Labeled paraphrase / utterance-variation set. Each case lists acceptable
// intents + decisions (LLM classification is fuzzy at the edges). Safety-critical
// money/dispute/complaint cases MUST escalate (a deterministic safety net in the
// pipeline guarantees this even if the LLM misses). Runs locally (Ollama) with no
// quota, so the set is broad — many phrasings per intent.
export interface EvalCase {
  utterance: string;
  expectIntents: Intent[];
  expectDecisions: Decision[];
  safetyCritical?: boolean;
}

const ANSWERY: Decision[] = ['answer', 'answer_cta', 'clarify'];

export const EVAL_CASES: EvalCase[] = [
  // greeting
  { utterance: 'Em chào trung tâm ạ', expectIntents: ['greeting'], expectDecisions: ANSWERY },
  { utterance: 'Alo shop ơi', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },
  { utterance: 'Hi ad, cho em hỏi chút', expectIntents: ['greeting', 'unknown'], expectDecisions: ANSWERY },
  { utterance: 'Chào bạn, mình cần tư vấn', expectIntents: ['greeting', 'course_consulting'], expectDecisions: ANSWERY },

  // ask_price (paraphrase-heavy)
  { utterance: 'Khoá này học phí bao nhiêu vậy ạ?', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Cho em xin giá khoá học với', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Học ở đây tốn khoảng bao nhiêu tiền thế', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Một khoá hết nhiêu tiền ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Bảng giá các lớp như nào ạ?', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Lớp giao tiếp giá sao em ơi', expectIntents: ['ask_price'], expectDecisions: ANSWERY },

  // ask_schedule
  { utterance: 'Có lớp học buổi tối không ạ?', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lịch khai giảng sắp tới khi nào vậy', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Mình học vào thứ mấy mấy giờ thế ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Bao giờ thì có lớp mới mở ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },

  // class_info
  { utterance: 'Lớp học online hay offline vậy ạ?', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Trung tâm mình ở địa chỉ nào thế', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Một lớp có bao nhiêu học viên ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp offline với online khác nhau gì không', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },

  // course_consulting
  { utterance: 'Em mất gốc tiếng Anh thì nên học lớp nào ạ?', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn cải thiện giao tiếp thì học khoá nào hợp', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Tư vấn giúp em chọn khoá phù hợp với', expectIntents: ['course_consulting', 'greeting'], expectDecisions: ANSWERY },
  { utterance: 'Em ngại nói tiếng Anh thì nên học gì ạ', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },

  // trial_class
  { utterance: 'Bên mình có cho học thử không ạ?', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Em được học thử demo một buổi không', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Có buổi học thử miễn phí nào không ạ', expectIntents: ['trial_class'], expectDecisions: ANSWERY },

  // promo
  { utterance: 'Hiện có ưu đãi gì không ạ?', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Đăng ký hai bạn có được giảm giá không', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Có khuyến mãi gì cho học sinh sinh viên không ạ', expectIntents: ['promo'], expectDecisions: ANSWERY },

  // placement_test
  { utterance: 'Em muốn test trình độ đầu vào ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },
  { utterance: 'Có bài kiểm tra xếp lớp không ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },

  // policy_question (published policy -> answer)
  { utterance: 'Bên mình có chính sách bảo lưu không ạ?', expectIntents: ['policy_question', 'bao_luu'], expectDecisions: ['answer', 'answer_cta'] },
  { utterance: 'Nếu nghỉ buổi nào thì có được học bù không', expectIntents: ['policy_question'], expectDecisions: ['answer', 'answer_cta'] },
  { utterance: 'Lớp có quay video record lại không ạ', expectIntents: ['policy_question', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Đăng ký rồi có chuyển lớp khác được không', expectIntents: ['policy_question'], expectDecisions: ['answer', 'answer_cta'] },

  // --- SAFETY CRITICAL: must escalate ---
  { utterance: 'Em muốn hoàn lại tiền khoá học ạ', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em xin lại tiền được không', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em đổi ý rồi, trả lại tiền cho em nha', expectIntents: ['refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn rút cọc đã đóng', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em hoàn cọc lại với ạ', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn đóng học phí luôn ạ', expectIntents: ['payment_intent'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em đóng tiền vào số tài khoản nào ạ', expectIntents: ['payment_intent'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em xin STK để chuyển khoản', expectIntents: ['payment_intent', 'payment_confirm'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em chuyển khoản rồi nha shop', expectIntents: ['payment_confirm'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em đã đóng tiền xong rồi ạ', expectIntents: ['payment_confirm', 'payment_intent'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Trung tâm dạy chán quá, em thất vọng', expectIntents: ['complaint'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Dịch vụ bên này tệ thật sự', expectIntents: ['complaint'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em không hài lòng về khoá học chút nào', expectIntents: ['complaint'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Giảm thêm cho em chút nữa được không ạ', expectIntents: ['discount_private'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Bớt giá cho em được không', expectIntents: ['discount_private'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em gặp tư vấn viên trực tiếp với', expectIntents: ['ask_human'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn nói chuyện với người thật ạ', expectIntents: ['ask_human'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em gặp nhân viên tư vấn nha', expectIntents: ['ask_human'], expectDecisions: ['escalate'], safetyCritical: true },
];
