export interface PlanBlockRange { startSlot: number; endSlot: number }
export interface PlanBlock extends PlanBlockRange { label: string; note: string; promotionRanges: PlanBlockRange[]; sortOrder: number }
export interface LegacyBlock { startMonth: number; endMonth: number; label: string; note: string | null; ruleType: 'flexible' | 'fixed' | null; monthlyFrequency: number | null; quantityParts: number[] | null; sortOrder: number }
export function overlappingBlockPairs(blocks: PlanBlockRange[]): Array<[number, number]>;
export function coverageSpans(slots: Set<number>): PlanBlockRange[];
export function formatSlotRange(range: PlanBlockRange): string;
export function legacyBlockNote(block: LegacyBlock): string;
export function normalizeBlock(block: Partial<Omit<LegacyBlock & PlanBlock, 'note' | 'ruleType' | 'startSlot' | 'endSlot' | 'promotionRanges'>> & { note?: string | null; ruleType?: string | null; startSlot?: number | null; endSlot?: number | null; promotionRanges?: PlanBlockRange[] | null }, promoted?: boolean): PlanBlock;
export function normalizeSnapshot(snapshot: import('./schema').AnnualPlanSnapshot): import('./schema').AnnualPlanSnapshotV4;
export function splitBlockSegments(block: PlanBlockRange & { promotionRanges: PlanBlockRange[] }): Array<PlanBlockRange & { paid: boolean }>;
export function blockBackground(block: PlanBlockRange & { promotionRanges: PlanBlockRange[] }): string;
export function blockPromotionLabel(block: PlanBlockRange & { promotionRanges: PlanBlockRange[] }): string;
export function deriveAnnualSummary(rows: Array<{ isActive: boolean; blocks: PlanBlock[] }>): { postingSpans: Array<PlanBlockRange & { promotionRanges: PlanBlockRange[] }>; promotionSpans: PlanBlockRange[] };
