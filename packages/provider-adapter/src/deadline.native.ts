export function getOperationSignal(): AbortSignal | undefined { return undefined; }
export async function withProviderDeadline<T>(work: () => Promise<T>): Promise<T> { return work(); }
