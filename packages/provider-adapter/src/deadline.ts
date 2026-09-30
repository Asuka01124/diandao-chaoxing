import { AsyncLocalStorage } from 'node:async_hooks';

const operationSignal = new AsyncLocalStorage<AbortSignal>();
export function getOperationSignal(): AbortSignal | undefined { return operationSignal.getStore(); }
export async function withProviderDeadline<T>(work: () => Promise<T>, timeoutMs = 18_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try { return await operationSignal.run(controller.signal, work); }
  finally { clearTimeout(timer); }
}
