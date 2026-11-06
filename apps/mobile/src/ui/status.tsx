import type { AttemptState } from '@sign/shared';
import { Text, YStack } from 'tamagui';

const labels: Record<AttemptState, string> = {
  QUEUED: '排队中', PREFLIGHT: '检查中', SUBMITTING: '提交中', VERIFYING: '确认中',
  SUCCESS: '已签到', ALREADY_SIGNED: '已签到', WAITING_QR: '待新码',
  WAITING_CAPTCHA: '待验证码', WAITING_FACE: '待人脸', REAUTH_REQUIRED: '需重登',
  EXPIRED: '已结束', FAILED: '失败',
};

export function StatusBadge({ state }: { state: AttemptState }) {
  const isOk = state === 'SUCCESS' || state === 'ALREADY_SIGNED';
  const isWarn = state === 'FAILED' || state === 'REAUTH_REQUIRED' || state.startsWith('WAITING_');
  const tone = isOk ? '$success' : isWarn ? '$danger' : '$muted';
  return <YStack backgroundColor={isWarn && !isOk ? '$dangerSoft' : '$soft'} borderRadius={8} paddingHorizontal={10} paddingVertical={4}>
    <Text fontSize={12} fontWeight="500" color={tone}>{labels[state]}</Text>
  </YStack>;
}

export function AccountAvatar({ name }: { name: string }) {
  return <YStack width={38} height={38} borderRadius={12} backgroundColor="$soft" alignItems="center" justifyContent="center">
    <Text color="$color" fontSize={14} fontWeight="500">{name.slice(0, 1).toUpperCase()}</Text>
  </YStack>;
}
