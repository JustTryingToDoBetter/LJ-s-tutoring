import { AssistantError } from '../errors.js';
import type { AssistantCompletionRequest, AssistantCompletionResult } from '../types.js';
import type { AssistantProvider } from '../provider.js';

function isTransientStatus(status: number) {
  return status === 408 || status === 409 || status === 425 || status === 429 || status >= 500;
}

async function readErrorResponse(response: Response) {
  const text = await response.text();
  if (!text) return response.statusText || 'request_failed';
  try {
    const parsed = JSON.parse(text) as { error?: { message?: string } | string; message?: string };
    if (typeof parsed.error === 'string') return parsed.error;
    if (parsed.error && typeof parsed.error === 'object' && parsed.error.message) return parsed.error.message;
    if (parsed.message) return parsed.message;
  } catch {
    return text.slice(0, 200);
  }
  return response.statusText || 'request_failed';
}

async function completeLmStudioChat(baseUrl: string, request: AssistantCompletionRequest): Promise<AssistantCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const message = await readErrorResponse(response);
      throw new AssistantError(
        'lmstudio_request_failed',
        message,
        { statusCode: response.status, transient: isTransientStatus(response.status), details: { provider: 'lmstudio' } },
      );
    }

    const payload = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new AssistantError('lmstudio_empty_response', 'LM Studio returned an empty response', {
        statusCode: 502,
        transient: true,
      });
    }

    return {
      text,
      model: payload.model ?? request.model,
      provider: 'lmstudio',
      raw: payload,
    };
  } catch (error) {
    if (error instanceof AssistantError) {
      throw error;
    }
    const transient = error instanceof DOMException && error.name === 'AbortError';
    throw new AssistantError('lmstudio_unavailable', transient ? 'LM Studio request timed out' : 'LM Studio request failed (is it running?)', {
      statusCode: transient ? 504 : 502,
      transient: true,
      details: { provider: 'lmstudio', cause: error instanceof Error ? error.message : String(error) },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createLmStudioProvider(baseUrl: string, model: string): AssistantProvider {
  return {
    name: 'lmstudio',
    isConfigured: Boolean(baseUrl && model),
    generateChatResponse: (request) => completeLmStudioChat(baseUrl, { ...request, model }),
    analyzeDocument: (request) => completeLmStudioChat(baseUrl, { ...request, model }),
  };
}
