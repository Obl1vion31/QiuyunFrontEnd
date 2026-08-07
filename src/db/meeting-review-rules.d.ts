export function shanghaiKey(value: Date): string;
export function addDays(key: string, days: number): string;
export function automaticMeetingName(start: string, end: string): string;
export function sumPromotionMetrics(metrics: Array<Record<string, unknown>>): { days: number; spend: number; platformOpenCount: number; actualOpenCount: number; platformLeadCount: number; actualLeadCount: number; openCost: number | null; leadCost: number | null };
export function classifySchedule(plannedAt: Date, actualAt: Date | null, thresholdMs?: number): 'published' | 'delayed' | 'unpublished';
