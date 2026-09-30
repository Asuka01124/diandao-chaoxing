import { expect, test } from 'bun:test';
import { buildServer } from '../src/server';

test('API 不回显凭据且拒绝无效输入', async () => {
  const app = buildServer();
  const response = await app.inject({ method: 'POST', url: '/v1/provider/login', payload: { identifier: 'alice', password: 'highly-secret' } });
  expect(response.statusCode).toBe(400);
  expect(response.json().code).toBe('INVALID_INPUT');
  expect(response.body).not.toContain('highly-secret');
  await app.close();
});
