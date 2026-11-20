import { expect, test } from 'bun:test';
import { locationErrorMessage, locationPermissionMessage, locationTimeoutMessage } from './location-error';

test('高德鉴权异常显示可操作提示，隐藏 SDK 诊断内容', () => {
  const error = new Error('高德地图错误 [LOCATION_FAILED]\n定位失败：auth fail:INVALID_USER_SCODE#SHA1AndPackage#123:dev.local.sign.demo#gsid#test\nhttps://lbs.amap.com/');
  expect(locationErrorMessage(error)).toBe('当前版本未通过高德定位授权，可在地图上手动选点');
  expect(locationErrorMessage(new Error('高德地图错误 [INVALID_API_KEY]'))).toBe(locationErrorMessage(error));
});

test('权限、超时与其他定位异常分别显示简短提示', () => {
  expect(locationErrorMessage(new Error(locationPermissionMessage))).toBe(locationPermissionMessage);
  expect(locationErrorMessage(new Error('高德地图错误 [PERMISSION_DENIED]'))).toBe(locationPermissionMessage);
  expect(locationErrorMessage(new Error(locationTimeoutMessage))).toBe(locationTimeoutMessage);
  expect(locationErrorMessage(new Error('高德地图错误 [LOCATION_FAILED]\n原生诊断细节'))).toBe('定位失败，可在地图上手动选点');
  expect(locationErrorMessage(null)).toBe('定位失败，可在地图上手动选点');
});
