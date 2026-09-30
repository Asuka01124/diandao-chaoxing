import { z } from 'zod';

export const locationSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  address: z.string().trim().min(1).max(300),
});

export const signInputSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('click') }),
  locationSchema.extend({ kind: z.literal('location') }),
  z.object({ kind: z.literal('photo'), mediaIdByAccount: z.record(z.string(), z.string().min(1)), location: locationSchema.optional() }),
  z.object({ kind: z.literal('qr'), qrPayload: z.string().trim().min(1).max(2048), scannedAt: z.iso.datetime(), location: locationSchema.optional() }),
  z.object({ kind: z.literal('code'), code: z.string().trim().regex(/^\d{4,12}$/), location: locationSchema.optional() }),
  z.object({ kind: z.literal('gesture'), sequence: z.string().regex(/^[1-9]{4,9}$/).refine(s => new Set(s).size === s.length), location: locationSchema.optional() }),
]);
export type SignInput = z.infer<typeof signInputSchema>;
export type LocationInput = z.infer<typeof locationSchema>;

export const sessionSchema = z.object({
  identifier: z.string().min(1),
  encryptedPassword: z.string().min(1),
  cookies: z.array(z.object({ name: z.string(), value: z.string(), domain: z.string(), path: z.string().default('/'), expires: z.number().optional() })),
  userId: z.string().min(1),
  fid: z.string(),
  name: z.string().min(1),
  deviceCode: z.string().min(1),
  uid: z.string().optional(),
  imEncryptedPassword: z.string().optional(),
});
export type ProviderSession = z.infer<typeof sessionSchema>;

export const activitySchema = z.object({
  id: z.string().min(1), courseId: z.string().min(1), classId: z.string().min(1),
  source: z.enum(['course', 'group']), groupId: z.string().optional(),
  title: z.string(), kind: z.enum(['click', 'location', 'photo', 'qr', 'code', 'gesture', 'unknown']),
  startTime: z.number().nullable(), endTime: z.number().nullable(),
  status: z.number().int().nullable().optional(),
  signed: z.boolean().nullable(), ext: z.string().default('{}'),
  cachedAt: z.number().optional(),
  cacheAccountId: z.string().optional(),
  phase: z.enum(['sign-in', 'sign-out']).optional(),
  relation: z.object({ signInId: z.string().optional(), signOutId: z.string().optional(), signOutPublishTime: z.number().nullable() }).optional(),
  requirements: z.object({ captcha: z.boolean(), face: z.boolean(), location: z.boolean(), photo: z.boolean() }).optional(),
});
export type Activity = z.infer<typeof activitySchema>;
export type Course = { id: string; classId: string; name: string; teacher?: string; imageUrl?: string };
export type ChatGroup = { id: string; name: string };

export const attemptStates = ['QUEUED', 'PREFLIGHT', 'SUBMITTING', 'VERIFYING', 'SUCCESS', 'ALREADY_SIGNED', 'WAITING_QR', 'WAITING_CAPTCHA', 'WAITING_FACE', 'REAUTH_REQUIRED', 'EXPIRED', 'FAILED'] as const;
export type AttemptState = typeof attemptStates[number];
export type Account = { id: string; label: string; role: 'primary' | 'delegate'; session: ProviderSession; authorizedAt: string; verifiedAt?: string; state: 'VALID' | 'UNKNOWN' | 'REAUTH_REQUIRED' };
export type Job = { id: string; activity: Activity; input: SignInput; accountIds: string[]; photoUri?: string; faceMediaIdByAccount?: Record<string, string>; createdAt: string; state: 'RUNNING' | 'WAITING' | 'DONE' };
export type Attempt = { jobId: string; accountId: string; state: AttemptState; count: number; updatedAt: string; message?: string; code?: string };
export type VaultData = { schemaVersion: 2; accounts: Account[]; activityCache: Activity[]; jobs: Job[]; attempts: Attempt[]; settings: { favoriteLocations: LocationInput[]; imageRetentionHours: number; appearance: 'system' | 'light' | 'dark' } };
export const emptyVault = (): VaultData => ({ schemaVersion: 2, accounts: [], activityCache: [], jobs: [], attempts: [], settings: { favoriteLocations: [], imageRetentionHours: 24, appearance: 'system' } });

export const apiErrorCodes = ['INVALID_INPUT', 'NETWORK_TIMEOUT', 'SESSION_EXPIRED', 'REAUTH_REQUIRED', 'ACTIVITY_NOT_FOUND', 'NOT_MEMBER', 'ALREADY_SIGNED', 'QR_EXPIRED', 'LOCATION_REJECTED', 'VALIDATION_FAILED', 'PROVIDER_CHANGED', 'UNSUPPORTED', 'RATE_LIMITED', 'UNKNOWN'] as const;
export type ApiErrorCode = typeof apiErrorCodes[number];
export type SignStatus = { state: 'READY' | 'SIGNED' | 'EXPIRED' | 'WAITING_CAPTCHA' | 'WAITING_FACE' | 'WAITING_QR'; message?: string; submitted?: boolean };

export function validateActivityInput(activity: Activity, input: SignInput): void {
  signInputSchema.parse(input);
  if (activity.kind !== input.kind) throw new Error('输入类型与活动不匹配');
  if (activity.requirements?.location && input.kind !== 'location' && (!('location' in input) || !input.location))
    throw new Error('该活动要求位置输入');
}
