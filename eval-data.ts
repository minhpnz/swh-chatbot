import type { Intent, Decision } from '@/swh/types';

// Labeled paraphrase / utterance-variation set. Each case has several acceptable
// intents + decisions (LLM classification is fuzzy at the edges), and the
// safety-critical money/dispute cases MUST escalate (never auto-answered).
export interface EvalCase {
  utterance: string;
  expectIntents: Intent[];
  expectDecisions: Decision[];
  safetyCritical?: boolean;
}

const ANSWERY: Decision[] = ['answer', 'answer_cta', 'clarify', 'holding'];

export const EVAL_CASES: EvalCase[] = [
  // --- greeting ---
  { utterance: 'Em chào trung tâm ạ', expectIntents: ['greeting'], expectDecisions: ['answer', 'answer_cta', 'clarify'] },
  { utterance: 'Alo ad ơi', expectIntents: ['greeting', 'unknown'], expectDecisions: ['answer', 'answer_cta', 'clarify'] },
  { utterance: 'Hi shop, cho em hỏi xíu', expectIntents: ['greeting', 'unknown'], expectDecisions: ['answer', 'answer_cta', 'clarify'] },
  { utterance: 'Mình cần tư vấn ạ', expectIntents: ['greeting', 'course_consulting'], expectDecisions: ['answer', 'answer_cta', 'clarify'] },

  // --- ask_price (paraphrases) ---
  { utterance: 'Khoá này học phí bao nhiêu vậy ạ?', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Cho em xin giá khoá học với', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Chi phí một khoá tầm nhiêu tiền thế?', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Học ở đây tốn khoảng bao nhiêu ạ', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Lớp giao tiếp giá sao em ơi', expectIntents: ['ask_price'], expectDecisions: ANSWERY },

  // --- ask_schedule (paraphrases) ---
  { utterance: 'Có lớp học buổi tối không ạ?', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lịch khai giảng sắp tới khi nào vậy', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Mình học vào thứ mấy mấy giờ thế ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Bao giờ thì có lớp mới mở ạ', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },

  // --- class_info ---
  { utterance: 'Lớp học online hay offline vậy ạ?', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Trung tâm mình ở địa chỉ nào thế', expectIntents: ['class_info'], expectDecisions: ANSWERY },
  { utterance: 'Một lớp có bao nhiêu học viên ạ', expectIntents: ['class_info'], expectDecisions: ANSWERY },

  // --- course_consulting ---
  { utterance: 'Em mất gốc tiếng Anh thì nên học lớp nào ạ?', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Em muốn cải thiện giao tiếp thì học khoá nào hợp', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Tư vấn giúp em chọn khoá phù hợp với', expectIntents: ['course_consulting', 'greeting'], expectDecisions: ANSWERY },

  // --- trial_class ---
  { utterance: 'Bên mình có cho học thử không ạ?', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Em được học demo một buổi không', expectIntents: ['trial_class'], expectDecisions: ANSWERY },

  // --- promo ---
  { utterance: 'Hiện có ưu đãi gì không ạ?', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Đăng ký hai bạn có được giảm giá không', expectIntents: ['promo'], expectDecisions: ANSWERY },

  // --- placement_test ---
  { utterance: 'Em muốn test trình độ đầu vào ạ', expectIntents: ['placement_test'], expectDecisions: ANSWERY },

  // --- policy_question (published policy: answer, not escalate) ---
  { utterance: 'Bên mình có chính sách bảo lưu không ạ?', expectIntents: ['policy_question', 'bao_luu'], expectDecisions: ['answer', 'answer_cta'] },
  { utterance: 'Nếu nghỉ buổi nào thì có được học bù không', expectIntents: ['policy_question'], expectDecisions: ['answer', 'answer_cta'] },
  { utterance: 'Đăng ký rồi mà bận thì hoàn tiền được không nhỉ', expectIntents: ['policy_question', 'refund'], expectDecisions: ['answer', 'answer_cta', 'escalate'] },

  // --- SAFETY CRITICAL: must escalate ---
  { utterance: 'Em muốn hoàn lại tiền khoá học ạ', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em xin lại tiền được không', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn rút cọc đã đóng', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn đóng học phí luôn ạ', expectIntents: ['payment_intent'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em chuyển khoản rồi nha shop', expectIntents: ['payment_confirm'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em đóng tiền vào số tài khoản nào', expectIntents: ['payment_intent'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Trung tâm dạy chán quá, em thất vọng', expectIntents: ['complaint'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Giảm thêm cho em chút nữa được không ạ', expectIntents: ['discount_private'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em gặp tư vấn viên trực tiếp với', expectIntents: ['ask_human'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn nói chuyện với người thật ạ', expectIntents: ['ask_human'], expectDecisions: ['escalate'], safetyCritical: true },
];
