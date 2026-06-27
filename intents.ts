import type { Intent, EscalationReason } from '@/swh/types';

export const INTENTS: Intent[] = [
  'greeting', 'ask_price', 'ask_schedule', 'class_info', 'course_consulting',
  'placement_test', 'trial_class', 'promo', 'policy_question', 'teacher_info',
  'payment_intent', 'payment_confirm', 'deposit_refund', 'refund',
  'bao_luu', 'complaint', 'discount_private', 'ask_human',
  'recruitment', 'out_of_scope', 'unknown',
];

// Intents that must NEVER be auto-answered: holding reply + human follow-up.
export const ESCALATE_INTENTS: Record<string, { reason: EscalationReason; template: string }> = {
  payment_intent: { reason: 'payment', template: 'holding_payment' },
  payment_confirm: { reason: 'payment', template: 'holding_payment' },
  refund: { reason: 'refund', template: 'holding_refund' },
  deposit_refund: { reason: 'deposit', template: 'holding_refund' },
  complaint: { reason: 'complaint', template: 'holding_complaint' },
  discount_private: { reason: 'discount', template: 'holding_default' },
  ask_human: { reason: 'ask_human', template: 'holding_default' },
  out_of_scope: { reason: 'out_of_scope', template: 'holding_default' },
};

export const CONFIDENCE_THRESHOLD = 0.5;
