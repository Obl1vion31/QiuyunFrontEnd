import {defaultOperationType,type OperationType} from './operation-types';

export type PromotionPurpose={id:string;name:string};
export type ContentTypeConfig={id:string;name:string;defaultOperationType:OperationType;purposeId:string|null};
export type ContentConfiguration={purposes:PromotionPurpose[];types:ContentTypeConfig[]};
export const initialPurposes:PromotionPurpose[]=[{id:'course',name:'课程'},{id:'handout',name:'讲义'},{id:'mock',name:'模考'}];
export function defaultPromotionPurpose(id:string):string|null {
 if(['small-class-or-tutoring','large-class','intensive-course','interview-course'].includes(id))return 'course';
 if(['promotional-handout','non-promotional-handout'].includes(id))return 'handout';
 return id==='mock-exam'?'mock':null;
}
export function initialContentConfiguration(subjectId:string,categories:ReadonlyArray<{id:string;name:string}>,mappings:ReadonlyArray<{subjectId:string;categoryId:string}>,legacy:Record<string,string|null>={}):ContentConfiguration {
 return {purposes:structuredClone(initialPurposes),types:categories.filter(c=>mappings.some(m=>m.subjectId===subjectId&&m.categoryId===c.id)).map(c=>{
  const key=subjectId+':'+c.id;
  return {id:c.id,name:c.name,defaultOperationType:defaultOperationType(c.id),purposeId:key in legacy?legacy[key]:defaultPromotionPurpose(c.id)};
 })};
}
