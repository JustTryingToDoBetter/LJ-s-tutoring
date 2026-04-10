import { AssistantError, isRetryableError } from './errors.js';
import { chunkDocumentText, buildDocumentContext, normalizeAssistantText, normalizeHistory, selectRelevantChunks } from './chunking.js';
import { getOdieSystemPrompt } from './personas.js';
import { retryTransient } from './retry.js';
import type {
  AssistantChatInput,
  AssistantCompletionRequest,
  AssistantDocumentInput,
  AssistantHistoryMessage,
  AssistantMessage,
  AssistantProviderName,
  AssistantResult,
} from './types.js';
import type { AssistantProvider } from './provider.js';
import type { AssistantConfig } from './config.js';

type AssistantLogger = Pick<Console, 'info' | 'warn' | 'error' | 'debug'>;

type ProviderPlan = {
  provider: AssistantProvider;
  model: string;
};


export function buildProviderPlan(config: AssistantConfig, providers: AssistantProvider[]) {
  const byName = new Map<AssistantProviderName, AssistantProvider>();
  for (const provider of providers) {
    byName.set(provider.name, provider);
  }

  const plans: ProviderPlan[] = [];
  const lmstudio = byName.get('lmstudio');
  const openrouter = byName.get('openrouter');

  if (lmstudio?.isConfigured) {
    plans.push({ provider: lmstudio, model: config.lmStudioModel });
  }

  if (openrouter?.isConfigured) {
    plans.push({ provider: openrouter, model: config.openRouterModel });
  }

  return dedupePlans(plans);
}

