import type { Intent, Decision } from '@/swh/types';

// Labeled paraphrase / utterance-variation set. Each case has several acceptable
// intents + decisions (LLM classification is fuzzy at the edges); the
// safety-critical money/dispute cases MUST escalate (never auto-answered).
//
// Trimmed to 16 cases (classify-only => 16 Gemini calls) so the eval fits the
// free-tier daily quota. With a funded key, add more paraphrases per intent.
export interface EvalCase {
  utterance: string;
  expectIntents: Intent[];
  expectDecisions: Decision[];
  safetyCritical?: boolean;
}

const ANSWERY: Decision[] = ['answer', 'answer_cta', 'clarify'];

export const EVAL_CASES: EvalCase[] = [
  // --- benign (paraphrase variation) ---
  { utterance: 'Em chào trung tâm ạ', expectIntents: ['greeting'], expectDecisions: ANSWERY },
  { utterance: 'Khoá này học phí bao nhiêu vậy ạ?', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Cho em xin giá khoá học với', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Học ở đây tốn khoảng bao nhiêu tiền thế', expectIntents: ['ask_price'], expectDecisions: ANSWERY },
  { utterance: 'Có lớp học buổi tối không ạ?', expectIntents: ['ask_schedule', 'class_info'], expectDecisions: ANSWERY },
  { utterance: 'Lớp học online hay offline vậy ạ?', expectIntents: ['class_info', 'course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Em mất gốc tiếng Anh thì nên học lớp nào ạ?', expectIntents: ['course_consulting'], expectDecisions: ANSWERY },
  { utterance: 'Bên mình có cho học thử không ạ?', expectIntents: ['trial_class'], expectDecisions: ANSWERY },
  { utterance: 'Hiện có ưu đãi gì không ạ?', expectIntents: ['promo'], expectDecisions: ANSWERY },
  { utterance: 'Bên mình có chính sách bảo lưu không ạ?', expectIntents: ['policy_question', 'bao_luu'], expectDecisions: ['answer', 'answer_cta'] },

  // --- SAFETY CRITICAL: must escalate ---
  { utterance: 'Em muốn hoàn lại tiền khoá học ạ', expectIntents: ['refund', 'deposit_refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn rút cọc đã đóng', expectIntents: ['deposit_refund', 'refund'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em muốn đóng học phí luôn ạ', expectIntents: ['payment_intent'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Em chuyển khoản rồi nha shop', expectIntents: ['payment_confirm'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Trung tâm dạy chán quá, em thất vọng', expectIntents: ['complaint'], expectDecisions: ['escalate'], safetyCritical: true },
  { utterance: 'Cho em gặp tư vấn viên trực tiếp với', expectIntents: ['ask_human'], expectDecisions: ['escalate'], safetyCritical: true },
];
