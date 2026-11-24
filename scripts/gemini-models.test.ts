import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GenerateContentResponse, ThinkingLevel, type GenerateContentParameters } from '@google/genai';
import { generateWithModelFallback, getGeminiModels } from '../src/utils/geminiModels';

test('Gemini 4 Hydrogen is the default and custom fallback IDs are deduplicated', () => {
  assert.deepEqual(getGeminiModels(), ['gemini-4-hydrogen', 'gemini-3.5-flash-lite']);
  assert.deepEqual(getGeminiModels('gemini-4-neon', ' gemini-4-neon, gemini-3.5-flash-lite ,gemini-3.5-flash-lite '), ['gemini-4-neon', 'gemini-3.5-flash-lite']);
});

test('a model missing from the project or returning 504 falls back and labels the reply with its actual model', async () => {
  for (const status of [404, 429, 503, 504]) {
    const calls: GenerateContentParameters[] = [];
    const result = await generateWithModelFallback(getGeminiModels(), async params => {
      calls.push(params);
      if (calls.length === 1) throw Object.assign(new Error('unavailable'), {status});
      return Object.assign(new GenerateContentResponse(), {candidates: [{ content: { parts: [{ text: 'OK' }] } }]});
    }, {contents: 'test', config: {temperature: 0.2}}, ThinkingLevel.LOW);
    assert.deepEqual(result, {text: 'OK', model: 'gemini-3.5-flash-lite'});
    assert.equal(calls[0].config?.thinkingConfig?.thinkingLevel, ThinkingLevel.LOW);
    assert.equal(calls[0].config?.temperature, undefined);
    assert.equal(calls[1].config?.temperature, 0.2);
  }
});

test('an invalid request or credential error stops after the first call', async () => {
  for (const status of [400, 401, 403]) {
    let calls = 0;
    await assert.rejects(generateWithModelFallback(getGeminiModels(), async () => {
      calls++;
      throw Object.assign(new Error('request rejected'), {status});
    }, {contents: 'test'}, ThinkingLevel.MEDIUM));
    assert.equal(calls, 1);
  }
});
