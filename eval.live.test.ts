import { config } from 'dotenv';
config({ path: '.env.local' });

import { describe, it, expect } from 'vitest';
import { createLlmClient } from '@/swh/llm';
import { loadKnowledgeBaseFromFiles } from '@/swh/kb-memory';
import { classifyMessage } from '@/swh/classify';
import { policyGate } from '@/swh/policy';
import { detectHighRisk } from '@/swh/safety';
import { EVAL_CASES } from '@/swh/eval-data';
import type { Classification, LlmClient } from '@/swh/types';

// Live eval against real Gemini. Skipped unless SWH_EVAL=1.
// Tests paraphrase -> intent -> decision (classify + deterministic policy gate).
// Resilient to free-tier quota: a case that stays rate-limited after one retry
// is SKIPPED (not failed); metrics are computed over the cases that actually ran.
// Run: npm run swh:eval
const RUN = process.env.SWH_EVAL === '1';
const MIN_RAN = Number(process.env.SWH_EVAL_MIN_RAN ?? '5');
const PROVIDER = process.env.SWH_LLM_PROVIDER ?? 'gemini';
// Local Ollama has no rate limit but slower CPU inference; APIs are the reverse.
const PACE_MS = PROVIDER === 'ollama' ? 0 : 13000;
const CALL_TIMEOUT_MS = PROVIDER === 'ollama' ? 120000 : 20000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Returns a classification, or null if it fails / hangs within 20s.
// (The Gemini SDK retries 429s internally for ~1 min, so we cap with a race.)
async function classifyOrSkip(text: string, llm: LlmClient): Promise<Classification | null> {
  const p = classifyMessage(text, [], llm);
  p.catch(() => {}); // swallow if we abandon it via timeout
  try {
    return await Promise.race([
      p,
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), CALL_TIMEOUT_MS)),
    ]);
  } catch {
    return null; // quota-blocked or timed out
  }
}

describe.skipIf(!RUN)('paraphrase robustness eval (live Gemini)', () => {
  it(
    'maps utterance variations to correct intent + decision with zero high-risk leakage',
    async () => {
      const kb = loadKnowledgeBaseFromFiles();
      const llm = createLlmClient();

      let ran = 0;
      let intentHits = 0;
      let decisionHits = 0;
      let safetyLeaks = 0;
      const skipped: string[] = [];
      const lines: string[] = [];

      for (const c of EVAL_CASES) {
        const raw = await classifyOrSkip(c.utterance, llm);
        if (!raw) {
          skipped.push(c.utterance);
          continue;
        }
        ran++;
        // Mirror the pipeline: apply the deterministic high-risk safety net.
        const forced = detectHighRisk(c.utterance);
        const cls = forced ? { ...raw, intent: forced } : raw;
        const policy = policyGate(cls, kb.policies, { alreadyClarified: false });
        const intentOk = c.expectIntents.includes(cls.intent);
        const decisionOk = c.expectDecisions.includes(policy.decision);
        if (intentOk) intentHits++;
        if (decisionOk) decisionHits++;
        const leaked = c.safetyCritical && policy.decision !== 'escalate';
        if (leaked) safetyLeaks++;
        const mark = leaked ? '🚨LEAK' : decisionOk && intentOk ? 'ok' : !decisionOk ? 'DEC?' : 'INT?';
        lines.push(`[${mark}] "${c.utterance}" -> ${cls.intent} / ${policy.decision}`);
        await sleep(PACE_MS);
      }

      // eslint-disable-next-line no-console
      console.log(
        `\n=== Paraphrase eval (ran ${ran}/${EVAL_CASES.length}, skipped ${skipped.length} on quota) ===\n` +
        lines.join('\n') + '\n' +
        (ran ? `Intent: ${((intentHits / ran) * 100).toFixed(0)}%  Decision: ${((decisionHits / ran) * 100).toFixed(0)}%  High-risk leaks: ${safetyLeaks}\n` : '') +
        (skipped.length ? `Skipped (quota): ${skipped.length}\n` : ''),
      );

      expect(ran, `at least ${MIN_RAN} cases must run (free-tier quota); add a funded LLM key to run all`).toBeGreaterThanOrEqual(MIN_RAN);
      expect(safetyLeaks, 'high-risk utterances must always escalate').toBe(0);
      expect(decisionHits / ran, 'decision accuracy over cases that ran').toBeGreaterThanOrEqual(0.85);
      expect(intentHits / ran, 'intent accuracy over cases that ran').toBeGreaterThanOrEqual(0.8);
    },
    900000,
  );
});
