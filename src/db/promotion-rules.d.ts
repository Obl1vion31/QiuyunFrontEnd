export const promotionReviewDecisions: Record<'testing' | 'scaling', string[]>;
export const shanghaiDateKey: (date: Date) => string;
export const nextDateKey: (dateKey: string) => string;
export const isDecisionAllowed: (stage: string, decision: string) => boolean;
export const nextPromotionState: (
  stage: string,
  decision: string,
) => { status: string; stage: string | null; outcome: string } | null;
export const calculatePromotionCosts: (input: {
  spend: number;
  platformOpenCount: number;
  actualOpenCount: number;
  platformLeadCount: number;
  actualLeadCount: number;
}) => {
  platformOpenCost: number | null;
  actualOpenCost: number | null;
  platformLeadCost: number | null;
  actualLeadCost: number | null;
};
