export function attendanceState(value: unknown): 'SIGNED' | 'READY' | null {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value))) return null;
  const status = Number(value);
  if ([1, 2, 3, 9].includes(status)) return 'SIGNED';
  return status === 0 ? 'READY' : null;
}
