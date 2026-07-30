export const promotionReviewDecisions: Record<'testing' | 'scaling', string[]>;
export const shanghaiDateKey: (date: Date) => string;
export const nextDateKey: (dateKey: string) => string;
export const inclusivePromotionDays: (startedOn: string, endedOn: string) => number;
export const promotionStageShares: (days: number[]) => number[];
export const isDecisionAllowed: (stage: string, decision: string) => boolean;
export const nextPromotionState: (
  stage: string,
  decision: string,
) => { status: string; stage: string | null; outcome: string } | null;
export const calculateActualPromotionCosts: (input: {
  spend: number;
  actualOpenCount: number;
  actualLeadCount: number;
}) => {
  actualOpenCost: number | null;
  actualLeadCost: number | null;
};
