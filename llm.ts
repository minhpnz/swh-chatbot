import { GoogleGenerativeAI } from '@google/generative-ai';
import type { LlmClient, ChatTurn } from '@/swh/types';
import { parseClassification } from '@/swh/classify';

// Gemini implementation of LlmClient. Mirrors the existing app/api/ai/chat route
// (assistant->model role mapping, startChat history + final message).
// Provider-neutral name so a future OpenAI swap only edits this file.
export function createLlmClient(): LlmClient {
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
      // Gemini requires history to begin with a 'user' turn.
      while (history.length && history[0]?.role === 'model') history.shift();
      const chat = model.startChat({ history });
      const res = await chat.sendMessage(last?.content ?? '');
      return res.response.text().trim();
    },
  };
}