function dedupePlans(plans: ProviderPlan[]) {
  const seen = new Set<string>();
  return plans.filter((plan) => {
    const key = `${plan.provider.name}:${plan.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildMessages(systemPrompt: string, history: AssistantHistoryMessage[], userMessage: string): AssistantMessage[] {
  return [
    { role: 'system', content: systemPrompt },
    ...history,
    { role: 'user', content: userMessage },
  ];
}

function buildDocumentPrompt(question: string, context: string) {
  return [
    'Answer the user using only the document context below.',
    'If the document does not contain enough information, say so clearly.',
    'Prefer grounded, concise answers and mention the exact excerpt numbers you relied on when possible.',
    '',
    `Question: ${question}`,
    '',
    `Document context:\n${context}`,
  ].join('\n');
}

async function runWithFallback(
  plans: ProviderPlan[],
  request: AssistantCompletionRequest,
  operation: 'generateChatResponse' | 'analyzeDocument',
  logger: AssistantLogger,
  retryAttempts: number,
  retryDelayMs: number,
) {
  let lastError: unknown;

  for (let index = 0; index < plans.length; index += 1) {
    const plan = plans[index];
    const attemptNumber = index + 1;
    const shouldLogFallback = index > 0;

    try {
      const result = await retryTransient(
        () => plan.provider[operation]({ ...request, model: plan.model }),
        retryAttempts,
        retryDelayMs,
      );

      return {
        text: result.text,
        metadata: {
          provider: plan.provider.name,
          model: result.model || plan.model,
          fallbackUsed: shouldLogFallback,
          attempts: attemptNumber,
        },
      };
    } catch (error) {
      lastError = error;
      if (shouldLogFallback) {
        logger.warn({
          event: 'assistant.provider.fallback',
          provider: plan.provider.name,
          model: plan.model,
          error: error instanceof Error ? error.message : String(error),
        }, 'assistant.provider.fallback');
      }
      if (index === plans.length - 1 || !isRetryableError(error)) {
        break;
      }
    }
  }

  if (lastError instanceof AssistantError) {
    throw lastError;
  }

  throw new AssistantError('assistant_unavailable', 'Unable to reach the assistant providers', {
    statusCode: 503,
    transient: true,
    details: { cause: lastError instanceof Error ? lastError.message : String(lastError) },
  });
}

export class AssistantService {
  constructor(
    private readonly config: AssistantConfig,
    private readonly providers: AssistantProvider[],
    private readonly logger: AssistantLogger,
  ) {}

  async chat(input: AssistantChatInput): Promise<AssistantResult> {
    const message = normalizeAssistantText(input.message, Number.POSITIVE_INFINITY);
    if (!message) {
      throw new AssistantError('assistant_empty_input', 'Message is required', {
        statusCode: 400,
        transient: false,
      });
    }

    if (message.length > this.config.maxInputChars) {
      throw new AssistantError('assistant_message_too_large', 'Message is too long', {
        statusCode: 413,
        transient: false,
      });
    }

    const history = normalizeHistory(input.history, this.config.maxHistoryMessages);
    const prompt = normalizeAssistantText(input.systemPrompt ?? '', 4000) || getOdieSystemPrompt(input.personaVariant);
    const messages = buildMessages(prompt, history, message);
    const plans = buildProviderPlan(this.config, this.providers);
    if (plans.length === 0) {
      throw new AssistantError('assistant_not_configured', 'No assistant providers are configured', {
        statusCode: 503,
        transient: false,
      });
    }

    const request: AssistantCompletionRequest = {
      messages,
      model: '',
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      timeoutMs: this.config.timeoutMs,
      requestId: input.requestId,
    };

    const result = await runWithFallback(
      plans,
      request,
      'generateChatResponse',
      this.logger,
      this.config.retryAttempts,
      this.config.retryDelayMs,
    );
    return {
      text: result.text,
      metadata: {
        ...result.metadata,
        historyCount: history.length,
        inputChars: message.length,
        promptChars: messages.reduce((total, entry) => total + entry.content.length, 0),
        requestId: input.requestId,
      },
    };
  }

  async analyzeDocument(input: AssistantDocumentInput): Promise<AssistantResult> {
    const documentText = normalizeAssistantText(input.documentText, Number.POSITIVE_INFINITY);
    const userQuestion = normalizeAssistantText(input.userQuestion, Number.POSITIVE_INFINITY);

    if (!documentText) {
      throw new AssistantError('assistant_document_empty', 'Document text is required', {
        statusCode: 400,
        transient: false,
      });
    }

    if (documentText.length > this.config.maxDocumentChars) {
      throw new AssistantError('assistant_document_too_large', 'Document text is too large', {
        statusCode: 413,
        transient: false,
      });
    }

    if (!userQuestion) {
      throw new AssistantError('assistant_question_empty', 'Question is required', {
        statusCode: 400,
        transient: false,
      });
    }

    if (userQuestion.length > this.config.maxInputChars) {
      throw new AssistantError('assistant_question_too_large', 'Question is too large', {
        statusCode: 413,
        transient: false,
      });
    }

    const chunks = chunkDocumentText(documentText, this.config.chunkSize, this.config.chunkOverlap);
    const selectedChunks = selectRelevantChunks(chunks, userQuestion, 5, 12000);
    const context = buildDocumentContext(selectedChunks);
    const prompt = normalizeAssistantText(input.systemPrompt ?? '', 4000) || getOdieSystemPrompt(input.personaVariant);
    const history = normalizeHistory(input.history, this.config.maxHistoryMessages);
    const messages = buildMessages(prompt, history, buildDocumentPrompt(userQuestion, context));
    const plans = buildProviderPlan(this.config, this.providers);

    if (plans.length === 0) {
      throw new AssistantError('assistant_not_configured', 'No assistant providers are configured', {
        statusCode: 503,
        transient: false,
      });
    }

    const request: AssistantCompletionRequest = {
      messages,
      model: '',
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      timeoutMs: this.config.timeoutMs,
      requestId: input.requestId,
    };

    const result = await runWithFallback(
      plans,
      request,
      'analyzeDocument',
      this.logger,
      this.config.retryAttempts,
      this.config.retryDelayMs,
    );
    return {
      text: result.text,
      metadata: {
        ...result.metadata,
        historyCount: history.length,
        inputChars: userQuestion.length + documentText.length,
        promptChars: messages.reduce((total, entry) => total + entry.content.length, 0),
        documentChunksTotal: chunks.length,
        documentChunksUsed: selectedChunks.length,
        requestId: input.requestId,
      },
    };
  }
}

export function createAssistantService(config: AssistantConfig, providers: AssistantProvider[], logger: AssistantLogger) {
  return new AssistantService(config, providers, logger);
}
