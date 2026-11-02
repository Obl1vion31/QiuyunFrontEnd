export const operationTypes=['promotion_only','promotion_then_continuous','non_promotion_standard','non_promotion_instant'] as const;
export type OperationType=typeof operationTypes[number];
export const operationTypeLabels:Record<OperationType,string>={promotion_only:'纯推广',promotion_then_continuous:'推广后持续复盘',non_promotion_standard:'非推广常规',non_promotion_instant:'非推广即时'};
export const isPromotionType=(type:OperationType)=>type==='promotion_only'||type==='promotion_then_continuous';
export const operationMode=(type:OperationType):'standard'|'instant'|'continuous'=>type==='non_promotion_standard'?'standard':type==='non_promotion_instant'?'instant':'continuous';
