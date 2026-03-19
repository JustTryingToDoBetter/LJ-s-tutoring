export class AssistantError extends Error {
  readonly code: string;

  readonly statusCode: number;

  readonly transient: boolean;

  readonly details?: unknown;

  constructor(code: string, message: string, options: { statusCode?: number; transient?: boolean; details?: unknown } = {}) {
    super(message);
    this.name = 'AssistantError';
    this.code = code;
    this.statusCode = options.statusCode ?? 500;
    this.transient = options.transient ?? false;
    this.details = options.details;
  }
}

export function isRetryableError(error: unknown) {
  if (error instanceof AssistantError) {
    return error.transient;
  }

  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return message.includes('aborted') || message.includes('timeout') || message.includes('fetch failed');
  }

  return false;
}
