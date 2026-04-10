export type AssistantRole = 'system' | 'user' | 'assistant';

export type AssistantHistoryMessage = {
  role: 'user' | 'assistant';
  content: string;
};

export type AssistantMessage = {
  role: AssistantRole;
  content: string;
};

export type AssistantProviderName = 'groq' | 'openrouter' | 'lmstudio';

export type AssistantResponseMetadata = {
  provider: AssistantProviderName;
  model: string;
  fallbackUsed: boolean;
  attempts: number;
  historyCount: number;
  inputChars: number;
  promptChars: number;
  documentChunksTotal?: number;
  documentChunksUsed?: number;
  requestId?: string;
};

export type AssistantCompletionRequest = {
  messages: AssistantMessage[];
  model: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
  requestId?: string;
};

export type AssistantCompletionResult = {
  text: string;
  model: string;
  provider: AssistantProviderName;
  raw?: unknown;
};

export type AssistantChatInput = {
  message: string;
  history?: AssistantHistoryMessage[];
  personaVariant?: string;
  systemPrompt?: string;
  requestId?: string;
};

export type AssistantDocumentInput = {
  documentText: string;
  userQuestion: string;
  history?: AssistantHistoryMessage[];
  personaVariant?: string;
  systemPrompt?: string;
  requestId?: string;
};

export type AssistantResult = {
  text: string;
  metadata: AssistantResponseMetadata;
};
