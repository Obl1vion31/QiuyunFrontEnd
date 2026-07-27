export interface PlanBlockRange {
  startMonth: number;
  endMonth: number;
}

export function overlappingBlockPairs(blocks: PlanBlockRange[]): Array<[number, number]>;

export function formatBlockRule(block: PlanBlockRange & {
  ruleType: 'flexible' | 'fixed' | null;
  monthlyFrequency: number | null;
  quantityParts: number[] | null;
}): string;

export function coverageSpans(months: Set<number>): PlanBlockRange[];

export function deriveAnnualSummary(rows: Array<{
  isActive: boolean;
  countsTowardPromotion: boolean;
  blocks: PlanBlockRange[];
}>): {
  postingSpans: PlanBlockRange[];
  promotionSpans: PlanBlockRange[];
};
