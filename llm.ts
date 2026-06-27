import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LlmClient, ChatTurn } from '@/swh/types';
import { parseClassification } from '@/swh/classify';

type Provider = 'ollama' | 'groq' | 'gemini';

function createProvider(name: string): LlmClient {
  if (name === 'ollama') return createOllamaClient();
  if (name === 'groq') return createGroqClient();
  return createGeminiClient();
}

// Wrap two clients so a failure on the primary (quota/429, network, host down)
// transparently retries on the fallback. Pure logic — unit-tested in llm.test.ts.
export function withFailover(
  primary: LlmClient,
  fallback: LlmClient,
  onFailover: (op: string, err: unknown) => void = (op, err) =>
    // eslint-disable-next-line no-console
    console.warn(`[swh/llm] primary ${op} failed, falling back: ${err instanceof Error ? err.message : err}`),
): LlmClient {
  return {
    async classify(prompt) {
      try {
        return await primary.classify(prompt);
      } catch (e) {
        onFailover('classify', e);
        return fallback.classify(prompt);
      }
    },
    async complete(system, messages) {
      try {
        return await primary.complete(system, messages);
      } catch (e) {
        onFailover('complete', e);
        return fallback.complete(system, messages);
      }
    },
  };
}

// Provider-switchable LLM client. Default 'gemini' (for deploy); set
// SWH_LLM_PROVIDER=ollama for a free local model (dev/eval, no quota).
// Set SWH_LLM_FALLBACK (e.g. 'ollama') to transparently fail over when the
// primary errors — e.g. Groq quota exhausted -> self-hosted Ollama tunnel.
export function createLlmClient(): LlmClient {
  const provider = process.env.SWH_LLM_PROVIDER ?? 'gemini';
  const primary = createProvider(provider);
  const fallbackName = process.env.SWH_LLM_FALLBACK;
  if (fallbackName && fallbackName !== provider) {
    return withFailover(primary, createProvider(fallbackName));
  }
  return primary;
}

function createGeminiClient(): LlmClient {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY');
  const genAI = new GoogleGenerativeAI(apiKey);
  const modelName = process.env.SWH_LLM_MODEL ?? 'gemini-2.5-flash';

  return {
    async classify(prompt: string) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        generationConfig: { temperature: 0, responseMimeType: 'application/json' },
      });
      const res = await model.generateContent(prompt);
      return parseClassification(res.response.text());
    },
    async complete(system: string, messages: ChatTurn[]) {
      const model = genAI.getGenerativeModel({
        model: modelName,
        systemInstruction: system,
        generationConfig: { temperature: 0.7, maxOutputTokens: 800 },
      });
      const last = messages[messages.length - 1];
      const history = messages.slice(0, -1).map((m) => ({
        role: (m.role === 'assistant' ? 'model' : 'user') as 'user' | 'model',
        parts: [{ text: m.content }],
      }));
      while (history.length && history[0]?.role === 'model') history.shift();
      const chat = model.startChat({ history });
      const res = await chat.sendMessage(last?.content ?? '');
      return res.response.text().trim();
    },
  };
}

function createOllamaClient(): LlmClient {
  const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  const model = process.env.SWH_LLM_MODEL ?? 'qwen2.5:3b';

  async function chat(
    messages: { role: string; content: string }[],
    extra: Record<string, unknown>,
  ): Promise<string> {
    const res = await fetch(`${host}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, ...extra }),
    });
    if (!res.ok) throw new Error(`Ollama ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { message?: { content?: string } };
    return data.message?.content ?? '';
  }

  return {
    async classify(prompt: string) {
      const content = await chat([{ role: 'user', content: prompt }], {
        format: 'json',
        options: { temperature: 0 },
      });
      return parseClassification(content);
    },
    async complete(system: string, messages: ChatTurn[]) {
      const msgs = [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
      const content = await chat(msgs, { options: { temperature: 0.7, num_predict: 800 } });
      return content.trim();
    },
  };
}

// Remove a leading <think>...</think> reasoning block (qwen3 etc.) so it never
// reaches the user or breaks JSON parsing. Defensive even when reasoning is off.
export function stripReasoning(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

// Groq: free, fast, OpenAI-compatible cloud LLM. No quota wall like Gemini free-tier,
// no self-hosted machine to keep online. Get a free key at console.groq.com.
function createGroqClient(): LlmClient {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('Missing GROQ_API_KEY');
  const model = process.env.SWH_LLM_MODEL ?? 'llama-3.3-70b-versatile';
  // qwen3 reasoning models think by default; disable it for fast, clean output.
  const noReasoning = /qwen/i.test(model) ? { reasoning_effort: 'none' } : {};

  async function chat(messages: { role: string; content: string }[], extra: Record<string, unknown>): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, ...noReasoning, ...extra }),
    });
    if (!res.ok) throw new Error(`Groq ${res.status}: ${await res.text()}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? '';
  }

  return {
    async classify(prompt: string) {
      const content = await chat([{ role: 'user', content: prompt }], {
        temperature: 0,
        response_format: { type: 'json_object' },
      });
      return parseClassification(stripReasoning(content));
    },
    async complete(system: string, messages: ChatTurn[]) {
      const msgs = [{ role: 'system', content: system }, ...messages.map((m) => ({ role: m.role, content: m.content }))];
      const content = await chat(msgs, { temperature: 0.7, max_tokens: 800 });
      return stripReasoning(content).trim();
    },
  };
}
