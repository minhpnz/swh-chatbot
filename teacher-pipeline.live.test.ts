import { config } from 'dotenv';
config({ path: '.env.local' });

import { describe, it, expect } from 'vitest';
import { createLlmClient } from '@/swh/llm';
import { loadKnowledgeBaseFromFiles } from '@/swh/kb-memory';
import { runPipeline } from '@/swh/pipeline';

// End-to-end teacher answer check (real LLM). Skipped unless SWH_EVAL=1.
// Verifies the hybrid behavior: a named teacher -> direct class answer + profile link.
const RUN = process.env.SWH_EVAL === '1';

describe.skipIf(!RUN)('teacher_info end-to-end (live)', () => {
  const kb = loadKnowledgeBaseFromFiles();
  const llm = createLlmClient();

  it('answers which class Phương Dung teaches and offers the profile link', async () => {
    const r = await runPipeline(
      { text: 'Hiện tại giáo viên Phương Dung đang dạy lớp nào ạ', history: [], kb },
      llm,
    );
    expect(r.decision).toBe('answer');
    expect(r.guardrail.ok).toBe(true);
    // Deterministic contract: her record + the profile link are selected and
    // offered to the model (whether the model emits the URL text is model-quality).
    expect(r.kb_refs).toContain('teacher:Phương Dung');
    expect(r.kb_refs).toContain('asset:link_teacher_info');
    // Answer is grounded in the real schedule (IPA chuyên sâu), not invented.
    expect(r.reply.toLowerCase()).toContain('ipa');
  }, 180000);

  it('lists teachers for a roster question without leaking high-risk', async () => {
    const r = await runPipeline(
      { text: 'Trung tâm mình có những giáo viên nào ạ', history: [], kb },
      llm,
    );
    expect(r.decision).toBe('answer');
    expect(r.guardrail.ok).toBe(true);
    expect(r.kb_refs).toContain('asset:link_teacher_info');
  }, 180000);
});
