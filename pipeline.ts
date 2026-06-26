import type { PipelineInput, PipelineResult, LlmClient, LeadDraft, Asset, Entities } from '@/swh/types';
import { classifyMessage } from '@/swh/classify';
import { policyGate } from '@/swh/policy';
import { selectKnowledge } from '@/swh/kb';
import { generateReply } from '@/swh/generate';
import { validateReply, buildAllowedPriceSet } from '@/swh/guardrails';
import { detectHighRisk } from '@/swh/safety';

function template(assets: Asset[], key: string): string {
  return (
    assets.find((a) => a.type === 'template' && a.key === key)?.value
    ?? 'Bạn để lại Tên + SĐT giúp tụi mình nha, tụi mình sẽ liên hệ lại sớm nhất 🥰'
  );
}

function extractLead(entities: Entities): LeadDraft | undefined {
  const { name, phone, email, course_name } = entities;
  if (!name && !phone && !email) return undefined;
  return { name, phone, email, interested_course: course_name };
}

function summarize(intent: string, text: string): string {
  return `${intent}: "${text.slice(0, 160)}"`;
}

export async function runPipeline(input: PipelineInput, llm: LlmClient): Promise<PipelineResult> {
  const t0 = Date.now();
  const { text, history, kb, alreadyClarified = false } = input;

  const raw = await classifyMessage(text, history, llm);
  // Deterministic safety net: force high-risk intents even if the LLM misses them.
  const forced = detectHighRisk(text);
  const classification = forced
    ? { ...raw, intent: forced, confidence: Math.max(raw.confidence, 0.9) }
    : raw;
  const policy = policyGate(classification, kb.policies, { alreadyClarified });
  const lead = extractLead(classification.entities);

  let reply = '';
  let decision = policy.decision;
  let guardrail = { ok: true, violations: [] as string[] };
  let escalation: PipelineResult['escalation'];
  const sel = selectKnowledge(classification, text, kb);

  if (decision === 'escalate' || decision === 'holding') {
    reply = template(kb.assets, policy.holding_template_key ?? 'holding_default');
    escalation = {
      reason: policy.escalation_reason ?? 'out_of_scope',
      summary: summarize(classification.intent, text),
      risk_level: policy.risk_level,
    };
  } else {
    const allowedLinks = kb.assets.filter((a) => a.type === 'form' || a.type === 'link').map((a) => a.value);
    reply = await generateReply(sel, decision, allowedLinks, history, text, llm);
    guardrail = validateReply(reply, {
      allowedPrices: buildAllowedPriceSet(kb),
      assets: kb.assets,
      requiresHuman: policy.requires_human,
      decision,
    });
    if (!guardrail.ok) {
      reply = template(kb.assets, 'holding_default');
      decision = 'holding';
      escalation = {
        reason: 'guardrail',
        summary: `Guardrail: ${guardrail.violations.join(', ')} | "${text.slice(0, 120)}"`,
        risk_level: 'medium',
      };
    }
  }

  return {
    reply,
    classification,
    decision,
    risk_level: policy.risk_level,
    guardrail,
    escalation,
    lead,
    kb_refs: sel.refs,
    latency_ms: Date.now() - t0,
  };
}
