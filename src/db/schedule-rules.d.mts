export const delayThresholdMs: number;
export const delayDayMs: number;
export function isDelayed(plannedAt: Date, at: Date): boolean;
export function delayStartsAt(plannedAt: Date, effectiveAt?: Date | null): Date;
export function delayDayCount(plannedAt: Date, through: Date, effectiveAt?: Date | null): number;
export function delayDays(plannedAt: Date, through: Date, effectiveAt?: Date | null): Array<{ dayNumber: number; dueAt: Date }>;
export function completionStatus(plannedAt: Date, actualAt: Date | null): 'pending' | 'delayed' | 'on_time';
