import type { ApiErrorCode } from '@sign/shared';

export class ProviderError extends Error {
  constructor(public code: ApiErrorCode, message: string, public retryable = false) { super(message); }
}
