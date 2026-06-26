import { describe, it, expect } from 'vitest';
import { policyGate } from '@/swh/policy';
import type { Classification, PolicyRow, Entities } from '@/swh/types';

const policies: PolicyRow[] = [
  { topic: 'bao_luu', risk_level: 'low', public_answer: 'no', allowed_action: 'answer', requires_human: false },
  { topic: 'payment', risk_level: 'high', public_answer: 'x', allowed_action: 'escalate', requires_human: true },
];
const C = (intent: Classification['intent'], confidence = 0.9, entities: Entities = {}): Classification =>
  ({ intent, entities, confidence });

describe('policyGate', () => {
  it('escalates a personal refund request', () => {
    const r = policyGate(C('refund'), policies, { alreadyClarified: false });
    expect(r.decision).toBe('escalate');
    expect(r.escalation_reason).toBe('refund');
    expect(r.holding_template_key).toBe('holding_refund');
    expect(r.risk_level).toBe('high');
  });

  it('escalates payment_confirm (never confirms money)', () => {
    expect(policyGate(C('payment_confirm'), policies, { alreadyClarified: false }).decision).toBe('escalate');
  });

  it('answers a published policy_question', () => {
    const r = policyGate(C('policy_question', 0.9, { policy_topic: 'bao_luu' }), policies, { alreadyClarified: false });
    expect(r.decision).toBe('answer');
    expect(r.requires_human).toBe(false);
  });

  it('answers bao_luu intent as published policy', () => {
    expect(policyGate(C('bao_luu'), policies, { alreadyClarified: false }).decision).toBe('answer');
  });

  it('answers normal intents like ask_price', () => {
    expect(policyGate(C('ask_price'), policies, { alreadyClarified: false }).decision).toBe('answer');
  });

  it('clarifies on unknown the first time', () => {
    expect(policyGate(C('unknown', 0.2), policies, { alreadyClarified: false }).decision).toBe('clarify');
  });

  it('escalates unknown after already clarifying once', () => {
    const r = policyGate(C('unknown', 0.2), policies, { alreadyClarified: true });
    expect(r.decision).toBe('escalate');
    expect(r.escalation_reason).toBe('low_confidence');
  });

  it('clarifies a low-confidence normal intent', () => {
    expect(policyGate(C('ask_price', 0.3), policies, { alreadyClarified: false }).decision).toBe('clarify');
  });
});
