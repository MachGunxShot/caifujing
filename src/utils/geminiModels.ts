import { ThinkingLevel, type GenerateContentParameters, type GenerateContentResponse } from '@google/genai';

export const DEFAULT_GEMINI_MODEL = 'gemini-4-hydrogen';
export const DEFAULT_GEMINI_FALLBACKS = 'gemini-3.1-flash-lite';
export const DEFAULT_GEMINI_TIMEOUT_MS = 25_000;

export function getGeminiModels(primary?: string, fallbacks = DEFAULT_GEMINI_FALLBACKS) {
  const names = [primary?.trim() || DEFAULT_GEMINI_MODEL, ...fallbacks.split(',')];
  return [...new Set(names.map(name => name.trim()).filter(Boolean))];
}

const fallbackStatuses = new Set([408, 404, 429, 500, 502, 503, 504]);
const networkErrorCodes = new Set(['UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'ECONNRESET', 'ETIMEDOUT', 'EAI_AGAIN']);

function getFallbackReason(error: unknown): string | undefined {
  const err = error as { status?: number | string; code?: number | string; cause?: { code?: string }; name?: string; message?: string } | null;
  const status = Number(err?.status ?? err?.code);
  if (fallbackStatuses.has(status)) return String(status);
  if (status >= 400) return;
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError' || networkErrorCodes.has(err?.cause?.code ?? '')) return 'network timeout or interruption';
  if (err?.message === 'fetch failed') return 'connection failed';
}

export async function generateWithModelFallback(
  models: string[],
  generate: (params: GenerateContentParameters) => Promise<GenerateContentResponse>,
  params: Omit<GenerateContentParameters, 'model'>,
  thinkingLevel: ThinkingLevel.LOW | ThinkingLevel.MEDIUM,
) {
  let lastError: unknown;
  for (const model of models) {
    const config = { ...params.config };
    if (model.replace(/^models\//, '').startsWith('gemini-4-')) {
      delete config.temperature;
      config.thinkingConfig = { thinkingLevel };
    }

    try {
      const response = await generate({ ...params, config, model });
      return { text: response.text?.trim() || '', model };
    } catch (error) {
      const reason = getFallbackReason(error);
      if (!reason) throw error;
      lastError = error;
      console.warn('Gemini model attempt failed', { model, reason });
    }
  }
  throw lastError;
}
