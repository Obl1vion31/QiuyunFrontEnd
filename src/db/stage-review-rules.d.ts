export type ReviewCheckpointType = 'day_7' | 'day_15';
export interface ReviewCheckpoint { type: ReviewCheckpointType; days: number; label: string; publishedOn?: string; dueOn?: string }
export const reviewCheckpoints: ReviewCheckpoint[];
export const nonPromotionReviewStart: string;
export const shanghaiDateKey: (value: Date) => string;
export const addDays: (dateKey: string, days: number) => string;
export const checkpointsForPublishDate: (actualPublishAt: Date) => ReviewCheckpoint[];
export const nextReviewCheckpoint: (actualPublishAt: Date, completedTypes: ReviewCheckpointType[], todayKey: string) => ReviewCheckpoint | null;
export const percentage: (numerator: number, denominator: number) => number | null;
export const summarizeRates: (values: number[]) => { count: number; mean: number | null; min: number | null; max: number | null; median: number | null };
