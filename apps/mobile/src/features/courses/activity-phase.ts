import type { Activity } from '@sign/shared';

export function activityPhase(activity: Activity, now = Date.now()): 'ongoing' | 'ended' | 'uncertain' {
  if (activity.status === 2) return 'ended';
  if ((activity.status != null && activity.status !== 1) || (activity.endTime != null && activity.endTime <= now)) {
    return 'uncertain';
  }
  return 'ongoing';
}

const phaseLabels = { ongoing: '进行中', ended: '已结束', uncertain: '状态待确认' } as const;
export function activityPhaseLabel(activity: Activity) { return phaseLabels[activityPhase(activity)]; }
