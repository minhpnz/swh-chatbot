# SpeakwithHang (SwH) chatbot — architecture

End-to-end: from the raw `swh_data/` CSV + PNG files to the reply rendered in the chat UI.

There are **two phases**: an offline **data/ingestion phase** (run by you, occasionally) that turns source files into the knowledge base, and an online **request phase** (per user message) that classifies → gates → grounds → generates → guards → persists.

---

## 1. Big picture (source files → reply)

```
        OFFLINE  (run on demand: npm run swh:ingest / swh:seed)
 ┌──────────────────────────────────────────────────────────────────────┐
 │  swh_data/*.csv  (faq, consulting process, schedules …)               │
 │  swh_data/*.png  (class schedule / teacher collage images)            │
 │            │                                                           │
 │   ┌────────┴───────────┐                 ┌──────────────────────────┐  │
 │   │ ingest.ts          │                 │ seed-data/*.json (curated │  │
 │   │  • CSV → text      │                 │  from the CSV/PNG sources)│  │
 │   │  • PNG → Groq      │                 │  courses / faq.csv /      │  │
 │   │    vision OCR → md │                 │  policies / assets /      │  │
 │   │  • dedup by hash   │                 │  teachers(+classes)       │  │
 │   └────────┬───────────┘                 └────────────┬─────────────┘  │
 │            ▼                                           ▼ seed.ts        │
 │   swh_kb_documents                       swh_courses / swh_faqs /      │
 │   (raw text docs —                       swh_policies / swh_assets /   │
 │    future RAG, not yet                   swh_teachers   ◄── runtime    │
 │    queried at runtime)                   source of truth              │
 └──────────────────────────────────────────────────────────────────────┘
                                                          │
                                                          │ (Supabase Postgres)
 ════════════════════════════════════════════════════════╪══════════════════
        ONLINE   (per user message)                       │
 ┌──────────────────────────────────────────────────────────────────────┐
 │  Browser: ChatWidget.tsx  ──POST {conversation_id, text}──►           │
 │                                                                        │
 │  app/api/swh/chat/route.ts  (Next.js route, maxDuration 60s)          │
 │   1. ensureConversation / rate-limit / saveUserMessage / bot-paused?  │
 │   2. load in parallel: loadKnowledgeBase() ← swh_* tables,            │
 │                        getHistory(), lastAssistantWasClarify()        │
 │   3. runPipeline(input, llm)        ◄── core brain (see §2)           │
 │   4. saveAssistantResult() + upsertLead()                            │
 │   5. JSON { reply, decision } ──► UI renders markdown bubble          │
 └──────────────────────────────────────────────────────────────────────┘
```

`swh_kb_documents` (from `ingest.ts`) is an MVP doc store / future RAG source; the **runtime answers from the structured `swh_*` tables**, which `seed.ts` populates from `seed-data/*.json` (hand-curated from the same CSV/PNG sources). Schema changes require applying the migration to the live DB **and** re-seeding — see `[[swh-live-db-migrations]]`.

---

## 2. The request pipeline (`swh/pipeline.ts` — the brain)

```
 text + history + KB
        │
        ▼
 ┌─────────────────┐   LlmClient.classify()         classify.ts builds the prompt;
 │ classifyMessage │ ─────────────────────────────► llm.ts calls Groq (model rotation
 └─────────────────┘   → {intent, entities, conf}   + failover) and parses JSON
        │
        ▼
 ┌──────────────────────────────────────────────┐
 │ Deterministic overrides (never trust LLM      │   safety.ts  : money/dispute/human → force escalate
 │ alone on safety / known patterns):            │   kb.ts      : "lớp của Hằng", age, class code →
 │   detectHighRisk(text)  → force intent        │                detectTeacherInfo → teacher_info
 │   detectTeacherInfo(...) → teacher_info        │
 └──────────────────────────────────────────────┘
        │
        ▼
 ┌─────────────────┐   policy.ts                    escalate │ holding │ clarify │
 │   policyGate    │ ─────────────────────────────► answer   │ answer_cta
 └─────────────────┘   decision + risk + requires_human
        │
        ├───────────────► escalate / holding ──► reply = holding template (from swh_assets)
        │                                         + record escalation (human follow-up)
        ▼  answer / answer_cta / clarify
 ┌─────────────────┐   kb.ts  — picks ONLY the relevant rows:
 │  selectKnowledge│   courses (by name/keyword), faqs (token overlap),
 └─────────────────┘   policies (by topic), teachers (by name / title / class code)
        │              → SelectedKnowledge + kb_refs
        ▼
 ┌─────────────────┐   generate.ts builds the system prompt =
 │  generateReply  │   SWH_PERSONA + SWH_FACTS (incl. consulting flow / entry criteria /
 └─────────────────┘   payment terms) + selected KB + action directive
        │              → LlmClient.complete() → Groq → reply text
        ▼
 ┌─────────────────┐   guardrails.ts validateReply():
 │  validateReply  │   • no invented prices (only allowed set)
 └─────────────────┘   • no unapproved links   • no banned words ("bot/AI")
        │              • never answer high-risk directly
        │   fail ─────► downgrade to holding template + escalation(reason: guardrail)
        ▼  ok
   PipelineResult { reply, decision, classification, escalation?, lead, kb_refs, ... }
```

### Decision types
| decision | when | reply source |
|---|---|---|
| `answer` | normal info (price, schedule, teacher, policy) | LLM, grounded in KB |
| `answer_cta` | consult / placement / promo | LLM + invite Tên+SĐT / form |
| `clarify` | vague / low-confidence (1st turn) | LLM asks exactly one question |
| `escalate` | money / dispute / complaint / human, or unknown-critical after clarify | holding template, human follows up |
| `holding` | guardrail caught a problem in the generated reply | holding template |

---

## 3. Cross-cutting components

- **`llm.ts` — `LlmClient`** (`classify` + `complete`). Provider-switchable (`SWH_LLM_PROVIDER`): Groq (prod) / Gemini / Ollama. Groq **rotates** across models (`SWH_LLM_MODEL` list) with per-model cooldown on rate-limit, and optional **failover** to a second provider (`SWH_LLM_FALLBACK`). Strips `<think>` blocks.
- **Safety net (`safety.ts`)** — deterministic regex forces escalation for money/dispute/human even if the LLM misclassifies. Over-escalation is acceptable; leakage is not.
- **Guardrails (`guardrails.ts`)** — last line of defense on the *generated* text: prices, links, banned terms, high-risk leakage.
- **Persistence (`persistence.ts`)** — `swh_conversations`, `swh_messages`, `swh_leads`, `swh_escalations`. Rate-limit + "bot paused" (human takeover) + lead capture.
- **Admin surface** — `app/swh-inbox` + `app/api/swh/admin/*` read conversations / escalations for human follow-up.
- **Frontend (`components/ChatWidget.tsx`)** — single-page chat, markdown rendering, `conversation_id` in `localStorage`.

## 4. Test coverage map (deterministic, no LLM/quota)
- `kb.test.ts`, `kb-db.test.ts` — selection + DB-grounding (every teacher/class/price/course reachable).
- `policy.test.ts`, `safety.test.ts`, `guardrails.test.ts` — routing + safety + output validation.
- `pipeline.test.ts`, `consulting-flow.test.ts` — end-to-end behaviour incl. the 6-step consulting playbook.
- `eval-data.ts` + `*.live.test.ts` — fuzzy classification/quality, gated by `SWH_EVAL` (real LLM).
