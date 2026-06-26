export type Intent =
  | 'greeting' | 'ask_price' | 'ask_schedule' | 'class_info' | 'course_consulting'
  | 'placement_test' | 'trial_class' | 'promo' | 'policy_question'
  | 'payment_intent' | 'payment_confirm' | 'deposit_refund' | 'refund'
  | 'bao_luu' | 'complaint' | 'discount_private' | 'ask_human'
  | 'recruitment' | 'out_of_scope' | 'unknown';

export interface Entities {
  course_name?: string;
  level?: string;
  format?: 'online' | 'offline' | 'video' | '1-1';
  preferred_time?: string;
  policy_topic?: string;
  name?: string;
  phone?: string;
  email?: string;
}

export interface Classification {
  intent: Intent;
  entities: Entities;
  confidence: number; // 0..1
}

export type Decision = 'answer' | 'clarify' | 'answer_cta' | 'escalate' | 'holding';
export type RiskLevel = 'low' | 'medium' | 'high';

export type EscalationReason =
  | 'payment' | 'refund' | 'deposit' | 'complaint' | 'discount'
  | 'ask_human' | 'out_of_scope' | 'low_confidence' | 'guardrail' | 'api_failure';

export interface PolicyRow {
  topic: string;
  risk_level: RiskLevel;
  public_answer: string;
  allowed_action: 'answer' | 'holding_then_escalate' | 'escalate';
  requires_human: boolean;
}

export interface Course {
  slug: string; name: string;
  helps_with?: string; good_for?: string; entry_level?: string;
  curriculum?: string; formats?: string; promo?: string; reference_materials?: string;
}

export interface Faq {
  intent_group: string; representative_q: string;
  variants: string[]; answer: string; attachment?: string;
}

export interface Asset {
  type: 'form' | 'image' | 'phone' | 'link' | 'template';
  key: string; label?: string; value: string; when_to_use?: string;
}

export interface KnowledgeBase {
  courses: Course[]; faqs: Faq[]; policies: PolicyRow[]; assets: Asset[];
}

export interface ChatTurn { role: 'user' | 'assistant'; content: string }

export interface PolicyResult {
  decision: Decision;
  risk_level: RiskLevel;
  requires_human: boolean;
  escalation_reason?: EscalationReason;
  holding_template_key?: string;
}

export interface GuardrailResult { ok: boolean; violations: string[] }

export interface LeadDraft {
  name?: string; phone?: string; email?: string; interested_course?: string;
}

export interface PipelineInput {
  text: string;
  history: ChatTurn[];
  kb: KnowledgeBase;
  alreadyClarified?: boolean;
}

export interface PipelineResult {
  reply: string;
  classification: Classification;
  decision: Decision;
  risk_level: RiskLevel;
  guardrail: GuardrailResult;
  escalation?: { reason: EscalationReason; summary: string; risk_level: RiskLevel };
  lead?: LeadDraft;
  kb_refs: string[];
  latency_ms: number;
}

export interface LlmClient {
  classify(prompt: string): Promise<Classification>;
  complete(system: string, messages: ChatTurn[]): Promise<string>;
}

export interface SelectedKnowledge {
  courses: Course[]; faqs: Faq[]; policies: PolicyRow[]; refs: string[];
}
