# SwH AI Consultant Chatbot — MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a brand-facing web chat page where real prospective students talk to an AI consultant for *SpeakwithHang* (SwH), backed by a team admin inbox — built inside the existing `nomadcraft-next` app.

**Architecture:** A stateless request/response pipeline (classify → policy gate → assemble → generate → deterministic guardrail → persist) runs in Next.js route handlers. All conversation state lives in Supabase Postgres keyed by `conversation_id`, so simultaneous chatters are fully isolated and Vercel's serverless functions scale horizontally. A small structured knowledge base (3 courses + ~30 FAQs + policies + asset registry) is loaded from Postgres and injected into context — **no vector DB** (the KB fits in one model context). High-risk money/dispute/complaint cases never get an AI answer; they get a holding reply + an escalation record for async human follow-up.

**Tech Stack:** Next.js 16 + React 19 (existing), TypeScript, Supabase Postgres (existing, `@supabase/supabase-js` admin client), OpenAI (`openai` SDK), Vitest (unit), Playwright (e2e). All SwH code is namespaced under `nomadcraft-next/swh/` for easy future extraction.

---

## ⚠️ Pre-flight notes for the implementer

1. **Next.js 16 has breaking changes.** `nomadcraft-next/AGENTS.md` warns: *"This is NOT the Next.js you know — read `node_modules/next/dist/docs/` before writing any code."* Before writing any `app/**/route.ts` or `page.tsx`, skim the relevant Next 16 route-handler / server-component docs in that folder.
2. **All paths below are relative to `nomadcraft-next/`** unless they start with `swh_data/` (the source CSVs at `/Users/minhphan/Desktop/code/swh_data/`).
3. **Import alias:** the repo maps `@/*` → project root (confirmed: `import { createClient } from '@/lib/supabase/server'`). So `@/swh/pipeline` → `swh/pipeline.ts`.
4. **DB access:** use `createAdminClient()` from `@/lib/supabase/admin` (service role, bypasses RLS) in all SwH route handlers. Students never touch the DB directly.
5. **Same origin:** UI and API are in the same app → **no CORS**.
6. **Run all commands from `nomadcraft-next/`.**

---

## File Structure

**Portable SwH logic (`nomadcraft-next/swh/`) — the future-extraction unit:**

| File | Responsibility |
|---|---|
| `swh/types.ts` | All shared TypeScript types/contracts |
| `swh/intents.ts` | Intent taxonomy + intent→escalation/template maps |
| `swh/persona.ts` | SwH system-persona constant + static "facts" block |
| `swh/kb.ts` | Load KB from Supabase; `selectKnowledge()` relevance slice |
| `swh/llm.ts` | `LlmClient` interface + OpenAI implementation |
| `swh/classify.ts` | Build classify prompt + parse → `Classification` |
| `swh/policy.ts` | `policyGate()` — deterministic risk routing |
| `swh/guardrails.ts` | `validateReply()` — price/link/term/high-risk checks |
| `swh/generate.ts` | Build generation system prompt + call LLM |
| `swh/pipeline.ts` | `runPipeline()` — orchestrates everything (pure, injectable) |
| `swh/persistence.ts` | Supabase reads/writes (conversations, messages, leads, escalations, inbox) |
| `swh/rate-limit.ts` | Per-conversation throttle |
| `swh/admin-auth.ts` | Shared-password check for admin endpoints |
| `swh/seed-data/courses.json` | 3 curated courses |
| `swh/seed-data/policies.json` | Curated policy matrix rows |
| `swh/seed-data/assets.json` | Approved links/images/phone/templates registry |
| `swh/seed-data/faq.csv` | Copy of the FAQ source CSV (parsed at seed time) |
| `swh/seed.ts` | Seed script: parse + upsert KB into Supabase |
| `swh/components/ChatWidget.tsx` | Student chat UI (client component) |
| `swh/components/InboxApp.tsx` | Admin worklist UI (client component) |
| `swh/*.test.ts` | Co-located Vitest unit tests |

**Thin glue that must live outside `swh/`:**

| File | Responsibility |
|---|---|
| `supabase/migrations/20260626000000_swh_chatbot.sql` | All `swh_*` tables + indexes + RLS |
| `app/swh-chatbot/page.tsx` | Renders `<ChatWidget/>` |
| `app/swh-inbox/page.tsx` | Renders `<InboxApp/>` |
| `app/api/swh/chat/route.ts` | POST: run pipeline + persist |
| `app/api/swh/admin/conversations/route.ts` | GET list (password-gated) |
| `app/api/swh/admin/conversations/[id]/route.ts` | GET one conversation + messages |
| `app/api/swh/admin/escalations/route.ts` | GET list + PATCH status |
| `tests/swh-chat.e2e.ts` | Playwright smoke (mocked chat API) |

---

## Phase 0 — Setup

### Task 0.1: Dependencies, env vars, test config

**Files:**
- Modify: `package.json` (deps + script)
- Modify: `.env.example`, `.env.local`
- Modify: `vitest.config.mts` (ensure `swh/` tests are included)

- [ ] **Step 1: Install runtime + dev deps**

Run:
```bash
npm install openai papaparse
npm install -D @types/papaparse tsx
```
Expected: packages added, no errors.

- [ ] **Step 2: Add seed script to package.json**

In `package.json` `"scripts"`, add:
```json
"swh:seed": "tsx swh/seed.ts"
```

- [ ] **Step 3: Add env var names**

Append to `.env.example`:
```
# --- SwH chatbot ---
OPENAI_API_KEY=sk-...           # OpenAI API key (server-side only)
SWH_ADMIN_PASSWORD=             # Shared password gating /swh-inbox
# Optional model overrides (defaults: classify=gpt-4o-mini, generate=gpt-4o)
# SWH_CLASSIFY_MODEL=
# SWH_GENERATE_MODEL=
```

Add real values to `.env.local` (copy `OPENAI_API_KEY` from `/Users/minhphan/Desktop/code/swh/.env`, and set a `SWH_ADMIN_PASSWORD`). Do not commit `.env.local`.

- [ ] **Step 4: Ensure Vitest picks up `swh/` tests**

Read `vitest.config.mts`. If it has an `include` array that does not already match `swh/**`, add `'swh/**/*.test.ts'`. If there is no `include` (Vitest defaults already match `**/*.test.ts`), leave it unchanged.

- [ ] **Step 5: Verify toolchain**

Run:
```bash
npx tsc --noEmit && npx vitest run --silent
```
Expected: typecheck passes; Vitest runs (0 SwH tests yet is fine).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example vitest.config.mts
git commit -m "chore(swh): add openai/papaparse deps, env vars, seed script"
```

---

### Task 0.2: Database migration for `swh_*` tables

**Files:**
- Create: `supabase/migrations/20260626000000_swh_chatbot.sql`

- [ ] **Step 1: Write the migration**

```sql
-- SwH chatbot schema. All tables prefixed swh_. RLS enabled with NO anon
-- policies: only the service-role key (used by route handlers) may read/write.
-- Students never access the DB directly.

