export const promotionActualLabels:Record<string,string>;
export const promotionSuccessors:Record<string,string[]>;
export const normalizePromotionActualStatus:(status:string,stage?:string|null)=>string;
export const promotionSuccessorOptions:(status:string)=>Array<{value:string;label:string}>;
export const promotionNextOptions:(status:string)=>Array<{value:string;label:string}>;
export const nextActualPromotionState:(status:string,decision:string)=>string|null;
export const promotionStatusStage:(status:string)=>string|null;
