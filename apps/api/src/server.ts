import { readFileSync } from 'node:fs';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError, type ZodType } from 'zod';
import { accountRequestSchema, activitiesRequestSchema, activityRequestSchema, groupActivitiesRequestSchema, loginRequestSchema, mediaRequestSchema, submitRequestSchema, type ApiErrorCode } from '@sign/shared';
import * as provider from '@sign/provider-adapter';
import { groups, groupActivities } from '@sign/provider-adapter/groups';

type Operation<T> = (body: T) => Promise<unknown>;
const isLocal = (ip: string) => ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip);

export function buildServer(options: { tls?: { key: Buffer; cert: Buffer }; rateLimit?: number } = {}) {
  const limit = new Map<string, { count: number; until: number }>();
  const common = { logger: false as const, bodyLimit: 3 * 1024 * 1024, requestTimeout: 20000, connectionTimeout: 10000 };
  const app: FastifyInstance = options.tls ? Fastify({ ...common, https: options.tls }) : Fastify(common);
  app.addHook('onRequest', async (request, reply) => {
    const secure = 'encrypted' in request.raw.socket && Boolean(request.raw.socket.encrypted);
    if (!secure && !isLocal(request.ip)) return reply.code(403).send({ code: 'INVALID_INPUT', message: '必须使用 HTTPS', retryable: false, requestId: request.id });
    const now = Date.now(); const bucket = limit.get(request.ip);
    if (limit.size > 1000) for (const [ip, entry] of limit) if (entry.until < now) limit.delete(ip);
    const next = !bucket || bucket.until < now ? { count: 1, until: now + 60000 } : { count: bucket.count + 1, until: bucket.until };
    limit.set(request.ip, next);
    if (next.count > (options.rateLimit ?? 30)) return reply.code(429).send({ code: 'RATE_LIMITED', message: '请求过于频繁', retryable: true, requestId: request.id });
  });
  function route<T>(path: string, schema: ZodType<T>, operation: Operation<T>) {
    app.post(path, async (request, reply) => {
      try { return await provider.withProviderDeadline(() => operation(schema.parse(request.body))); }
      catch (error) {
        let code: ApiErrorCode = 'UNKNOWN'; let message = '请求失败'; let retryable = false;
        if (error instanceof ZodError) { code = 'INVALID_INPUT'; message = '请求参数无效'; }
        else if (error instanceof provider.ProviderError) { code = error.code; message = error.message; retryable = error.retryable; }
        // 原始异常和请求体均不得写日志，也不得返回第三方原文。
        return reply.code(code === 'INVALID_INPUT' ? 400 : code === 'RATE_LIMITED' ? 429 : 502).send({ code, message, retryable, requestId: request.id });
      }
    });
  }
  route('/v1/provider/login', loginRequestSchema, b => provider.login(b.identifier, b.password, b.deviceCode));
  route('/v1/provider/session/check', accountRequestSchema, b => provider.checkSession(b.session));
  route('/v1/provider/courses', accountRequestSchema, b => provider.courses(b.session));
  route('/v1/provider/activities', activitiesRequestSchema, b => provider.activities(b.session, b.courseId, b.classId));
  route('/v1/provider/groups', accountRequestSchema, b => groups(b.session));
  route('/v1/provider/group-activities', groupActivitiesRequestSchema, b => groupActivities(b.session, b.groupId));
  route('/v1/provider/activity-detail', activityRequestSchema, b => provider.activityDetail(b.session, b.activity));
  route('/v1/provider/sign/preflight', activityRequestSchema, b => provider.preflight(b.session, b.activity));
  route('/v1/provider/sign/submit', submitRequestSchema, b => provider.submit(b.session, b.activity, b.input, undefined, b.faceMediaId));
  route('/v1/provider/sign/status', activityRequestSchema, b => provider.signStatus(b.session, b.activity));
  route('/v1/provider/media', mediaRequestSchema, b => provider.uploadPhoto(b.session, b.jpegBase64));
  app.get('/health', async () => ({ ok: true }));
  return app;
}

if (process.argv[1]?.endsWith('server.ts')) {
  const keyPath = process.env.TLS_KEY_FILE, certPath = process.env.TLS_CERT_FILE;
  if (Boolean(keyPath) !== Boolean(certPath)) throw new Error('TLS_KEY_FILE 和 TLS_CERT_FILE 必须同时设置');
  const tls = keyPath && certPath ? { key: readFileSync(keyPath), cert: readFileSync(certPath) } : undefined;
  const host = process.env.HOST ?? '127.0.0.1';
  if (!tls && !['127.0.0.1', '::1'].includes(host)) throw new Error('非本机监听必须启用 HTTPS');
  buildServer({ tls }).listen({ host, port: Number(process.env.PORT ?? 3000) });
}
