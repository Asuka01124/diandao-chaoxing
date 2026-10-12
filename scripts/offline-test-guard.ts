// 测试必须注入模拟 Transport；误用默认 fetch 时直接失败，不访问真实后端。
globalThis.fetch = Object.assign(async () => {
  throw new Error('离线测试禁止真实网络请求，请注入模拟 Transport');
}, { preconnect() {} }) as typeof fetch;
