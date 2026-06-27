import type { KnowledgeBase, Asset, GuardrailResult, Decision } from '@/swh/types';

export function normalizePrice(token: string): string {
  const t = token.toLowerCase().trim();
  // "<n>tr<m>" e.g. 1tr9 => 1.9 triệu
  const trm = t.match(/^(\d+)\s*(?:tr|triệu)\s*(\d)$/u);
  if (trm) return String(Number(trm[1] ?? '0') * 1_000_000 + Number(trm[2] ?? '0') * 100_000);
  const tr = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|chẹo)$/u);
  if (tr) return String(Math.round(Number((tr[1] ?? '0').replace(',', '.')) * 1_000_000));
  const k = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn)$/u);
  if (k) return String(Math.round(Number((k[1] ?? '0').replace(',', '.')) * 1_000));
  // plain separated digits
  return t.replace(/[^\d]/g, '');
}

export function extractPriceMentions(text: string): string[] {
  const out: string[] = [];
  const re = /(\d+\s*(?:tr|triệu|chẹo)\s*\d?|\d+\s*(?:k|nghìn|ngàn)(?!\d)|\d[\d.,]*\s*(?:đ|vnđ)|\d[\d.,]{3,})/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (!m[1]) continue;
    const token = m[1].trim();
    const digits = token.replace(/[^\d]/g, '');
    const hasPriceUnit = /(tr|triệu|chẹo|k|nghìn|ngàn|đ|vnđ)/iu.test(token);
    const plainBirthYear = !hasPriceUnit && /^\d{4}$/u.test(digits) && Number(digits) >= 1900 && Number(digits) <= new Date().getFullYear();
    const twoKBirthShorthand = /^2\s*k$/iu.test(token);
    if (!plainBirthYear && !twoKBirthShorthand) out.push(token);
  }
  return out;
}

export function buildAllowedPriceSet(kb: KnowledgeBase): Set<string> {
  const blob = [
    ...kb.courses.flatMap((c) => [c.promo, c.curriculum, c.helps_with, c.good_for]),
    ...kb.faqs.map((f) => f.answer),
    ...kb.policies.map((p) => p.public_answer),
    ...kb.assets.map((a) => a.value),
    ...(kb.teachers ?? []).flatMap((t) => t.classes.map((cl) => cl.price)),
  ].filter((x): x is string => Boolean(x)).join(' ');
  const set = new Set<string>();
  for (const tok of extractPriceMentions(blob)) {
    const n = normalizePrice(tok);
    if (n) set.add(n);
  }
  // Always-allowed canonical SwH prices (ranges from persona facts).
  ['4900000', '5200000', '6900000', '7900000', '1900000', '1000000', '50000'].forEach((p) => set.add(p));
  return set;
}

const BANNED_TERMS = [
  /\bbot\b/i, /\badmin\b/i, /\boracle\b/i, /\bchatgpt\b/i, /\bopenai\b/i, /\bgpt\b/i, /\btrợ lý ảo\b/i, /\bas an ai\b/i,
];

function extractLinks(text: string): string[] {
  return (text.match(/https?:\/\/[^\s)]+/gu) ?? []).map((u) => u.replace(/[.,)]+$/, ''));
}

export function validateReply(
  reply: string,
  ctx: {
    allowedPrices: Set<string>;
    assets: Asset[];
    requiresHuman: boolean;
    decision: Decision;
    teachers?: Array<{ profile_url?: string; video_urls?: string[] }>;
  },
): GuardrailResult {
  const violations: string[] = [];

  // 1) Prices: every price mention must be in the allowed set.
  for (const tok of extractPriceMentions(reply)) {
    const n = normalizePrice(tok);
    if (n && n.length >= 4 && !ctx.allowedPrices.has(n)) violations.push(`invented_price:${tok}`);
  }

  // 2) Links: every URL must be in the asset registry.
  const allowedUrls = new Set(ctx.assets.map((a) => a.value));
  for (const t of ctx.teachers ?? []) {
    if (t.profile_url) allowedUrls.add(t.profile_url);
    for (const url of t.video_urls ?? []) allowedUrls.add(url);
  }
  for (const url of extractLinks(reply)) {
    if (!allowedUrls.has(url)) violations.push(`unapproved_link:${url}`);
  }

  // 3) Banned internal terms.
  for (const re of BANNED_TERMS) {
    if (re.test(reply)) violations.push(`banned_term:${re.source}`);
  }

  // 4) High-risk must never be answered directly.
  if (ctx.requiresHuman && ctx.decision !== 'escalate' && ctx.decision !== 'holding') {
    violations.push('answered_high_risk');
  }

  return { ok: violations.length === 0, violations };
}
