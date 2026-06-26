import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { ChatTurn, PipelineResult, LeadDraft } from '@/swh/types';

type Db = ReturnType<typeof createAdminClient>;

export async function ensureConversation(db: Db, conversationId?: string): Promise<string> {
  if (conversationId) {
    const { data } = await db.from('swh_conversations').select('id').eq('id', conversationId).maybeSingle();
    if (data?.id) return data.id as string;
  }
  const { data, error } = await db.from('swh_conversations').insert({}).select('id').single();
  if (error) throw new Error(`ensureConversation: ${error.message}`);
  return data.id as string;
}

export async function getHistory(db: Db, conversationId: string, limit = 12): Promise<ChatTurn[]> {
  const { data } = await db.from('swh_messages')
    .select('role,text').eq('conversation_id', conversationId)
    .order('created_at', { ascending: true }).limit(limit);
  return (data ?? []).map((m: { role: string; text: string }) => ({ role: m.role as ChatTurn['role'], content: m.text }));
}

export async function lastUserMessageAt(db: Db, conversationId: string): Promise<string | null> {
  const { data } = await db.from('swh_messages')
    .select('created_at').eq('conversation_id', conversationId).eq('role', 'user')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data?.created_at as string) ?? null;
}

export async function lastAssistantWasClarify(db: Db, conversationId: string): Promise<boolean> {
  const { data } = await db.from('swh_messages')
    .select('meta').eq('conversation_id', conversationId).eq('role', 'assistant')
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  return (data?.meta as { decision?: string } | null)?.decision === 'clarify';
}

export async function saveUserMessage(db: Db, conversationId: string, text: string): Promise<void> {
  await db.from('swh_messages').insert({ conversation_id: conversationId, role: 'user', text });
}

export async function saveAssistantResult(db: Db, conversationId: string, result: PipelineResult): Promise<void> {
  const meta = {
    intent: result.classification.intent,
    entities: result.classification.entities,
    confidence: result.classification.confidence,
    decision: result.decision,
    risk_level: result.risk_level,
    kb_refs: result.kb_refs,
    guardrail_ok: result.guardrail.ok,
    guardrail_violations: result.guardrail.violations,
    latency_ms: result.latency_ms,
  };
  await db.from('swh_messages').insert({ conversation_id: conversationId, role: 'assistant', text: result.reply, meta });
  await db.from('swh_conversations')
    .update({ last_intent: result.classification.intent, updated_at: new Date().toISOString() })
    .eq('id', conversationId);

  if (result.escalation) {
    await db.from('swh_escalations').insert({
      conversation_id: conversationId,
      reason: result.escalation.reason,
      risk_level: result.escalation.risk_level,
      summary: result.escalation.summary,
    });
    await db.from('swh_conversations').update({ status: 'needs_followup' }).eq('id', conversationId);
  }
  if (result.classification.intent === 'ask_human') {
    await db.from('swh_conversations').update({ bot_paused: true }).eq('id', conversationId);
  }
}

export async function upsertLead(db: Db, conversationId: string, lead: LeadDraft): Promise<void> {
  const { data } = await db.from('swh_leads')
    .select('name,phone,email,interested_course').eq('conversation_id', conversationId).maybeSingle();
  const merged = {
    conversation_id: conversationId,
    name: lead.name ?? data?.name ?? null,
    phone: lead.phone ?? data?.phone ?? null,
    email: lead.email ?? data?.email ?? null,
    interested_course: lead.interested_course ?? data?.interested_course ?? null,
    updated_at: new Date().toISOString(),
  };
  await db.from('swh_leads').upsert(merged, { onConflict: 'conversation_id' });
}

export async function isBotPaused(db: Db, conversationId: string): Promise<boolean> {
  const { data } = await db.from('swh_conversations').select('bot_paused').eq('id', conversationId).maybeSingle();
  return Boolean(data?.bot_paused);
}

// ---- admin reads ----
export async function listConversations(db: Db) {
  const { data } = await db.from('swh_conversations').select('*').order('updated_at', { ascending: false }).limit(100);
  return data ?? [];
}
export async function getConversationDetail(db: Db, id: string) {
  const [conv, msgs, lead, esc] = await Promise.all([
    db.from('swh_conversations').select('*').eq('id', id).maybeSingle(),
    db.from('swh_messages').select('*').eq('conversation_id', id).order('created_at', { ascending: true }),
    db.from('swh_leads').select('*').eq('conversation_id', id).maybeSingle(),
    db.from('swh_escalations').select('*').eq('conversation_id', id).order('created_at', { ascending: false }),
  ]);
  return { conversation: conv.data, messages: msgs.data ?? [], lead: lead.data, escalations: esc.data ?? [] };
}
export async function listEscalations(db: Db, status?: string) {
  let q = db.from('swh_escalations').select('*').order('created_at', { ascending: false }).limit(100);
  if (status) q = q.eq('status', status);
  const { data } = await q;
  return data ?? [];
}
export async function updateEscalationStatus(db: Db, id: string, status: string): Promise<void> {
  const patch: Record<string, unknown> = { status };
  if (status === 'resolved') patch.resolved_at = new Date().toISOString();
  await db.from('swh_escalations').update(patch).eq('id', id);
}
