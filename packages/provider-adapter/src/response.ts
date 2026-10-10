import { ProviderError } from './errors';

export function asObject(data: unknown): Record<string, unknown> {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new ProviderError('PROVIDER_CHANGED', '第三方响应格式已变化');
  return data as Record<string, unknown>;
}
export function asArray(data: unknown): unknown[] {
  if (!Array.isArray(data)) throw new ProviderError('PROVIDER_CHANGED', '第三方列表格式已变化');
  return data;
}
export async function json(response: Response): Promise<Record<string, unknown>> {
  try { return asObject(await response.json()); } catch { throw new ProviderError('PROVIDER_CHANGED', '第三方返回了无法解析的数据'); }
}
export function str(v: unknown, field: string): string {
  if (typeof v !== 'string' && typeof v !== 'number') throw new ProviderError('PROVIDER_CHANGED', `第三方缺少 ${field}`);
  return String(v);
}
export function stamp(v: unknown): number | null { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : null; }

export function responseMessage(body: string): string {
  let message = body;
  try {
    const data = JSON.parse(body);
    const detail = data?.errorMsg || data?.msg || data?.message;
    if (typeof detail === 'string') message = detail;
  } catch {}
  return message.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400);
}
