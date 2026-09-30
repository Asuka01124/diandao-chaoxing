import type { Activity } from '@sign/shared';

export function activityPhase(activity: Activity, now = Date.now()): 'ongoing' | 'ended' {
  if (activity.status != null && activity.status !== 1) return 'ended';
  if (activity.endTime != null && activity.endTime <= now) return 'ended';
  return 'ongoing';
}
