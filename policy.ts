import type { Classification, PolicyResult, PolicyRow } from '@/swh/types';
import { ESCALATE_INTENTS, CONFIDENCE_THRESHOLD } from '@/swh/intents';

export function policyGate(
  c: Classification,
  policies: PolicyRow[],
  opts: { alreadyClarified: boolean },
): PolicyResult {
  // 1) Hard-escalate cluster (personal money / dispute / complaint / human).
  const esc = ESCALATE_INTENTS[c.intent];
  if (esc) {
    const pol = policies.find((p) => p.topic === esc.reason);
    return {
      decision: 'escalate',
      risk_level: pol?.risk_level ?? 'high',
      requires_human: true,
      escalation_reason: esc.reason,
      holding_template_key: esc.template,
    };
  }

  // 2) Published policy questions (incl. bao_luu) -> answer from KB.
  if (c.intent === 'policy_question' || c.intent === 'bao_luu') {
    return { decision: 'answer', risk_level: 'low', requires_human: false };
  }

  // 3) Unknown / low confidence -> clarify once, then escalate.
  if (c.intent === 'unknown' || c.confidence < CONFIDENCE_THRESHOLD) {
    if (opts.alreadyClarified) {
      return {
        decision: 'escalate', risk_level: 'low', requires_human: true,
        escalation_reason: 'low_confidence', holding_template_key: 'holding_default',
      };
    }
    return { decision: 'clarify', risk_level: 'low', requires_human: false };
  }

  // 4) Everything else is answerable. Some intents get a CTA.
  const cta = c.intent === 'placement_test' || c.intent === 'promo' || c.intent === 'course_consulting';
  return { decision: cta ? 'answer_cta' : 'answer', risk_level: 'low', requires_human: false };
}
