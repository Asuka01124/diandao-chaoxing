import type { AttemptState } from '@sign/shared';
import { Text, YStack } from 'tamagui';

const labels: Record<AttemptState, string> = { QUEUED: '排队中', PREFLIGHT: '预检查', SUBMITTING: '提交中', VERIFYING: '核验中', SUCCESS: '成功', ALREADY_SIGNED: '已签到', WAITING_QR: '等待新二维码', WAITING_CAPTCHA: '等待验证码', WAITING_FACE: '等待人脸验证', REAUTH_REQUIRED: '需重新授权', EXPIRED: '已结束', FAILED: '失败' };
export function StatusBadge({ state }: { state: AttemptState }) { return <Text fontSize={12} fontWeight="600" color={state === 'SUCCESS' || state === 'ALREADY_SIGNED' ? '$success' : state === 'FAILED' || state === 'REAUTH_REQUIRED' ? '$danger' : '$brand'}>{labels[state]}</Text>; }
export function AccountAvatar({ name }: { name: string }) { return <YStack width={42} height={42} borderRadius={21} backgroundColor="$soft" alignItems="center" justifyContent="center"><Text color="$brand" fontSize={18} fontWeight="700">{name.slice(0, 1).toUpperCase()}</Text></YStack>; }
