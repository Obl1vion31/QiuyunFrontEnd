export const demandTypes = ['course', 'handout', 'mock'] as const;
export type DemandType = typeof demandTypes[number];
export const demandLabels: Record<DemandType, string> = {course:'课程', handout:'讲义', mock:'模考'};
export type PrivateCounts = {added:number|null; consulted:number|null; converted:number|null};
export type PrivateRow = PrivateCounts & {subjectId:string; demand:DemandType|'total'};
export type PrivateData = {total:PrivateCounts; rows:PrivateRow[]; note:string};
export type PlanGroup = {id:string; annualPlanId:string|null; annualVersion:number|null; name:string; subjectId:string; categoryId:string; note:string; reason:string; quantity:number|null};
export type PlanItem = {id:string; groupId:string; week:number|null; kind:'new'|'carry'|'existing'; scheduleId:string|null};
export type PlanContent = {groups:PlanGroup[]; items:PlanItem[]};
export type PlanBatch = {id:string; at:string; actor:string; reason:string; content:PlanContent};
export type PlanAssignmentHistory = {phase?:'submitted'|'applied';at:string; actor:string; proposalId?:string; scheduleId?:string; reason:string};
export const emptyCounts = ():PrivateCounts => ({added:null, consulted:null, converted:null});
export function adjacentMonth(month:string, offset:number) {const date=new Date(`${month}-01T00:00:00Z`);date.setUTCMonth(date.getUTCMonth()+offset);return date.toISOString().slice(0,7);}
export function monthWeeks(month:string) {const end=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();return Array.from({length:Math.ceil(end/7)},(_,i)=>({week:i+1,from:`${month}-${String(i*7+1).padStart(2,'0')}`,through:`${month}-${String(Math.min(end,(i+1)*7)).padStart(2,'0')}`}));}
export const weekOf=(date:string)=>Math.ceil(Number(date.slice(8,10))/7);
