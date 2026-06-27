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

  it('strips markdown fences', () => {
    const c = parseClassification('```json\n{"intent":"greeting","entities":{},"confidence":0.8}\n```');
    expect(c.intent).toBe('greeting');
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

  it('documents casual teacher age and Vietnamese birth-year shorthand as teacher_info', () => {
    const p = buildClassifyPrompt('Hằng bao nhiêu tuổi', []);
    expect(p).toContain('teacher_info');
    expect(p).toContain('2k2 nghĩa là sinh năm 2002');
    expect(p).toContain('sinh năm 90 nghĩa là 1990');
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
