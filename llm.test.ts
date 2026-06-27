import { describe, it, expect, vi } from 'vitest';
import { withFailover, stripReasoning } from '@/swh/llm';
import type { LlmClient, Classification } from '@/swh/types';

describe('stripReasoning', () => {
  it('removes a <think> reasoning block and keeps the answer', () => {
    const out = stripReasoning('<think>Phương Dung dạy IPA, let me phrase it</think>\nDạ cô dạy lớp IPA nha!');
    expect(out).toBe('Dạ cô dạy lớp IPA nha!');
    expect(out).not.toContain('<think>');
  });

  it('handles multi-line reasoning blocks', () => {
    const out = stripReasoning('<think>\nline1\nline2\n</think>Trả lời cuối');
    expect(out).toBe('Trả lời cuối');
  });

  it('leaves a normal reply untouched', () => {
    expect(stripReasoning('Học phí khoảng 7.900.000đ nha')).toBe('Học phí khoảng 7.900.000đ nha');
  });
});

const CLS = (intent: Classification['intent']): Classification => ({ intent, entities: {}, confidence: 1 });

function stub(over: Partial<LlmClient>): LlmClient {
  return {
    classify: vi.fn(async () => CLS('greeting')),
    complete: vi.fn(async () => 'ok'),
    ...over,
  };
}

describe('withFailover', () => {
  it('uses the primary when it succeeds, never calls the fallback', async () => {
    const fallback = stub({});
    const client = withFailover(stub({ classify: vi.fn(async () => CLS('ask_price')) }), fallback);
    const r = await client.classify('giá bao nhiêu');
    expect(r.intent).toBe('ask_price');
    expect(fallback.classify).not.toHaveBeenCalled();
  });

  it('falls back to the secondary when the primary classify throws', async () => {
    const primary = stub({ classify: vi.fn(async () => { throw new Error('Groq 429'); }) });
    const fallback = stub({ classify: vi.fn(async () => CLS('refund')) });
    const r = await withFailover(primary, fallback).classify('hoàn tiền');
    expect(r.intent).toBe('refund');
    expect(fallback.classify).toHaveBeenCalledOnce();
  });

  it('falls back to the secondary when the primary complete throws', async () => {
    const primary = stub({ complete: vi.fn(async () => { throw new Error('Groq down'); }) });
    const fallback = stub({ complete: vi.fn(async () => 'trả lời dự phòng') });
    const r = await withFailover(primary, fallback).complete('sys', [{ role: 'user', content: 'hi' }]);
    expect(r).toBe('trả lời dự phòng');
  });

  it('reports the failover via the onFailover hook', async () => {
    const onFailover = vi.fn();
    const primary = stub({ complete: vi.fn(async () => { throw new Error('boom'); }) });
    await withFailover(primary, stub({}), onFailover).complete('s', []);
    expect(onFailover).toHaveBeenCalledOnce();
  });

  it('propagates the error when both primary and fallback fail', async () => {
    const primary = stub({ classify: vi.fn(async () => { throw new Error('primary'); }) });
    const fallback = stub({ classify: vi.fn(async () => { throw new Error('fallback too'); }) });
    await expect(withFailover(primary, fallback).classify('x')).rejects.toThrow('fallback too');
  });
});
