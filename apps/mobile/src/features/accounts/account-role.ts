import type { Account, VaultData } from '@sign/shared';

export const primaryAccount = (data: VaultData | null | undefined): Account | undefined => data?.accounts.find(account => account.role === 'primary');
export const hasPrimaryAccount = (data: VaultData | null | undefined): boolean => Boolean(primaryAccount(data));
