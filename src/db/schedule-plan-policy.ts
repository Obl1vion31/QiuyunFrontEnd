import {weekOf} from './monthly-plan-types';

export function scheduleReasonRequired(sealed:boolean, originalMonth:string|null, originalWeek:number|null, nextDate:string){
 if(sealed)return '月排期 V0 已定稿，请填写本次调整原因。';
 if(originalMonth&&originalWeek&&nextDate&&(nextDate.slice(0,7)!==originalMonth||weekOf(nextDate)!==originalWeek))return '跨原计划 Week 调整，请填写原因。';
 return null;
}
