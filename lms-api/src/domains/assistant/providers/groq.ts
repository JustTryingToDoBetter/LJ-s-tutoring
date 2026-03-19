import { AssistantError } from '../errors.js';
import type { AssistantCompletionRequest, AssistantCompletionResult } from '../types.js';
import type { AssistantProvider } from '../provider.js';

function toGroqMessages(messages: AssistantCompletionRequest['messages']) {
  return messages.map((message) => ({ role: message.role, content: message.content }));
}

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

async function completeGroqChat(apiKey: string, request: AssistantCompletionRequest): Promise<AssistantCompletionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), request.timeoutMs);
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'X-Request-Id': request.requestId ?? '',
      },
      body: JSON.stringify({
        model: request.model,
        messages: toGroqMessages(request.messages),
        max_tokens: request.maxTokens,
        temperature: request.temperature,
        stream: false,
      }),
    });

    if (!response.ok) {
      const message = await readErrorResponse(response);
      throw new AssistantError(
        'groq_request_failed',
        message,
        { statusCode: response.status, transient: isTransientStatus(response.status), details: { provider: 'groq' } },
      );
    }

    const payload = await response.json() as {
      model?: string;
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = payload.choices?.[0]?.message?.content?.trim() ?? '';
    if (!text) {
      throw new AssistantError('groq_empty_response', 'Groq returned an empty assistant response', {
        statusCode: 502,
        transient: true,
      });
    }

    return {
      text,
      model: payload.model ?? request.model,
      provider: 'groq',
      raw: payload,
    };
  } catch (error) {
    if (error instanceof AssistantError) {
      throw error;
    }
    const transient = error instanceof DOMException && error.name === 'AbortError';
    throw new AssistantError('groq_unavailable', transient ? 'Groq request timed out' : 'Groq request failed', {
      statusCode: transient ? 504 : 502,
      transient: true,
      details: { provider: 'groq', cause: error instanceof Error ? error.message : String(error) },
    });
  } finally {
    clearTimeout(timeout);
  }
}

export function createGroqProvider(apiKey: string): AssistantProvider {
  return {
    name: 'groq',
    isConfigured: Boolean(apiKey),
    generateChatResponse: (request) => completeGroqChat(apiKey, request),
    analyzeDocument: (request) => completeGroqChat(apiKey, request),
  };
}
