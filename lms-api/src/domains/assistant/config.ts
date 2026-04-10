import { z } from 'zod';

const AssistantConfigSchema = z.object({
  GROQ_API_KEY: z.string().trim().optional().default(''),
  OPENROUTER_API_KEY: z.string().trim().optional().default(''),
  LMSTUDIO_BASE_URL: z.string().trim().optional().default('http://localhost:1234'),
  LMSTUDIO_MODEL: z.string().trim().optional().default('gemma-3-12b-it'),
  DEFAULT_MODEL: z.string().trim().min(1).default('llama-3.3-70b-versatile'),
  MAX_TOKENS: z.coerce.number().int().min(64).max(8192).default(1024),
  TEMPERATURE: z.coerce.number().min(0).max(2).default(0.4),
  ASSISTANT_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
  ASSISTANT_MAX_INPUT_CHARS: z.coerce.number().int().min(1000).max(250000).default(20000),
  ASSISTANT_MAX_HISTORY_MESSAGES: z.coerce.number().int().min(0).max(50).default(12),
  ASSISTANT_MAX_DOCUMENT_CHARS: z.coerce.number().int().min(1000).max(500000).default(50000),
  ASSISTANT_CHUNK_SIZE: z.coerce.number().int().min(500).max(20000).default(3500),
  ASSISTANT_CHUNK_OVERLAP: z.coerce.number().int().min(0).max(4000).default(300),
  ASSISTANT_RETRY_ATTEMPTS: z.coerce.number().int().min(0).max(5).default(2),
  ASSISTANT_RETRY_DELAY_MS: z.coerce.number().int().min(100).max(10000).default(500),
});

export type AssistantConfig = {
  groqApiKey: string;
  openRouterApiKey: string;
  lmStudioBaseUrl: string;
  lmStudioModel: string;
  defaultModel: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  maxInputChars: number;
  maxHistoryMessages: number;
  maxDocumentChars: number;
  chunkSize: number;
  chunkOverlap: number;
  retryAttempts: number;
  retryDelayMs: number;
  openRouterModel: string;
};

export function loadAssistantConfig(env: NodeJS.ProcessEnv = process.env): AssistantConfig {
  const parsed = AssistantConfigSchema.parse(env);
  return {
    groqApiKey: parsed.GROQ_API_KEY,
    openRouterApiKey: parsed.OPENROUTER_API_KEY,
    lmStudioBaseUrl: parsed.LMSTUDIO_BASE_URL,
    lmStudioModel: parsed.LMSTUDIO_MODEL,
    defaultModel: parsed.DEFAULT_MODEL,
    maxTokens: parsed.MAX_TOKENS,
    temperature: parsed.TEMPERATURE,
    timeoutMs: parsed.ASSISTANT_TIMEOUT_MS,
    maxInputChars: parsed.ASSISTANT_MAX_INPUT_CHARS,
    maxHistoryMessages: parsed.ASSISTANT_MAX_HISTORY_MESSAGES,
    maxDocumentChars: parsed.ASSISTANT_MAX_DOCUMENT_CHARS,
    chunkSize: parsed.ASSISTANT_CHUNK_SIZE,
    chunkOverlap: parsed.ASSISTANT_CHUNK_OVERLAP,
    retryAttempts: parsed.ASSISTANT_RETRY_ATTEMPTS,
    retryDelayMs: parsed.ASSISTANT_RETRY_DELAY_MS,
    openRouterModel: parsed.DEFAULT_MODEL,
  };
}