-- ---------- runtime + audit ----------
CREATE TABLE public.swh_conversations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    status      text NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','needs_followup','closed')),
    bot_paused  boolean NOT NULL DEFAULT false,
    last_intent text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swh_messages (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.swh_conversations(id) ON DELETE CASCADE,
    role            text NOT NULL CHECK (role IN ('user','assistant')),
    text            text NOT NULL,
    meta            jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_swh_messages_conv ON public.swh_messages (conversation_id, created_at);

CREATE TABLE public.swh_leads (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id     uuid NOT NULL UNIQUE REFERENCES public.swh_conversations(id) ON DELETE CASCADE,
    name                text,
    phone               text,
    email               text,
    interested_course   text,
    placement_form_sent boolean NOT NULL DEFAULT false,
    status              text NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted')),
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swh_escalations (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.swh_conversations(id) ON DELETE CASCADE,
    reason          text NOT NULL CHECK (reason IN
                      ('payment','refund','deposit','complaint','discount',
                       'ask_human','out_of_scope','low_confidence','guardrail','api_failure')),
    risk_level      text NOT NULL DEFAULT 'medium' CHECK (risk_level IN ('low','medium','high')),
    summary         text NOT NULL DEFAULT '',
    status          text NOT NULL DEFAULT 'needs_followup'
                      CHECK (status IN ('needs_followup','in_progress','resolved')),
    created_at      timestamptz NOT NULL DEFAULT now(),
    resolved_at     timestamptz
);
CREATE INDEX idx_swh_escalations_status ON public.swh_escalations (status, created_at DESC);

-- ---------- knowledge base ----------
CREATE TABLE public.swh_courses (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    slug                text NOT NULL UNIQUE,
    name                text NOT NULL,
    helps_with          text,
    good_for            text,
    entry_level         text,
    curriculum          text,
    formats             text,
    promo               text,
    reference_materials text,
    status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    version             int  NOT NULL DEFAULT 1,
    updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swh_faqs (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    intent_group     text NOT NULL,
    representative_q text NOT NULL,
    variants         text[] NOT NULL DEFAULT '{}',
    answer           text NOT NULL,
    attachment       text,
    status           text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    version          int  NOT NULL DEFAULT 1,
    updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swh_policies (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    topic          text NOT NULL UNIQUE,
    risk_level     text NOT NULL CHECK (risk_level IN ('low','medium','high')),
    public_answer  text NOT NULL DEFAULT '',
    allowed_action text NOT NULL CHECK (allowed_action IN ('answer','holding_then_escalate','escalate')),
    requires_human boolean NOT NULL DEFAULT false,
    version        int  NOT NULL DEFAULT 1,
    status         text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.swh_assets (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type        text NOT NULL CHECK (type IN ('form','image','phone','link','template')),
    key         text NOT NULL UNIQUE,
    label       text,
    value       text NOT NULL,
    when_to_use text,
    status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive')),
    updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------- RLS: enable, no anon policies (service role bypasses) ----------
ALTER TABLE public.swh_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swh_messages      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swh_leads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swh_escalations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swh_courses       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swh_faqs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swh_policies      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swh_assets        ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 2: Apply the migration**

Apply via your Supabase workflow (e.g. `supabase db push`, or paste into the Supabase SQL editor for the project in `.env.local`).

- [ ] **Step 3: Verify tables exist**

Run a quick check (psql or Supabase SQL editor):
```sql
SELECT table_name FROM information_schema.tables
WHERE table_name LIKE 'swh_%' ORDER BY table_name;
```
Expected: 8 rows (`swh_assets`, `swh_conversations`, `swh_courses`, `swh_escalations`, `swh_faqs`, `swh_leads`, `swh_messages`, `swh_policies`).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260626000000_swh_chatbot.sql
git commit -m "feat(swh): add swh_* schema migration"
```

---

## Phase 1 — Knowledge base

### Task 1.1: Shared types

**Files:**
- Create: `swh/types.ts`

- [ ] **Step 1: Write the types**

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add swh/types.ts
git commit -m "feat(swh): shared types"
```

---

### Task 1.2: Intent taxonomy + persona

**Files:**
- Create: `swh/intents.ts`
- Create: `swh/persona.ts`

- [ ] **Step 1: Write `swh/intents.ts`**

```ts
import type { Intent, EscalationReason } from '@/swh/types';

export const INTENTS: Intent[] = [
  'greeting','ask_price','ask_schedule','class_info','course_consulting',
  'placement_test','trial_class','promo','policy_question',
  'payment_intent','payment_confirm','deposit_refund','refund',
  'bao_luu','complaint','discount_private','ask_human',
  'recruitment','out_of_scope','unknown',
];

// Intents that must NEVER be auto-answered: holding reply + human follow-up.
export const ESCALATE_INTENTS: Record<string, { reason: EscalationReason; template: string }> = {
  payment_intent:   { reason: 'payment',     template: 'holding_payment' },
  payment_confirm:  { reason: 'payment',     template: 'holding_payment' },
  refund:           { reason: 'refund',      template: 'holding_refund' },
  deposit_refund:   { reason: 'deposit',     template: 'holding_refund' },
  complaint:        { reason: 'complaint',   template: 'holding_complaint' },
  discount_private: { reason: 'discount',    template: 'holding_default' },
  ask_human:        { reason: 'ask_human',   template: 'holding_default' },
  out_of_scope:     { reason: 'out_of_scope',template: 'holding_default' },
};

export const CONFIDENCE_THRESHOLD = 0.5;
```

- [ ] **Step 2: Write `swh/persona.ts`** (faithful to `swh_data/...Trang tính4.csv`, adapted for web chat)

```ts
// SwH consultant persona. Source of truth for tone + hard rules.
// Adapted from the SwH system prompt (Trang tính4) for a web chat surface.
export const SWH_PERSONA = `Bạn là trợ lý tư vấn online cho trung tâm tiếng Anh "SpeakwithHang" (SwH) do Thanh Hằng sáng lập. Tư vấn thân thiện, dễ thương, hợp Gen Z (ví dụ nói "hem" thay cho "không"), bằng tiếng Việt.

Nguyên tắc:
1. Flow tư vấn: (1) hiểu nhu cầu → (2) gợi ý khoá phù hợp → (3) xin Tên + SĐT để tư vấn kỹ + gửi form test trình độ → (4) hẹn tư vấn.
2. Khi khách hỏi giá: chỉ nói mức khoảng (range) đã được cung cấp, KHÔNG bịa con số cụ thể; hướng khách để lại thông tin + xem lịch khai giảng.
3. Khi khách chưa rõ nhu cầu: hỏi lại đúng 1 câu.
4. KHÔNG gọi Thanh Hằng là "cô" hay "chị"; chỉ dùng tên "Thanh Hằng" khi cần.
5. KHÔNG tự nói chắc chắn về hoàn tiền/hoàn cọc/bảo lưu cho trường hợp cá nhân, KHÔNG xác nhận thanh toán.
6. KHÔNG dùng từ nội bộ ("bot", "admin", "tag", "AI"). Luôn xưng "tụi mình"/"SwH".
7. Chỉ dùng link/hình đã được cung cấp trong phần dữ liệu; KHÔNG tự tạo link.`;

// Static facts the bot may state (ranges only — no invented specifics).
export const SWH_FACTS = `THÔNG TIN CHUNG (được phép nói):
- 3 lộ trình: Ngữ pháp căn bản (mất gốc) | Phát âm chuyên sâu (Phát âm plus) | Phát âm & Giao tiếp (đã có nền cơ bản).
- Học phí THAM KHẢO theo khoảng: lớp Online ~4.900.000đ–5.200.000đ; lớp Offline ~6.900.000đ–7.900.000đ. (Con số chính xác tuỳ format/sĩ số/thời lượng → mời khách để lại thông tin + xem lịch khai giảng.)
- Khoá Video record: ~1.900.000đ. Kèm 1-1: đóng theo mỗi 9 buổi.
- Đặt cọc giữ slot: 1.000.000đ ("1 chẹo").
- Offline tại 14/38A Kỳ Đồng, Quận 3, TP.HCM; Online học qua Zoom.
- Ưu đãi hiện có: giảm 50k (học viên cũ học tiếp / có bạn học cùng / lớp OFF nhà xa >10km, chỉ áp dụng lớp không có học phí ưu đãi); Affiliate 50k khi giới thiệu bạn.
- Hotline gấp: 032 965 1802. Giờ làm việc 9h–17h, T2–T7.`;
```

- [ ] **Step 3: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add swh/intents.ts swh/persona.ts
git commit -m "feat(swh): intent taxonomy + persona constants"
```

---

### Task 1.3: Curated seed data (courses, policies, assets) + FAQ CSV

**Files:**
- Create: `swh/seed-data/courses.json`
- Create: `swh/seed-data/policies.json`
- Create: `swh/seed-data/assets.json`
- Create: `swh/seed-data/faq.csv`

- [ ] **Step 1: Copy the FAQ source CSV into the repo**

Run:
```bash
cp "/Users/minhphan/Desktop/code/swh_data/SWH_FAQ_KnowledgeBase_Reply_Full.xlsm - FAQ.csv" swh/seed-data/faq.csv
```
Expected: `swh/seed-data/faq.csv` exists (header row: `Nhóm câu hỏi (Intent),Câu hỏi đại diện,Các biến thể câu hỏi trong nhóm,Câu trả lời,File đính kèm`).

- [ ] **Step 2: Write `swh/seed-data/courses.json`** (merged from both course sheets)

```json
[
  {
    "slug": "phat-am-plus",
    "name": "Phát âm plus (Phát âm chuyên sâu)",
    "helps_with": "Nắm vững 44 âm IPA; nắn chỉnh phát âm giọng Anh–Mỹ; nối/nuốt/giảm âm; đọc âm đuôi -s/es, -ed; mở rộng ý tưởng khi nói. Bổ trợ Speaking (phát âm) và Listening.",
    "good_for": "Bạn đã biết tiếng Anh căn bản, muốn người nghe hiểu rõ điều mình nói, muốn sửa các lỗi phát âm cũ. Đầu vào: bài test >= 10.",
    "entry_level": "Bài test đầu vào >= 10",
    "curriculum": "44 âm IPA; nối-nuốt-giảm âm; âm đuôi -s/es,-ed; mở rộng ý tưởng. Bài tập: nắn chỉnh phát âm từ-câu-đoạn, role-play, dictation, shadowing & dubbing.",
    "formats": "Online; Kèm 1-1",
    "promo": "Giảm 50k (học viên cũ học tiếp / có bạn học cùng / lớp OFF nhà xa >10km — chỉ lớp không có học phí ưu đãi). Affiliate 50k khi giới thiệu bạn.",
    "reference_materials": "Slides: th sounds; 6 sibilant sounds."
  },
  {
    "slug": "phat-am-giao-tiep",
    "name": "Phát âm và Giao tiếp cơ bản",
    "helps_with": "44 âm IPA; phát âm giọng Anh–Mỹ; mở rộng ý tưởng; luyện phản xạ giao tiếp, mạnh dạn và tự tin nói tiếng Anh. Bổ trợ Speaking & Listening.",
    "good_for": "Bạn đã có nền ngữ pháp cơ bản; hiểu người khác nói nhưng chưa phản xạ được; muốn cải thiện phát âm + luyện giao tiếp. Đầu vào: IELTS >=5.0 / TOEIC >=650 / điểm trường >7 / bài test >=15.",
    "entry_level": "IELTS >=5.0 | TOEIC >=650 | test đầu vào >=15",
    "curriculum": "3 giai đoạn (~4 tháng): GĐ1 Nền tảng IPA + chủ đề cơ bản (~1.5 tháng); GĐ2 nối/giảm/nuốt âm, shadowing, dictation, chủ đề giao tiếp (~1.5 tháng); GĐ3 Vlog tiếng Anh + thuyết trình (~1 tháng). Bài tập: short clip 1-1, mind map, dictation, ghi âm, vlog, thuyết trình.",
    "formats": "Online/Offline; Video record; Kèm 1-1",
    "promo": "Giảm 50k (như trên). Affiliate 50k.",
    "reference_materials": "Slides: th sounds; chủ đề Appearance; từ vựng tổng quan."
  },
  {
    "slug": "ngu-phap-can-ban",
    "name": "Ngữ pháp căn bản",
    "helps_with": "Nắm vững từ loại, thành phần câu, 6 thì cơ bản, các dạng động từ, các mẫu câu quan trọng. Bổ trợ chính cho Writing.",
    "good_for": "Bạn đã tiếp xúc tiếng Anh nhưng chưa chắc/mất gốc; hiểu từ vựng cơ bản; chưa biết hình thành câu, vị trí từ loại, cách dùng thì. Đầu vào: IELTS <=4.0 / TOEIC <=400 / điểm trường <=5 / bài test <=10.",
    "entry_level": "IELTS <=4.0 | TOEIC <=400 | test đầu vào <=10",
    "curriculum": "Từ loại; thành phần câu; 6 thì cơ bản; dạng động từ (V-inf, to-inf, gerund); các dạng câu (so sánh, điều kiện, bị động, tường thuật, mệnh đề quan hệ, câu hỏi đuôi). Bài tập: GG form ôn tập, viết/dịch câu-đoạn, list từ vựng A1-A2.",
    "formats": "Online; Offline; Kèm 1-1",
    "promo": "Giảm 50k (như trên). Affiliate 50k.",
    "reference_materials": "Slides + handout Danh từ; từ vựng tổng quan."
  }
]
```

- [ ] **Step 3: Write `swh/seed-data/policies.json`** (the deterministic gate; answers verbatim from FAQ data)

```json
[
  {
    "topic": "bao_luu",
    "risk_level": "low",
    "public_answer": "Hiện tại bên mình hông có chính sách bảo lưu khóa học nha. Các lớp được khai giảng liên tục trong năm, nên nếu thời gian này bạn đang bận thì có thể sắp xếp đăng ký lớp tiếp theo khi phù hợp hơn nè.",
    "allowed_action": "answer",
    "requires_human": false
  },
  {
    "topic": "refund_policy",
    "risk_level": "low",
    "public_answer": "Tụi mình hông hoàn lại fee với bất cứ trường hợp nghỉ ngang nào nha. Trước khi đăng ký, tụi mình sẽ gửi bạn video record của GV để bạn xem kỹ cách dạy có hợp với mình hem, hợp rồi mới đăng ký nha.",
    "allowed_action": "answer",
    "requires_human": false
  },
  {
    "topic": "absence_makeup",
    "risk_level": "low",
    "public_answer": "SwH hông có lớp học bù, nhưng tụi mình sẽ cấp video record buổi học đó. Lưu ý: mỗi tháng chỉ được nghỉ tối đa 2 buổi mới được cấp video; từ buổi thứ 3 trở đi thì hông cấp được nữa nha.",
    "allowed_action": "answer",
    "requires_human": false
  },
  {
    "topic": "transfer_class",
    "risk_level": "low",
    "public_answer": "Nếu lớp bạn đăng ký CHƯA khai giảng và có lý do hợp lý thì tụi mình có thể hỗ trợ chuyển lớp nếu còn slot nha. Còn lớp đã khai giảng thì hông chuyển được do nội dung mỗi lớp đã khác nhau rồi.",
    "allowed_action": "answer",
    "requires_human": false
  },
  {
    "topic": "record_policy",
    "risk_level": "low",
    "public_answer": "Tụi mình chỉ cấp video record cho bạn nghỉ có lý do bất khả kháng thôi nha (tối đa 2 buổi/tháng). Đi học mà có record sẵn thì dễ mất tập trung, học hông hiệu quả đó.",
    "allowed_action": "answer",
    "requires_human": false
  },
  {
    "topic": "deposit",
    "risk_level": "high",
    "public_answer": "Để giữ slot lớp thì tụi mình nhận cọc 1.000.000đ nha. Bạn để lại Tên + SĐT, tụi mình sẽ hướng dẫn cụ thể nhen.",
    "allowed_action": "holding_then_escalate",
    "requires_human": true
  },
  {
    "topic": "payment",
    "risk_level": "high",
    "public_answer": "Phần đóng tiền/thanh toán tụi mình sẽ nhờ tư vấn viên hỗ trợ trực tiếp cho chính xác nha. Bạn để lại Tên + SĐT giúp tụi mình nhé.",
    "allowed_action": "escalate",
    "requires_human": true
  },
  {
    "topic": "complaint",
    "risk_level": "high",
    "public_answer": "Tụi mình xin lỗi vì trải nghiệm chưa tốt của bạn nha. Bạn để lại Tên + SĐT, tụi mình sẽ nhờ người phụ trách liên hệ lại để hỗ trợ bạn sớm nhất.",
    "allowed_action": "escalate",
    "requires_human": true
  },
  {
    "topic": "discount_private",
    "risk_level": "medium",
    "public_answer": "Về ưu đãi riêng thì tụi mình sẽ nhờ tư vấn viên xem giúp bạn nha. Bạn để lại Tên + SĐT giúp tụi mình nhé.",
    "allowed_action": "escalate",
    "requires_human": true
  }
]
```

- [ ] **Step 4: Write `swh/seed-data/assets.json`** (approved registry: links/images/phone + holding/auto-reply templates)

```json
[
  { "type": "form", "key": "form_general", "label": "Form tư vấn chung", "value": "https://forms.gle/b4sbjbLG6nkfAaGbA", "when_to_use": "Khách hỏi tư vấn chung / để lại thông tin" },
  { "type": "form", "key": "form_placement", "label": "Form test trình độ", "value": "https://forms.gle/2TpDaYTAGaEMXyKN8", "when_to_use": "Khách quan tâm 1 khoá cụ thể / cần đánh giá level" },
  { "type": "image", "key": "img_banner_grammar", "label": "Banner tổng ngữ pháp", "value": "https://speakwithhang.com/wp-content/uploads/2025/09/banner-tong-ngu-phap.jpg", "when_to_use": "Tư vấn chung" },
  { "type": "image", "key": "img_banner_speaking", "label": "Banner giao tiếp", "value": "https://speakwithhang.com/wp-content/uploads/2025/09/banner-tong-giao-tiep.jpg", "when_to_use": "Hỏi lớp online/giao tiếp" },
  { "type": "phone", "key": "hotline", "label": "Hotline", "value": "032 965 1802", "when_to_use": "Khách cần liên hệ gấp" },
  { "type": "template", "key": "holding_payment", "value": "Phần đóng tiền/thanh toán tụi mình sẽ nhờ tư vấn viên hỗ trợ trực tiếp cho chính xác nha. Bạn cho tụi mình xin Tên + SĐT để tư vấn viên liên hệ lại sớm nhất nhé 🥰" },
  { "type": "template", "key": "holding_refund", "value": "Về phần hoàn tiền/hoàn cọc của trường hợp cụ thể của bạn, tụi mình xin phép nhờ tư vấn viên kiểm tra và hỗ trợ trực tiếp nha. Bạn để lại Tên + SĐT giúp tụi mình nhé 🩷" },
  { "type": "template", "key": "holding_complaint", "value": "Tụi mình thành thật xin lỗi vì trải nghiệm chưa tốt nha 🥺. Bạn cho tụi mình xin Tên + SĐT, tụi mình sẽ nhờ người phụ trách liên hệ lại hỗ trợ bạn sớm nhất ạ." },
  { "type": "template", "key": "holding_default", "value": "Phần này tụi mình xin phép nhờ tư vấn viên hỗ trợ trực tiếp cho bạn nha. Bạn để lại Tên + SĐT giúp tụi mình, tụi mình sẽ liên hệ lại sớm nhất nhé 🥰" },
  { "type": "template", "key": "fallback_error", "value": "Tin nhắn tụi mình đang hơi quá tải xíu 🥹. Bạn để lại Tên + SĐT, tụi mình sẽ liên hệ lại tư vấn cho bạn sớm nhất nha!" }
]
```

- [ ] **Step 5: Commit**

```bash
git add swh/seed-data/
git commit -m "feat(swh): curated KB seed data + FAQ csv"
```

---

### Task 1.4: Seed script (parse + upsert KB into Supabase)

**Files:**
- Create: `swh/seed.ts`

- [ ] **Step 1: Write the seed script**

```ts
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import type { Course, Faq, PolicyRow, Asset } from '@/swh/types';

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase env vars');
  return createClient(url, key);
}

function load<T>(file: string): T {
  return JSON.parse(readFileSync(resolve('swh/seed-data', file), 'utf8')) as T;
}

function parseFaqs(): Faq[] {
  const csv = readFileSync(resolve('swh/seed-data/faq.csv'), 'utf8');
  const { data } = Papa.parse<string[]>(csv, { skipEmptyLines: true });
  const rows = data.slice(1); // drop header
  return rows
    .filter((r) => (r[0] ?? '').trim() && (r[3] ?? '').trim())
    .map((r) => ({
      intent_group: (r[0] ?? '').trim(),
      representative_q: (r[1] ?? '').trim(),
      variants: (r[2] ?? '')
        .split('\n').map((v) => v.replace(/^[-•\s]+/, '').trim()).filter(Boolean),
      answer: (r[3] ?? '').trim(),
      attachment: (r[4] ?? '').trim() || undefined,
    }));
}

async function main() {
  const db = admin();
  const courses = load<Course[]>('courses.json');
  const policies = load<PolicyRow[]>('policies.json');
  const assets = load<Asset[]>('assets.json');
  const faqs = parseFaqs();

  for (const [table, rows, conflict] of [
    ['swh_courses', courses, 'slug'],
    ['swh_policies', policies, 'topic'],
    ['swh_assets', assets, 'key'],
  ] as const) {
    const { error } = await db.from(table).upsert(rows as object[], { onConflict: conflict });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`upserted ${rows.length} -> ${table}`);
  }

  // FAQs have no natural unique key: replace-all.
  await db.from('swh_faqs').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  const { error: faqErr } = await db.from('swh_faqs').insert(faqs as object[]);
  if (faqErr) throw new Error(`swh_faqs: ${faqErr.message}`);
  console.log(`inserted ${faqs.length} -> swh_faqs`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
```

> Note: `tsx` resolves the `@/*` alias via `tsconfig.json` `paths`. If it does not, change the three `@/swh/types` import to a relative `./types` and re-run.

- [ ] **Step 2: Run the seed**

Run: `npm run swh:seed`
Expected output includes: `upserted 3 -> swh_courses`, `upserted 9 -> swh_policies`, `upserted 10 -> swh_assets`, and `inserted N -> swh_faqs` (N ≈ 25–30).

- [ ] **Step 3: Verify in DB**

```sql
SELECT
  (SELECT count(*) FROM swh_courses)  AS courses,
  (SELECT count(*) FROM swh_faqs)     AS faqs,
  (SELECT count(*) FROM swh_policies) AS policies,
  (SELECT count(*) FROM swh_assets)   AS assets;
```
Expected: courses=3, faqs≈25–30, policies=9, assets=10.

- [ ] **Step 4: Commit**

```bash
git add swh/seed.ts
git commit -m "feat(swh): KB seed script (parse FAQ csv + upsert)"
```

---

### Task 1.5: KB loader + `selectKnowledge`

**Files:**
- Create: `swh/kb.ts`
- Test: `swh/kb.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { selectKnowledge } from '@/swh/kb';
import type { KnowledgeBase, Classification } from '@/swh/types';

const kb: KnowledgeBase = {
  courses: [
    { slug: 'ngu-phap-can-ban', name: 'Ngữ pháp căn bản', good_for: 'mất gốc' },
    { slug: 'phat-am-giao-tiep', name: 'Phát âm và Giao tiếp cơ bản', good_for: 'đã có nền' },
    { slug: 'phat-am-plus', name: 'Phát âm plus', good_for: 'căn bản' },
  ],
  faqs: [
    { intent_group: 'Học thử', representative_q: 'Bên mình có học thử không ạ?', variants: ['có học thử ko'], answer: 'Hiện chưa có lớp học thử...' },
    { intent_group: 'Ưu đãi', representative_q: 'Hiện có ưu đãi gì không ạ?', variants: ['giảm giá'], answer: 'Đang có giảm 50k...' },
  ],
  policies: [
    { topic: 'bao_luu', risk_level: 'low', public_answer: 'Hông có bảo lưu', allowed_action: 'answer', requires_human: false },
  ],
  assets: [],
};

describe('selectKnowledge', () => {
  it('returns matching course by entity name', () => {
    const c: Classification = { intent: 'course_consulting', entities: { course_name: 'giao tiếp' }, confidence: 0.9 };
    const sel = selectKnowledge(c, 'em muốn học giao tiếp', kb);
    expect(sel.courses.map((x) => x.slug)).toContain('phat-am-giao-tiep');
    expect(sel.refs.length).toBeGreaterThan(0);
  });

  it('includes the policy row for a policy_question by topic', () => {
    const c: Classification = { intent: 'policy_question', entities: { policy_topic: 'bao_luu' }, confidence: 0.9 };
    const sel = selectKnowledge(c, 'có bảo lưu không', kb);
    expect(sel.policies.map((p) => p.topic)).toContain('bao_luu');
  });

  it('matches a FAQ by keyword overlap', () => {
    const c: Classification = { intent: 'trial_class', entities: {}, confidence: 0.8 };
    const sel = selectKnowledge(c, 'cho em hỏi có học thử không', kb);
    expect(sel.faqs.some((f) => f.intent_group === 'Học thử')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/kb.test.ts`
Expected: FAIL (`selectKnowledge` not exported).

- [ ] **Step 3: Implement `swh/kb.ts`**

```ts
import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import type { Classification, Course, Faq, PolicyRow, Asset, KnowledgeBase, SelectedKnowledge } from '@/swh/types';

export async function loadKnowledgeBase(): Promise<KnowledgeBase> {
  const db = createAdminClient();
  const [c, f, p, a] = await Promise.all([
    db.from('swh_courses').select('*').eq('status', 'active'),
    db.from('swh_faqs').select('*').eq('status', 'active'),
    db.from('swh_policies').select('*').eq('status', 'active'),
    db.from('swh_assets').select('*').eq('status', 'active'),
  ]);
  return {
    courses: (c.data ?? []) as Course[],
    faqs: (f.data ?? []) as Faq[],
    policies: (p.data ?? []) as PolicyRow[],
    assets: (a.data ?? []) as Asset[],
  };
}

const STOP = new Set(['em','mình','ạ','có','không','ko','là','cho','hỏi','của','bên','được','dạ','về','thì','và','nha']);
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((t) => t.length > 1 && !STOP.has(t));
}
function overlap(a: string[], b: Set<string>): number {
  return a.reduce((n, t) => n + (b.has(t) ? 1 : 0), 0);
}

const ALL_COURSE_INTENTS = new Set(['ask_price','ask_schedule','class_info','course_consulting','placement_test','trial_class','promo']);

export function selectKnowledge(c: Classification, text: string, kb: KnowledgeBase): SelectedKnowledge {
  const refs: string[] = [];
  const qtokens = tokens(text);

  // Courses
  let courses: Course[] = [];
  const name = c.entities.course_name?.toLowerCase();
  if (name) {
    courses = kb.courses.filter((co) =>
      co.name.toLowerCase().includes(name) || name.includes(co.slug.split('-')[0]));
  }
  if (courses.length === 0 && ALL_COURSE_INTENTS.has(c.intent)) courses = kb.courses;
  courses.forEach((co) => refs.push(`course:${co.slug}`));

  // FAQs: top 4 by keyword overlap against representative_q + variants
  const scored = kb.faqs.map((f) => {
    const set = new Set(tokens([f.representative_q, ...f.variants].join(' ')));
    return { f, score: overlap(qtokens, set) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 4);
  const faqs = scored.map((x) => x.f);
  faqs.forEach((f) => refs.push(`faq:${f.intent_group}:${f.representative_q.slice(0, 24)}`));

  // Policies: by explicit topic, or by topic-name overlap
  let policies: PolicyRow[] = [];
  const topic = c.entities.policy_topic;
  if (topic) policies = kb.policies.filter((p) => p.topic === topic);
  if (policies.length === 0 && (c.intent === 'policy_question' || c.intent === 'bao_luu')) {
    policies = kb.policies.filter((p) =>
      overlap(qtokens, new Set(tokens(p.public_answer))) > 0 || p.topic === 'bao_luu');
  }
  policies.forEach((p) => refs.push(`policy:${p.topic}`));

  return { courses, faqs, policies, refs };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run swh/kb.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add swh/kb.ts swh/kb.test.ts
git commit -m "feat(swh): KB loader + selectKnowledge with tests"
```

---

## Phase 2 — Classification

### Task 2.1: LLM client (OpenAI impl)

**Files:**
- Create: `swh/llm.ts`

- [ ] **Step 1: Implement `swh/llm.ts`**

```ts
import OpenAI from 'openai';
import type { LlmClient, ChatTurn } from '@/swh/types';
import { parseClassification } from '@/swh/classify';

export function createOpenAiClient(): LlmClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY');
  const client = new OpenAI({ apiKey });
  const classifyModel = process.env.SWH_CLASSIFY_MODEL ?? 'gpt-4o-mini';
  const generateModel = process.env.SWH_GENERATE_MODEL ?? 'gpt-4o';

  return {
    async classify(prompt: string) {
      const res = await client.chat.completions.create({
        model: classifyModel,
        temperature: 0,
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
      });
      return parseClassification(res.choices[0]?.message?.content ?? '');
    },
    async complete(system: string, messages: ChatTurn[]) {
      const res = await client.chat.completions.create({
        model: generateModel,
        temperature: 0.7,
        max_tokens: 800,
        messages: [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))],
      });
      return (res.choices[0]?.message?.content ?? '').trim();
    },
  };
}
```

> Note: depends on `parseClassification` from Task 2.2. Implement Task 2.2 in the same working session; typecheck at the end of 2.2.

- [ ] **Step 2: Commit (after 2.2 typechecks)** — combined commit at end of Task 2.2.

---

### Task 2.2: Classify prompt + parser

**Files:**
- Create: `swh/classify.ts`
- Test: `swh/classify.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { parseClassification, buildClassifyPrompt, classifyMessage } from '@/swh/classify';
import type { LlmClient } from '@/swh/types';

describe('parseClassification', () => {
  it('parses a valid JSON classification', () => {
    const c = parseClassification('{"intent":"ask_price","entities":{"course_name":"giao tiếp"},"confidence":0.9}');
    expect(c.intent).toBe('ask_price');
    expect(c.entities.course_name).toBe('giao tiếp');
    expect(c.confidence).toBe(0.9);
  });

  it('falls back to unknown on unrecognised intent', () => {
    const c = parseClassification('{"intent":"banana","entities":{},"confidence":0.7}');
    expect(c.intent).toBe('unknown');
  });

  it('falls back to unknown/0 on invalid JSON', () => {
    const c = parseClassification('not json');
    expect(c.intent).toBe('unknown');
    expect(c.confidence).toBe(0);
  });

  it('clamps confidence to 0..1', () => {
    expect(parseClassification('{"intent":"greeting","entities":{},"confidence":5}').confidence).toBe(1);
    expect(parseClassification('{"intent":"greeting","entities":{},"confidence":-1}').confidence).toBe(0);
  });
});

describe('buildClassifyPrompt', () => {
  it('includes the user text and the intent list', () => {
    const p = buildClassifyPrompt('học phí bao nhiêu', []);
    expect(p).toContain('học phí bao nhiêu');
    expect(p).toContain('ask_price');
  });
});

describe('classifyMessage', () => {
  it('delegates to the llm client', async () => {
    const llm: LlmClient = {
      classify: async () => ({ intent: 'greeting', entities: {}, confidence: 0.8 }),
      complete: async () => '',
    };
    const c = await classifyMessage('hi', [], llm);
    expect(c.intent).toBe('greeting');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/classify.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `swh/classify.ts`**

```ts
import type { Classification, ChatTurn, Intent, LlmClient, Entities } from '@/swh/types';
import { INTENTS } from '@/swh/intents';

export function buildClassifyPrompt(text: string, history: ChatTurn[]): string {
  const ctx = history.slice(-4).map((m) => `${m.role === 'user' ? 'Khách' : 'SwH'}: ${m.content}`).join('\n');
  return [
    'Bạn là bộ phân loại intent cho trợ lý tư vấn trung tâm tiếng Anh SpeakwithHang.',
    'Phân loại tin nhắn MỚI NHẤT của khách. Trả về JSON DUY NHẤT, không giải thích.',
    `intent phải là một trong: ${INTENTS.join(', ')}.`,
    'entities (tuỳ chọn): course_name, level, format(online|offline|video|1-1), preferred_time, policy_topic, name, phone, email.',
    'Quy ước phân biệt:',
    '- "có chính sách bảo lưu/hoàn tiền/học bù không" => policy_question (kèm policy_topic: bao_luu|refund_policy|absence_makeup|transfer_class|record_policy).',
    '- "em muốn hoàn tiền/hoàn cọc" (yêu cầu cá nhân) => refund hoặc deposit_refund.',
    '- "em muốn đóng tiền" => payment_intent. "em chuyển khoản rồi" => payment_confirm.',
    '- "giảm thêm cho em" => discount_private. "gặp tư vấn viên/người thật" => ask_human.',
    'confidence là số 0..1.',
    ctx ? `Ngữ cảnh gần đây:\n${ctx}` : '',
    `Tin nhắn mới: "${text}"`,
    'JSON: {"intent": "...", "entities": {...}, "confidence": 0.0}',
  ].filter(Boolean).join('\n');
}

export function parseClassification(raw: string): Classification {
  try {
    const o = JSON.parse(raw) as { intent?: string; entities?: Entities; confidence?: number };
    const intent = (INTENTS as string[]).includes(o.intent ?? '') ? (o.intent as Intent) : 'unknown';
    let conf = typeof o.confidence === 'number' ? o.confidence : 0;
    conf = Math.max(0, Math.min(1, conf));
    return { intent, entities: o.entities ?? {}, confidence: conf };
  } catch {
    return { intent: 'unknown', entities: {}, confidence: 0 };
  }
}

export async function classifyMessage(text: string, history: ChatTurn[], llm: LlmClient): Promise<Classification> {
  return llm.classify(buildClassifyPrompt(text, history));
}
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `npx vitest run swh/classify.test.ts && npx tsc --noEmit`
Expected: PASS (8 tests), typecheck OK.

- [ ] **Step 5: Commit (classify + llm together)**

```bash
git add swh/classify.ts swh/classify.test.ts swh/llm.ts
git commit -m "feat(swh): intent classifier + OpenAI llm client"
```

---

## Phase 3 — Policy gate

### Task 3.1: `policyGate`

**Files:**
- Create: `swh/policy.ts`
- Test: `swh/policy.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { policyGate } from '@/swh/policy';
import type { Classification, PolicyRow } from '@/swh/types';

const policies: PolicyRow[] = [
  { topic: 'bao_luu', risk_level: 'low', public_answer: 'no', allowed_action: 'answer', requires_human: false },
  { topic: 'payment', risk_level: 'high', public_answer: 'x', allowed_action: 'escalate', requires_human: true },
];
const C = (intent: Classification['intent'], confidence = 0.9, entities = {}): Classification => ({ intent, entities, confidence });

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
    const r = policyGate(C('policy_question', 0.9, { policy_topic: 'bao_luu' } as object), policies, { alreadyClarified: false });
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/policy.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `swh/policy.ts`**

```ts
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
      return { decision: 'escalate', risk_level: 'low', requires_human: true, escalation_reason: 'low_confidence', holding_template_key: 'holding_default' };
    }
    return { decision: 'clarify', risk_level: 'low', requires_human: false };
  }

  // 4) Everything else is answerable. placement_test/promo get a CTA.
  const cta = c.intent === 'placement_test' || c.intent === 'promo' || c.intent === 'course_consulting';
  return { decision: cta ? 'answer_cta' : 'answer', risk_level: 'low', requires_human: false };
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run swh/policy.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add swh/policy.ts swh/policy.test.ts
git commit -m "feat(swh): deterministic policy gate"
```

---

## Phase 4 — Guardrails

### Task 4.1: Price normalization + detection

**Files:**
- Create: `swh/guardrails.ts`
- Test: `swh/guardrails.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { normalizePrice, extractPriceMentions, buildAllowedPriceSet } from '@/swh/guardrails';
import type { KnowledgeBase } from '@/swh/types';

describe('normalizePrice', () => {
  it('normalizes separated digits', () => {
    expect(normalizePrice('4.900.000')).toBe('4900000');
  });
  it('normalizes tr shorthand', () => {
    expect(normalizePrice('1tr9')).toBe('1900000');
    expect(normalizePrice('5tr')).toBe('5000000');
  });
  it('normalizes k shorthand', () => {
    expect(normalizePrice('50k')).toBe('50000');
  });
  it('normalizes "1 chẹo" and "1 triệu"', () => {
    expect(normalizePrice('1 chẹo')).toBe('1000000');
    expect(normalizePrice('1 triệu')).toBe('1000000');
  });
});

describe('extractPriceMentions', () => {
  it('finds price-like tokens in a sentence', () => {
    const m = extractPriceMentions('học phí khoảng 4.900.000đ tới 5.200.000đ, cọc 1 chẹo');
    expect(m.length).toBeGreaterThanOrEqual(3);
  });
});

describe('buildAllowedPriceSet', () => {
  it('collects normalized prices from KB text', () => {
    const kb: KnowledgeBase = {
      courses: [{ slug: 's', name: 'n', promo: 'giảm 50k' }],
      faqs: [{ intent_group: 'g', representative_q: 'q', variants: [], answer: 'cọc 1.000.000đ' }],
      policies: [], assets: [],
    };
    const set = buildAllowedPriceSet(kb);
    expect(set.has('50000')).toBe(true);
    expect(set.has('1000000')).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/guardrails.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement the price helpers in `swh/guardrails.ts`**

```ts
import type { KnowledgeBase, Asset, GuardrailResult, Decision } from '@/swh/types';

const PRICE_RE = /(\d[\d.,]*)\s*(tr|triệu|chẹo|k|nghìn|ngàn|đ|vnđ|d)?(\d)?/giu;

export function normalizePrice(token: string): string {
  const t = token.toLowerCase().trim();
  // "<n>tr<m>" e.g. 1tr9 => 1.9 triệu
  const trm = t.match(/^(\d+)\s*(?:tr|triệu)\s*(\d)$/u);
  if (trm) return String(Number(trm[1]) * 1_000_000 + Number(trm[2]) * 100_000);
  const tr = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|chẹo)$/u);
  if (tr) return String(Math.round(Number(tr[1].replace(',', '.')) * 1_000_000));
  const k = t.match(/^(\d+(?:[.,]\d+)?)\s*(?:k|nghìn|ngàn)$/u);
  if (k) return String(Math.round(Number(k[1].replace(',', '.')) * 1_000));
  // plain separated digits
  const digits = t.replace(/[^\d]/g, '');
  return digits;
}

export function extractPriceMentions(text: string): string[] {
  const out: string[] = [];
  const re = /(\d+\s*(?:tr|triệu|chẹo)\s*\d?|\d+\s*(?:k|nghìn|ngàn)|\d[\d.,]*\s*(?:đ|vnđ)|\d[\d.,]{3,})/giu;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) out.push(m[1].trim());
  return out;
}

export function buildAllowedPriceSet(kb: KnowledgeBase): Set<string> {
  const blob = [
    ...kb.courses.flatMap((c) => [c.promo, c.curriculum, c.helps_with, c.good_for]),
    ...kb.faqs.map((f) => f.answer),
    ...kb.policies.map((p) => p.public_answer),
    ...kb.assets.map((a) => a.value),
  ].filter(Boolean).join(' ');
  const set = new Set<string>();
  for (const tok of extractPriceMentions(blob)) {
    const n = normalizePrice(tok);
    if (n) set.add(n);
  }
  // Always-allowed canonical SwH prices (ranges from persona facts).
  ['4900000', '5200000', '6900000', '7900000', '1900000', '1000000', '50000'].forEach((p) => set.add(p));
  return set;
}
```

> Note: `_unused` import warnings (`Asset`, `GuardrailResult`, `Decision`) resolve in Task 4.2 when `validateReply` is added. Do not commit until 4.2 typechecks.

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run swh/guardrails.test.ts`
Expected: PASS (the price tests).

---

### Task 4.2: `validateReply` (links, banned terms, high-risk, prices)

**Files:**
- Modify: `swh/guardrails.ts`
- Test: `swh/guardrails.test.ts` (append)

- [ ] **Step 1: Append failing tests**

```ts
import { validateReply } from '@/swh/guardrails';
import type { Asset } from '@/swh/types';

const assets: Asset[] = [
  { type: 'form', key: 'f', value: 'https://forms.gle/ABC' },
  { type: 'image', key: 'i', value: 'https://speakwithhang.com/a.jpg' },
];
const allowed = new Set(['4900000', '50000', '1000000']);

describe('validateReply', () => {
  const ctx = (over = {}) => ({ allowedPrices: allowed, assets, requiresHuman: false, decision: 'answer' as const, ...over });

  it('passes a clean on-brand reply', () => {
    const r = validateReply('Học phí lớp online khoảng 4.900.000đ nha, bạn để lại SĐT nhé.', ctx());
    expect(r.ok).toBe(true);
  });

  it('flags an invented price not in KB', () => {
    const r = validateReply('Lớp này chỉ 3.500.000đ thôi nha.', ctx());
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('price'))).toBe(true);
  });

  it('flags a non-registry link', () => {
    const r = validateReply('Đăng ký ở https://evil.example.com nha', ctx());
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('link'))).toBe(true);
  });

  it('allows a registry link', () => {
    expect(validateReply('Form nè: https://forms.gle/ABC', ctx()).ok).toBe(true);
  });

  it('flags banned internal terms', () => {
    const r = validateReply('mình là bot của trung tâm nha', ctx());
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('term'))).toBe(true);
  });

  it('flags a high-risk case that was answered instead of escalated', () => {
    const r = validateReply('Bạn được hoàn cọc nha', ctx({ requiresHuman: true, decision: 'answer' }));
    expect(r.ok).toBe(false);
    expect(r.violations.some((v) => v.includes('high_risk'))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/guardrails.test.ts`
Expected: FAIL (`validateReply` not exported).

- [ ] **Step 3: Append implementation to `swh/guardrails.ts`**

```ts
const BANNED_TERMS = [/\bbot\b/i, /\badmin\b/i, /\boracle\b/i, /\bchatgpt\b/i, /\bopenai\b/i, /\bgpt\b/i, /\btrợ lý ảo\b/i, /\bas an ai\b/i];

function extractLinks(text: string): string[] {
  return (text.match(/https?:\/\/[^\s)]+/gu) ?? []).map((u) => u.replace(/[.,)]+$/, ''));
}

export function validateReply(
  reply: string,
  ctx: { allowedPrices: Set<string>; assets: Asset[]; requiresHuman: boolean; decision: Decision },
): GuardrailResult {
  const violations: string[] = [];

  // 1) Prices: every price mention must be in the allowed set.
  for (const tok of extractPriceMentions(reply)) {
    const n = normalizePrice(tok);
    if (n && n.length >= 4 && !ctx.allowedPrices.has(n)) violations.push(`invented_price:${tok}`);
  }

  // 2) Links: every URL must be in the asset registry.
  const allowedUrls = new Set(ctx.assets.map((a) => a.value));
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
```

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `npx vitest run swh/guardrails.test.ts && npx tsc --noEmit`
Expected: PASS (all guardrail tests), typecheck OK.

- [ ] **Step 5: Commit**

```bash
git add swh/guardrails.ts swh/guardrails.test.ts
git commit -m "feat(swh): deterministic reply guardrails"
```

---

## Phase 5 — Generation + Pipeline

### Task 5.1: Generation prompt builder

**Files:**
- Create: `swh/generate.ts`
- Test: `swh/generate.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { buildGeneratePrompt } from '@/swh/generate';
import type { SelectedKnowledge, Decision } from '@/swh/types';

const sel: SelectedKnowledge = {
  courses: [{ slug: 'ngu-phap-can-ban', name: 'Ngữ pháp căn bản', good_for: 'mất gốc' }],
  faqs: [{ intent_group: 'Ưu đãi', representative_q: 'ưu đãi?', variants: [], answer: 'giảm 50k' }],
  policies: [{ topic: 'bao_luu', risk_level: 'low', public_answer: 'hông có bảo lưu', allowed_action: 'answer', requires_human: false }],
  refs: [],
};

describe('buildGeneratePrompt', () => {
  it('includes persona, selected KB, and the action directive', () => {
    const p = buildGeneratePrompt(sel, 'answer' as Decision, ['https://forms.gle/ABC']);
    expect(p).toContain('SpeakwithHang');
    expect(p).toContain('Ngữ pháp căn bản');
    expect(p).toContain('giảm 50k');
    expect(p).toContain('hông có bảo lưu');
    expect(p).toContain('https://forms.gle/ABC');
  });

  it('tells the model to ask exactly one question when clarifying', () => {
    expect(buildGeneratePrompt(sel, 'clarify' as Decision, [])).toContain('đúng 1 câu');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/generate.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `swh/generate.ts`**

```ts
import type { SelectedKnowledge, Decision, ChatTurn, LlmClient } from '@/swh/types';
import { SWH_PERSONA, SWH_FACTS } from '@/swh/persona';

function actionDirective(decision: Decision): string {
  switch (decision) {
    case 'clarify': return 'Khách chưa rõ nhu cầu — hỏi lại đúng 1 câu ngắn gọn để làm rõ, đừng tư vấn dài.';
    case 'answer_cta': return 'Trả lời ngắn gọn rồi mời khách để lại Tên + SĐT và/hoặc gửi form phù hợp đã cung cấp.';
    default: return 'Trả lời ngắn gọn, đúng dữ liệu, đúng tone SwH. Nếu hợp lý thì xin Tên + SĐT.';
  }
}

export function buildGeneratePrompt(sel: SelectedKnowledge, decision: Decision, allowedLinks: string[]): string {
  const courses = sel.courses.map((c) =>
    `• ${c.name}: ${[c.helps_with, c.good_for, c.entry_level, c.formats, c.promo].filter(Boolean).join(' | ')}`).join('\n');
  const faqs = sel.faqs.map((f) => `Q: ${f.representative_q}\nA: ${f.answer}`).join('\n\n');
  const policies = sel.policies.map((p) => `• ${p.topic}: ${p.public_answer}`).join('\n');

  return [
    SWH_PERSONA,
    SWH_FACTS,
    courses ? `KHOÁ HỌC LIÊN QUAN:\n${courses}` : '',
    faqs ? `CÂU TRẢ LỜI MẪU (ưu tiên dùng gần đúng, giữ nguyên ý + tone):\n${faqs}` : '',
    policies ? `CHÍNH SÁCH ĐƯỢC PHÉP NÓI:\n${policies}` : '',
    allowedLinks.length ? `CHỈ ĐƯỢC DÙNG CÁC LINK SAU (nếu cần):\n${allowedLinks.join('\n')}` : 'KHÔNG được chèn link nào.',
    'RÀNG BUỘC: không bịa học phí/lịch ngoài dữ liệu trên; không tự tạo link; không dùng từ "bot/admin/AI"; tiếng Việt, tone SwH dễ thương.',
    `NHIỆM VỤ: ${actionDirective(decision)}`,
  ].filter(Boolean).join('\n\n');
}

export async function generateReply(
  sel: SelectedKnowledge, decision: Decision, allowedLinks: string[],
  history: ChatTurn[], userText: string, llm: LlmClient,
): Promise<string> {
  const system = buildGeneratePrompt(sel, decision, allowedLinks);
  return llm.complete(system, [...history, { role: 'user', content: userText }]);
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run swh/generate.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add swh/generate.ts swh/generate.test.ts
git commit -m "feat(swh): generation prompt builder"
```

---

### Task 5.2: `runPipeline` orchestration

**Files:**
- Create: `swh/pipeline.ts`
- Test: `swh/pipeline.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { runPipeline } from '@/swh/pipeline';
import type { LlmClient, KnowledgeBase, Classification } from '@/swh/types';

const kb: KnowledgeBase = {
  courses: [{ slug: 'phat-am-giao-tiep', name: 'Phát âm và Giao tiếp cơ bản', good_for: 'đã có nền' }],
  faqs: [{ intent_group: 'Ưu đãi', representative_q: 'ưu đãi?', variants: ['giảm giá'], answer: 'Đang có giảm 50k nha' }],
  policies: [
    { topic: 'bao_luu', risk_level: 'low', public_answer: 'Hông có bảo lưu nha', allowed_action: 'answer', requires_human: false },
    { topic: 'refund', risk_level: 'high', public_answer: 'x', allowed_action: 'escalate', requires_human: true },
  ],
  assets: [{ type: 'template', key: 'holding_refund', value: 'Tụi mình nhờ tư vấn viên hỗ trợ nha, để lại SĐT giúp nhé' }],
};

function fakeLlm(classification: Classification, reply: string): LlmClient {
  return { classify: async () => classification, complete: async () => reply };
}

describe('runPipeline', () => {
  it('answers a greeting', async () => {
    const llm = fakeLlm({ intent: 'greeting', entities: {}, confidence: 0.95 }, 'Hé lu, tụi mình là SwH nha!');
    const r = await runPipeline({ text: 'hi', history: [], kb }, llm);
    expect(r.decision).toBe('answer');
    expect(r.reply).toContain('SwH');
    expect(r.guardrail.ok).toBe(true);
  });

  it('escalates a personal refund request using the holding template (LLM not used)', async () => {
    const llm = fakeLlm({ intent: 'refund', entities: {}, confidence: 0.9 }, 'SHOULD_NOT_APPEAR');
    const r = await runPipeline({ text: 'em muốn hoàn tiền', history: [], kb }, llm);
    expect(r.decision).toBe('escalate');
    expect(r.reply).not.toContain('SHOULD_NOT_APPEAR');
    expect(r.escalation?.reason).toBe('refund');
  });

  it('downgrades to holding when the guardrail catches an invented price', async () => {
    const llm = fakeLlm({ intent: 'ask_price', entities: {}, confidence: 0.9 }, 'Lớp này chỉ 3.500.000đ thôi nha');
    const r = await runPipeline({ text: 'học phí bao nhiêu', history: [], kb }, llm);
    expect(r.guardrail.ok).toBe(false);
    expect(r.decision).toBe('holding');
    expect(r.escalation?.reason).toBe('guardrail');
  });

  it('extracts a lead from entities', async () => {
    const llm = fakeLlm({ intent: 'greeting', entities: { name: 'Vy', phone: '0900000000' }, confidence: 0.9 }, 'Dạ Vy ơi...');
    const r = await runPipeline({ text: 'mình tên Vy, sđt 0900000000', history: [], kb }, llm);
    expect(r.lead?.name).toBe('Vy');
    expect(r.lead?.phone).toBe('0900000000');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/pipeline.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `swh/pipeline.ts`**

```ts
import type { PipelineInput, PipelineResult, LlmClient, LeadDraft, Asset } from '@/swh/types';
import { classifyMessage } from '@/swh/classify';
import { policyGate } from '@/swh/policy';
import { selectKnowledge } from '@/swh/kb';
import { generateReply } from '@/swh/generate';
import { validateReply, buildAllowedPriceSet } from '@/swh/guardrails';

function template(assets: Asset[], key: string): string {
  return assets.find((a) => a.type === 'template' && a.key === key)?.value
    ?? 'Bạn để lại Tên + SĐT giúp tụi mình nha, tụi mình sẽ liên hệ lại sớm nhất 🥰';
}

function extractLead(entities: PipelineInput['kb'] extends never ? never : { name?: string; phone?: string; email?: string; course_name?: string }): LeadDraft | undefined {
  const { name, phone, email, course_name } = entities;
  if (!name && !phone && !email) return undefined;
  return { name, phone, email, interested_course: course_name };
}

export async function runPipeline(input: PipelineInput, llm: LlmClient): Promise<PipelineResult> {
  const t0 = Date.now();
  const { text, history, kb, alreadyClarified = false } = input;

  const classification = await classifyMessage(text, history, llm);
  const policy = policyGate(classification, kb.policies, { alreadyClarified });
  const lead = extractLead(classification.entities);

  let reply = '';
  let decision = policy.decision;
  let guardrail = { ok: true, violations: [] as string[] };
  let escalation: PipelineResult['escalation'];
  const sel = selectKnowledge(classification, text, kb);

  if (decision === 'escalate' || decision === 'holding') {
    reply = template(kb.assets, policy.holding_template_key ?? 'holding_default');
    escalation = { reason: policy.escalation_reason ?? 'out_of_scope', summary: summarize(classification.intent, text), risk_level: policy.risk_level };
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
      escalation = { reason: 'guardrail', summary: `Guardrail: ${guardrail.violations.join(', ')} | "${text.slice(0, 120)}"`, risk_level: 'medium' };
    }
  }

  return {
    reply, classification, decision, risk_level: policy.risk_level, guardrail,
    escalation, lead, kb_refs: sel.refs, latency_ms: Date.now() - t0,
  };
}

function summarize(intent: string, text: string): string {
  return `${intent}: "${text.slice(0, 160)}"`;
}
```

> Note: simplify the `extractLead` signature if TS complains — replace its parameter type with `import('@/swh/types').Entities` and destructure `name, phone, email` plus `course_name`. Keep behaviour identical.

- [ ] **Step 4: Run to verify pass + typecheck**

Run: `npx vitest run swh/pipeline.test.ts && npx tsc --noEmit`
Expected: PASS (4 tests), typecheck OK. (Fix the `extractLead` type per the note if needed.)

- [ ] **Step 5: Commit**

```bash
git add swh/pipeline.ts swh/pipeline.test.ts
git commit -m "feat(swh): pipeline orchestration with guardrail downgrade"
```

---

## Phase 6 — Persistence + Chat route

### Task 6.1: Rate limiter

**Files:**
- Create: `swh/rate-limit.ts`
- Test: `swh/rate-limit.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { tooSoon } from '@/swh/rate-limit';

describe('tooSoon', () => {
  it('rejects a second message within the window', () => {
    const last = new Date(Date.now() - 500).toISOString();
    expect(tooSoon(last, 1500)).toBe(true);
  });
  it('allows after the window', () => {
    const last = new Date(Date.now() - 3000).toISOString();
    expect(tooSoon(last, 1500)).toBe(false);
  });
  it('allows when there is no previous message', () => {
    expect(tooSoon(null, 1500)).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/rate-limit.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implement `swh/rate-limit.ts`**

```ts
export function tooSoon(lastUserMessageAt: string | null, windowMs = 1500): boolean {
  if (!lastUserMessageAt) return false;
  return Date.now() - new Date(lastUserMessageAt).getTime() < windowMs;
}
```

- [ ] **Step 4: Run to verify pass + commit**

Run: `npx vitest run swh/rate-limit.test.ts` → PASS.
```bash
git add swh/rate-limit.ts swh/rate-limit.test.ts
git commit -m "feat(swh): per-conversation rate limit helper"
```

---

### Task 6.2: Persistence layer

**Files:**
- Create: `swh/persistence.ts`

- [ ] **Step 1: Implement `swh/persistence.ts`**

```ts
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
  return (data ?? []).map((m) => ({ role: m.role as ChatTurn['role'], content: m.text as string }));
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
  await db.from('swh_conversations').update({ last_intent: result.classification.intent, updated_at: new Date().toISOString() }).eq('id', conversationId);

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
  const { data } = await db.from('swh_leads').select('id,name,phone,email,interested_course').eq('conversation_id', conversationId).maybeSingle();
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

// ---- admin reads ----
export async function isBotPaused(db: Db, conversationId: string): Promise<boolean> {
  const { data } = await db.from('swh_conversations').select('bot_paused').eq('id', conversationId).maybeSingle();
  return Boolean(data?.bot_paused);
}
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
```

- [ ] **Step 2: Typecheck + commit**

Run: `npx tsc --noEmit` → PASS.
```bash
git add swh/persistence.ts
git commit -m "feat(swh): supabase persistence layer"
```

---

### Task 6.3: Chat route handler

**Files:**
- Create: `app/api/swh/chat/route.ts`

- [ ] **Step 1: Read the Next 16 route-handler docs**

Skim `node_modules/next/dist/docs/` for the current route-handler signature (the repo's `app/api/ai/chat/route.ts` is a working reference: `export async function POST(request: NextRequest)` returning `NextResponse.json`).

- [ ] **Step 2: Implement the route**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { createOpenAiClient } from '@/swh/llm';
import { loadKnowledgeBase } from '@/swh/kb';
import { runPipeline } from '@/swh/pipeline';
import { tooSoon } from '@/swh/rate-limit';
import {
  ensureConversation, getHistory, lastUserMessageAt, lastAssistantWasClarify,
  isBotPaused, saveUserMessage, saveAssistantResult, upsertLead,
} from '@/swh/persistence';

export async function POST(request: NextRequest) {
  let body: { conversation_id?: string; text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'bad json' }, { status: 400 }); }
  const text = (body.text ?? '').trim();
  if (!text) return NextResponse.json({ error: 'text required' }, { status: 400 });
  if (text.length > 2000) return NextResponse.json({ error: 'text too long' }, { status: 400 });

  const db = createAdminClient();
  const conversationId = await ensureConversation(db, body.conversation_id);

  // Rate limit per conversation.
  if (tooSoon(await lastUserMessageAt(db, conversationId))) {
    return NextResponse.json({ conversation_id: conversationId, reply: 'Tin nhắn của bạn gửi hơi nhanh xíu, bạn chờ tụi mình một chút nha 🥹', rate_limited: true });
  }

  await saveUserMessage(db, conversationId, text);

  // If a human took over (ask_human), the bot stays silent.
  if (await isBotPaused(db, conversationId)) {
    return NextResponse.json({ conversation_id: conversationId, reply: 'Tụi mình đã chuyển cho tư vấn viên, bạn chờ được liên hệ lại nha 🩷', paused: true });
  }

  try {
    const [kb, history, alreadyClarified] = await Promise.all([
      loadKnowledgeBase(), getHistory(db, conversationId), lastAssistantWasClarify(db, conversationId),
    ]);
    const llm = createOpenAiClient();
    const result = await runPipeline({ text, history: history.slice(0, -1), kb, alreadyClarified }, llm);

    await saveAssistantResult(db, conversationId, result);
    if (result.lead) await upsertLead(db, conversationId, result.lead);

    return NextResponse.json({ conversation_id: conversationId, reply: result.reply, decision: result.decision });
  } catch (err) {
    console.error('[swh/chat] error:', err);
    // Never lose the lead: record an escalation so a human follows up.
    await db.from('swh_escalations').insert({ conversation_id: conversationId, reason: 'api_failure', risk_level: 'medium', summary: 'pipeline error' });
    await db.from('swh_conversations').update({ status: 'needs_followup' }).eq('id', conversationId);
    const { data } = await db.from('swh_assets').select('value').eq('key', 'fallback_error').maybeSingle();
    return NextResponse.json({ conversation_id: conversationId, reply: (data?.value as string) ?? 'Tụi mình đang quá tải xíu, bạn để lại SĐT giúp nha!' });
  }
}
```

> `getHistory` returns oldest→newest including the message we just saved; we pass `history.slice(0, -1)` so the current user turn isn't duplicated (the pipeline appends it).

- [ ] **Step 3: Manual smoke test**

Run `npm run dev`, then:
```bash
curl -s localhost:3000/api/swh/chat -H 'content-type: application/json' -d '{"text":"em chào trung tâm"}' | head
```
Expected: JSON with a `conversation_id` and a friendly Vietnamese `reply`. Send a second call with that `conversation_id` + `{"text":"em muốn hoàn tiền"}` → reply should be the holding/escalation message.

- [ ] **Step 4: Commit**

```bash
git add app/api/swh/chat/route.ts
git commit -m "feat(swh): chat route handler wiring pipeline + persistence"
```

---

## Phase 7 — Chat UI

### Task 7.1: ChatWidget + page

**Files:**
- Create: `swh/components/ChatWidget.tsx`
- Create: `app/swh-chatbot/page.tsx`

- [ ] **Step 1: Implement `swh/components/ChatWidget.tsx`**

```tsx
'use client';
import { useEffect, useRef, useState } from 'react';

type Msg = { role: 'user' | 'assistant'; content: string };
const STORAGE_KEY = 'swh_conversation_id';

export function ChatWidget() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: 'assistant', content: 'Hé lu 🩷 Tụi mình là SpeakwithHang nha. Bạn đang quan tâm lớp nào hay cần tụi mình tư vấn gì hôm nay nè?' },
  ]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const convId = useRef<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { convId.current = localStorage.getItem(STORAGE_KEY); }, []);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setBusy(true);
    try {
      const res = await fetch('/api/swh/chat', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ conversation_id: convId.current, text }),
      });
      const data = await res.json();
      if (data.conversation_id) { convId.current = data.conversation_id; localStorage.setItem(STORAGE_KEY, data.conversation_id); }
      setMessages((m) => [...m, { role: 'assistant', content: data.reply ?? 'Tụi mình đang bận xíu, bạn nhắn lại giúp nha!' }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: 'Mạng tụi mình chậm xíu, bạn thử lại nha 🥹' }]);
    } finally { setBusy(false); }
  }

  return (
    <div className="mx-auto flex h-[100dvh] max-w-2xl flex-col bg-white">
      <header className="border-b p-4 text-center font-semibold text-pink-600">SpeakwithHang · Tư vấn</header>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.map((m, i) => (
          <div key={i} className={m.role === 'user' ? 'text-right' : 'text-left'}>
            <span className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2 text-sm ${m.role === 'user' ? 'bg-pink-500 text-white' : 'bg-gray-100 text-gray-900'}`}>
              {m.content}
            </span>
          </div>
        ))}
        {busy && <div className="text-left text-sm text-gray-400">SwH đang soạn tin…</div>}
        <div ref={endRef} />
      </div>
      <div className="flex gap-2 border-t p-3">
        <input
          className="flex-1 rounded-full border px-4 py-2 text-sm outline-none focus:border-pink-400"
          placeholder="Nhập tin nhắn…" value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          disabled={busy}
        />
        <button onClick={send} disabled={busy || !input.trim()}
          className="rounded-full bg-pink-500 px-5 py-2 text-sm font-medium text-white disabled:opacity-50">Gửi</button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `app/swh-chatbot/page.tsx`**

```tsx
import { ChatWidget } from '@/swh/components/ChatWidget';

export const metadata = { title: 'SpeakwithHang · Tư vấn' };

export default function SwhChatbotPage() {
  return <ChatWidget />;
}
```

- [ ] **Step 3: Manual check**

Run `npm run dev`, open `http://localhost:3000/swh-chatbot`, send "em muốn học giao tiếp". Expected: an on-brand reply; input locks while "đang soạn tin…" shows; refreshing keeps the same conversation (localStorage).

- [ ] **Step 4: Commit**

```bash
git add swh/components/ChatWidget.tsx app/swh-chatbot/page.tsx
git commit -m "feat(swh): student chat UI"
```

---

### Task 7.2: Playwright smoke test (mocked API)

**Files:**
- Create: `tests/swh-chat.e2e.ts`

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test';

test('chat widget sends a message and shows the reply', async ({ page }) => {
  await page.route('**/api/swh/chat', async (route) => {
    await route.fulfill({ json: { conversation_id: 'test-conv', reply: 'Dạ tụi mình tư vấn liền nha!' } });
  });
  await page.goto('/swh-chatbot');
  await page.getByPlaceholder('Nhập tin nhắn…').fill('em muốn học giao tiếp');
  await page.getByRole('button', { name: 'Gửi' }).click();
  await expect(page.getByText('Dạ tụi mình tư vấn liền nha!')).toBeVisible();
});
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/swh-chat.e2e.ts`
Expected: PASS. (If the dev server isn't auto-started, check `playwright.config.ts` `webServer`; start `npm run dev` in another terminal if needed.)

- [ ] **Step 3: Commit**

```bash
git add tests/swh-chat.e2e.ts
git commit -m "test(swh): chat widget e2e smoke"
```

---

## Phase 8 — Admin inbox

### Task 8.1: Admin auth helper

**Files:**
- Create: `swh/admin-auth.ts`
- Test: `swh/admin-auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { checkAdminPassword } from '@/swh/admin-auth';

beforeEach(() => { process.env.SWH_ADMIN_PASSWORD = 'secret'; });

describe('checkAdminPassword', () => {
  it('accepts the correct password', () => expect(checkAdminPassword('secret')).toBe(true));
  it('rejects a wrong password', () => expect(checkAdminPassword('nope')).toBe(false));
  it('rejects null', () => expect(checkAdminPassword(null)).toBe(false));
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run swh/admin-auth.test.ts` → FAIL.

- [ ] **Step 3: Implement `swh/admin-auth.ts`**

```ts
export function checkAdminPassword(provided: string | null): boolean {
  const expected = process.env.SWH_ADMIN_PASSWORD;
  if (!expected || !provided) return false;
  return provided === expected;
}

export function readAdminPassword(request: Request): string | null {
  const header = request.headers.get('x-swh-admin');
  if (header) return header;
  const auth = request.headers.get('authorization');
  return auth?.startsWith('Bearer ') ? auth.slice(7) : null;
}
```

- [ ] **Step 4: Run to verify pass + commit**

Run: `npx vitest run swh/admin-auth.test.ts` → PASS.
```bash
git add swh/admin-auth.ts swh/admin-auth.test.ts
git commit -m "feat(swh): admin shared-password helper"
```

---

### Task 8.2: Admin API routes

**Files:**
- Create: `app/api/swh/admin/conversations/route.ts`
- Create: `app/api/swh/admin/conversations/[id]/route.ts`
- Create: `app/api/swh/admin/escalations/route.ts`

- [ ] **Step 1: Implement `app/api/swh/admin/conversations/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkAdminPassword, readAdminPassword } from '@/swh/admin-auth';
import { listConversations } from '@/swh/persistence';

export async function GET(request: NextRequest) {
  if (!checkAdminPassword(readAdminPassword(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json({ conversations: await listConversations(createAdminClient()) });
}
```

- [ ] **Step 2: Implement `app/api/swh/admin/conversations/[id]/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkAdminPassword, readAdminPassword } from '@/swh/admin-auth';
import { getConversationDetail } from '@/swh/persistence';

export async function GET(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  if (!checkAdminPassword(readAdminPassword(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id } = await ctx.params;
  return NextResponse.json(await getConversationDetail(createAdminClient(), id));
}
```

> Next 16 dynamic route `params` are async (a Promise) — confirm against `node_modules/next/dist/docs/`. Await them as shown.

- [ ] **Step 3: Implement `app/api/swh/admin/escalations/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkAdminPassword, readAdminPassword } from '@/swh/admin-auth';
import { listEscalations, updateEscalationStatus } from '@/swh/persistence';

export async function GET(request: NextRequest) {
  if (!checkAdminPassword(readAdminPassword(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const status = request.nextUrl.searchParams.get('status') ?? undefined;
  return NextResponse.json({ escalations: await listEscalations(createAdminClient(), status) });
}

export async function PATCH(request: NextRequest) {
  if (!checkAdminPassword(readAdminPassword(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { id, status } = (await request.json()) as { id?: string; status?: string };
  if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 });
  await updateEscalationStatus(createAdminClient(), id, status);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 4: Manual check + commit**

Run dev, then:
```bash
curl -s localhost:3000/api/swh/admin/escalations -H 'x-swh-admin: <your SWH_ADMIN_PASSWORD>' | head
```
Expected: `{"escalations":[...]}` (401 without the header).
```bash
git add app/api/swh/admin/
git commit -m "feat(swh): admin API (conversations + escalations)"
```

---

### Task 8.3: Admin inbox UI

**Files:**
- Create: `swh/components/InboxApp.tsx`
- Create: `app/swh-inbox/page.tsx`

- [ ] **Step 1: Implement `swh/components/InboxApp.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';

type Esc = { id: string; conversation_id: string; reason: string; risk_level: string; summary: string; status: string; created_at: string };

export function InboxApp() {
  const [pw, setPw] = useState('');
  const [authed, setAuthed] = useState(false);
  const [escalations, setEscalations] = useState<Esc[]>([]);

  async function load(password: string) {
    const res = await fetch('/api/swh/admin/escalations', { headers: { 'x-swh-admin': password } });
    if (res.status === 401) { setAuthed(false); alert('Sai mật khẩu'); return; }
    const data = await res.json();
    setEscalations(data.escalations ?? []);
    setAuthed(true);
    sessionStorage.setItem('swh_admin_pw', password);
  }
  useEffect(() => { const saved = sessionStorage.getItem('swh_admin_pw'); if (saved) { setPw(saved); load(saved); } }, []);

  async function resolve(id: string) {
    await fetch('/api/swh/admin/escalations', {
      method: 'PATCH', headers: { 'content-type': 'application/json', 'x-swh-admin': pw },
      body: JSON.stringify({ id, status: 'resolved' }),
    });
    load(pw);
  }

  if (!authed) {
    return (
      <div className="mx-auto mt-32 max-w-sm space-y-3 p-4">
        <h1 className="text-lg font-semibold">SwH Inbox</h1>
        <input className="w-full rounded border px-3 py-2" type="password" placeholder="Mật khẩu" value={pw} onChange={(e) => setPw(e.target.value)} />
        <button className="w-full rounded bg-pink-500 py-2 text-white" onClick={() => load(pw)}>Vào</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-3 p-4">
      <h1 className="text-lg font-semibold">Cần follow-up ({escalations.filter((e) => e.status !== 'resolved').length})</h1>
      {escalations.map((e) => (
        <div key={e.id} className="rounded border p-3 text-sm">
          <div className="flex justify-between">
            <span className="font-medium uppercase text-pink-600">{e.reason} · {e.risk_level}</span>
            <span className="text-gray-400">{new Date(e.created_at).toLocaleString('vi-VN')}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-gray-700">{e.summary}</p>
          <div className="mt-2 flex items-center gap-3">
            <span className={`rounded px-2 py-0.5 text-xs ${e.status === 'resolved' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>{e.status}</span>
            <a className="text-xs text-blue-600 underline" href={`/api/swh/admin/conversations/${e.conversation_id}`} target="_blank">xem hội thoại (JSON)</a>
            {e.status !== 'resolved' && <button className="text-xs text-green-700 underline" onClick={() => resolve(e.id)}>đánh dấu đã xử lý</button>}
          </div>
        </div>
      ))}
      {escalations.length === 0 && <p className="text-gray-400">Chưa có case nào.</p>}
    </div>
  );
}
```

- [ ] **Step 2: Implement `app/swh-inbox/page.tsx`**

```tsx
import { InboxApp } from '@/swh/components/InboxApp';

export const metadata = { title: 'SwH Inbox', robots: { index: false } };

export default function SwhInboxPage() {
  return <InboxApp />;
}
```

- [ ] **Step 3: Manual check + commit**

Open `http://localhost:3000/swh-inbox`, enter `SWH_ADMIN_PASSWORD`, confirm escalations created earlier appear and "đánh dấu đã xử lý" flips status to resolved.
```bash
git add swh/components/InboxApp.tsx app/swh-inbox/page.tsx
git commit -m "feat(swh): admin inbox UI"
```

---

## Phase 9 — Verify, harden, roll out

### Task 9.1: Full local verification + rollout notes

**Files:**
- Create: `swh/README.md`

- [ ] **Step 1: Run the whole suite**

Run:
```bash
npx tsc --noEmit && npx vitest run && npx playwright test tests/swh-chat.e2e.ts
```
Expected: typecheck clean; all unit tests pass; e2e passes.

- [ ] **Step 2: Manual end-to-end scenario checklist** (dev server, `/swh-chatbot`)

Verify each:
- [ ] "em chào trung tâm" → friendly greeting, asks need.
- [ ] "lớp phát âm giao tiếp học phí nhiêu" → states the RANGE + invites to leave info/form; **no invented exact price**.
- [ ] "có chính sách bảo lưu không" → states published "không có bảo lưu".
- [ ] "em muốn hoàn tiền" → holding reply, asks Name+phone; an escalation (reason `refund`) appears in `/swh-inbox`.
- [ ] "em chuyển khoản rồi" → does NOT confirm payment; escalates.
- [ ] "trung tâm dạy tệ quá" → short apology + escalate (`complaint`).
- [ ] "cho em gặp tư vấn viên" → escalate (`ask_human`); next message returns the paused reply.
- [ ] "mình tên Vy sđt 0901234567" → lead row appears in `getConversationDetail` JSON.
- [ ] Open two browsers (or normal + incognito) and chat simultaneously → replies don't cross; two distinct `conversation_id`s.

- [ ] **Step 3: Write `swh/README.md`** (ops + KB-edit guide)

```markdown
# SwH Chatbot

Customer-facing AI consultant for SpeakwithHang. Lives inside nomadcraft-next.

## Routes
- `/swh-chatbot` — public student chat
- `/swh-inbox` — team worklist (password = SWH_ADMIN_PASSWORD)

## Env (.env.local + Vercel)
- OPENAI_API_KEY, SWH_ADMIN_PASSWORD
- (optional) SWH_CLASSIFY_MODEL, SWH_GENERATE_MODEL

## Update the knowledge base (no code deploy)
- Edit rows directly in Supabase tables `swh_courses` / `swh_faqs` / `swh_policies` / `swh_assets`, OR
- Edit `swh/seed-data/*.json` (+ `swh/seed-data/faq.csv`) and re-run `npm run swh:seed`.

## Safety model
- High-risk intents (payment, refund, deposit, complaint, discount, ask_human, out_of_scope)
  never get an AI answer — holding reply + escalation row for async follow-up.
- Deterministic guardrail blocks invented prices, non-registry links, internal terms,
  and any high-risk answer; on failure the reply downgrades to a holding template.
```

- [ ] **Step 4: Configure Vercel env + deploy**

Add `OPENAI_API_KEY` and `SWH_ADMIN_PASSWORD` to the nomadcraft-next Vercel project env. Apply the migration to the production Supabase, then run `npm run swh:seed` against prod env. Deploy (push to the branch Vercel builds).

- [ ] **Step 5: Commit**

```bash
git add swh/README.md
git commit -m "docs(swh): ops + KB-edit guide"
```

---

## Rollout phases (operational, post-build)

1. **Shadow / internal** — share `/swh-chatbot` only with the SwH team. Watch `/swh-inbox` + `swh_messages.meta` for intent/decision quality. Tune `swh/persona.ts`, `swh/seed-data/*`, and the classify prompt. No code deploy needed for KB edits.
2. **Soft pilot** — share the link with a small batch of real leads. Monitor escalations land correctly and replies stay on-brand + price-safe.
3. **Wider pilot** — broaden the audience; if volume grows, raise `max_tokens`/model and revisit the rate-limit window.

## Deferred / future tracks (out of MVP scope)
- **Vector search**: only when the FAQ KB outgrows the context window (hundreds of entries) — add an embedding index over `swh_faqs`; the structured tables and pipeline stay.
- **arkon (KB governance)**: adopt only when many non-technical people maintain a large KB (ingest/review/version/approve), or as a *separate* internal staff doc-search tool (teacher SOPs, curriculum PDFs). Not the customer bot.
- **FastAPI extraction**: if a Python ML/eval backend is wanted later, lift `swh/` into a FastAPI service; the route handlers in `app/api/swh/**` become thin proxies. UI + schema unchanged.
- **Concrete pricing/schedule answers**: requires SwH to fill a real class/price table (the "Các lớp hiện tại" sheet is currently empty). Until then the bot deflects specifics to the form by design.

---

## Self-Review

**Spec coverage** (against locked decisions): live web chat ✓ (Task 7); admin inbox worklist ✓ (Task 8); structured-KB-not-RAG ✓ (Tasks 1, 5); published-policy-vs-escalate-personal ✓ (Tasks 1.3, 3.1); inline lead capture + placement form ✓ (Tasks 6.2, 1.3 assets); async handoff ✓ (escalations, no live takeover); in-nomadcraft Next backend + Supabase + OpenAI ✓ (Tasks 0, 6); concurrency/stateless ✓ (Task 6.3 + Step 9.1 two-browser check); guardrails/no invented price/no unapproved links/no internal terms ✓ (Task 4); audit log ✓ (`swh_messages.meta`); `swh/` grouping for future migration ✓.

**Placeholder scan:** No "TBD"/"add error handling later" — error handling is concrete in the chat route (try/catch → fallback + escalation). FAQ data is not hand-transcribed (parsed from `faq.csv`), avoiding "fill in the rest." Two inline `> Note:` items point at a known TS-typing soft spot (`extractLead`) with the exact fix, and the `tsx` alias fallback — both actionable, not vague.

**Type consistency:** `LlmClient.classify/.complete`, `policyGate(c, policies, {alreadyClarified})`, `validateReply(reply, {allowedPrices, assets, requiresHuman, decision})`, `runPipeline(input, llm)`, `selectKnowledge(c, text, kb)`, persistence `saveAssistantResult`/`upsertLead`/`ensureConversation` are used identically across tasks and route handlers. `EscalationReason` includes `guardrail` + `api_failure` in both `types.ts` and the migration CHECK constraint.
