import type { AssistantCompletionRequest, AssistantCompletionResult, AssistantProviderName } from './types.js';

export interface AssistantProvider {
  readonly name: AssistantProviderName;
  readonly isConfigured: boolean;
  generateChatResponse(request: AssistantCompletionRequest): Promise<AssistantCompletionResult>;
  analyzeDocument(request: AssistantCompletionRequest): Promise<AssistantCompletionResult>;
}
