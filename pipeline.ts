import type { PipelineInput, PipelineResult, LlmClient, LeadDraft, Asset, Entities } from '@/swh/types';
import { classifyMessage } from '@/swh/classify';
import { policyGate } from '@/swh/policy';
import { matchTeachers, normalizeVietnamese, selectKnowledge } from '@/swh/kb';
import { generateReply } from '@/swh/generate';
import { validateReply, buildAllowedPriceSet } from '@/swh/guardrails';
import { detectHighRisk } from '@/swh/safety';
import { CONFIDENCE_THRESHOLD } from '@/swh/intents';

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

function detectCasualTeacherInfo(text: string, entities: Entities, kb: PipelineInput['kb']): Entities | null {
  const norm = normalizeVietnamese(text);
  const asksTeacherPersonalInfo =
    /\b(bao nhieu tuoi|may tuoi|tuoi|sinh nam|nam sinh|sn|2k may|doi may|nam nao)\b/u.test(norm);
  if (!asksTeacherPersonalInfo) return null;

  const teachers = matchTeachers(text, entities.teacher_name, kb.teachers ?? []);
  const hasTeacherSignal =
    teachers.length > 0
    || /\b(giao vien|gv|co giao|thay giao|teacher|miss|thay)\b/u.test(norm);

  if (!hasTeacherSignal) return null;
  return {
    ...entities,
    teacher_name: teachers.length === 1 ? teachers[0]?.name : entities.teacher_name,
  };
}

function isCriticalKnowledgeTopic(text: string): boolean {
  const norm = normalizeVietnamese(text)
    .replace(/\b(chua can tu van lop|khong can tu van lop|chua can hoi lop|khong hoi ve lop)\b/gu, '');
  return /\b(hoc phi|gia tien|bao nhieu tien|dong tien|thanh toan|chuyen khoan|stk|khoa hoc|khoa|lop|lo trinh|dau ra|cam ket|lich hoc|lich khai giang|khai giang|ca hoc|gio hoc|si so|online|offline|dia chi|co so|hoc thu|demo|test dau vao|kiem tra trinh do|xep lop|uu dai|giam gia|chinh sach|quy dinh|noi quy|bao luu|nghi|vang|make up|makeup|hoc bu|chuyen lop|record|ghi hinh|hoan tien|hoan coc|refund|tai lieu|giao trinh|dang ky|ghi danh|tuyen dung|tro giang)\b/u.test(norm);
}

function allowsCasualFallback(text: string, classification: { intent: string; confidence: number }): boolean {
  if (isCriticalKnowledgeTopic(text)) return false;
  return (
    classification.intent === 'unknown'
    || classification.intent === 'out_of_scope'
    || classification.confidence < CONFIDENCE_THRESHOLD
  );
}

export async function runPipeline(input: PipelineInput, llm: LlmClient): Promise<PipelineResult> {
  const t0 = Date.now();
  const { text, history, kb, alreadyClarified = false } = input;

  const raw = await classifyMessage(text, history, llm);
  // Deterministic safety net: force high-risk intents even if the LLM misses them.
  const forced = detectHighRisk(text);
  const casualTeacherEntities = forced ? null : detectCasualTeacherInfo(text, raw.entities, kb);
  const classification = forced
    ? { ...raw, intent: forced, confidence: Math.max(raw.confidence, 0.9) }
    : casualTeacherEntities
      ? { ...raw, intent: 'teacher_info' as const, entities: casualTeacherEntities, confidence: Math.max(raw.confidence, 0.9) }
    : raw;
  const policy = policyGate(classification, kb.policies, {
    alreadyClarified,
    casualFallback: !forced && allowsCasualFallback(text, classification),
  });
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
