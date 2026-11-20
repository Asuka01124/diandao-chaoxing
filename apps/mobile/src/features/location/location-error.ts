export const locationPermissionMessage = '未开启定位权限，请在地图上选点，或在系统设置中允许定位';
export const locationTimeoutMessage = '定位超时，可在地图上手动选点';

export function locationErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : '';
  if (/\b(?:INVALID_USER_SCODE|INVALID_API_KEY|SHA1AndPackage)\b/i.test(message)) {
    return '当前版本未通过高德定位授权，可在地图上手动选点';
  }
  if (message === locationPermissionMessage || /\bPERMISSION_DENIED\b/.test(message)) {
    return locationPermissionMessage;
  }
  if (message === locationTimeoutMessage) return locationTimeoutMessage;
  return '定位失败，可在地图上手动选点';
}
