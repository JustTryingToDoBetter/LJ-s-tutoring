import { AssistantError } from './errors.js';

export async function retryTransient<T>(operation: () => Promise<T>, attempts: number, delayMs: number) {
  let lastError: unknown;
  const totalAttempts = Math.max(1, attempts + 1);

  for (let index = 0; index < totalAttempts; index += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const retryable = error instanceof AssistantError ? error.transient : true;
      if (!retryable || index === totalAttempts - 1) {
        throw error;
      }
      await wait(delayMs * (index + 1));
    }
  }

  throw lastError;
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
