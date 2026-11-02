import {eq} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from './client';
import {operationsMonthlyPrivate as privateTable,operationsMonthlyCostMapping as mappingTable} from './schema';
import {demandTypes,demandLabels,emptyCounts,type DemandType,type PrivateData,type PrivateCounts} from './monthly-plan-types';
import {WorkflowError} from './schedule-workflow';
import {readTaxonomy} from './taxonomy-store';
import {lockPromotionWorkflow} from './promotion-pauses';

export const monthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const counts=z.object({added:z.number().int().nonnegative().nullable(),consulted:z.number().int().nonnegative().nullable(),converted:z.number().int().nonnegative().nullable()}).strict();
export const privateInput=z.object({month:monthSchema,expectedRevision:z.number().int().min(-1),data:z.object({total:counts,rows:z.array(counts.extend({subjectId:z.string(),demand:z.enum(['total',...demandTypes])})).max(200),note:z.string().max(2000)}).strict()}).strict();
export const mappingInput=z.object({expectedRevision:z.number().int().min(-1),entries:z.record(z.string(),z.enum(demandTypes).nullable())}).strict();
const defaultDemand=(id:string):DemandType|null=>['small-class-or-tutoring','large-class','intensive-course','interview-course'].includes(id)?'course':['promotional-handout','non-promotional-handout'].includes(id)?'handout':id==='mock-exam'?'mock':null;
export async function readCostMapping(db:Database){
 const [row]=await db.select().from(mappingTable).where(eq(mappingTable.id,'global'));const taxonomy=await readTaxonomy(db);
 const entries=Object.fromEntries(taxonomy.subjectCategoryMappings.map(m=>{const key=`${m.subjectId}:${m.categoryId}`;return [key,row&&key in row.entries?row.entries[key]:defaultDemand(m.categoryId)];}));
 return {entries,revision:row?.revision??-1,taxonomy,updatedAt:row?.updatedAt.toISOString()??null};
}
export async function savePrivate(db:Database,input:z.infer<typeof privateInput>,actor:string){
 return db.transaction(async tx=>{await lockPromotionWorkflow(tx);const taxonomy=await readTaxonomy(tx);const keys=new Set<string>();
  for(const row of input.data.rows){const key=`${row.subjectId}:${row.demand}`;if(keys.has(key)||!taxonomy.subjects.some(s=>s.id===row.subjectId))throw new WorkflowError('学科明细重复或已失效，请核对。',422);keys.add(key);}
  const [old]=await tx.select().from(privateTable).where(eq(privateTable.month,input.month)).for('update');if((old?.revision??-1)!==input.expectedRevision)throw new WorkflowError('月度人数已被更新，输入已保留，请重新核对。',409);
  const data={...input.data,rows:input.data.rows.filter(r=>[r.added,r.consulted,r.converted].some(v=>v!==null))};
  const values={data,revision:(old?.revision??-1)+1,updatedAt:new Date(),updatedBy:actor,history:[...(old?.history??[]),{at:new Date().toISOString(),actor,data}]};
  if(old)await tx.update(privateTable).set(values).where(eq(privateTable.month,input.month));else await tx.insert(privateTable).values({month:input.month,...values});return values;
 });
}
export async function saveCostMapping(db:Database,input:z.infer<typeof mappingInput>,actor:string){
 return db.transaction(async tx=>{await lockPromotionWorkflow(tx);const existing=await readCostMapping(tx),valid=new Set(existing.taxonomy.subjectCategoryMappings.map(m=>`${m.subjectId}:${m.categoryId}`));
  if(Object.keys(input.entries).some(key=>!valid.has(key)))throw new WorkflowError('费用分类已变化，请重新核对。',422);
  const [old]=await tx.select().from(mappingTable).where(eq(mappingTable.id,'global')).for('update');if((old?.revision??-1)!==input.expectedRevision)throw new WorkflowError('费用映射已更新，请重新核对。',409);
  const values={entries:input.entries,revision:(old?.revision??-1)+1,updatedAt:new Date(),updatedBy:actor,history:[...(old?.history??[]),{at:new Date().toISOString(),actor,entries:input.entries}]};
  if(old)await tx.update(mappingTable).set(values).where(eq(mappingTable.id,'global'));else await tx.insert(mappingTable).values({id:'global',...values});return values;
 });
}
export function privateCosts(spend:number|null,value:PrivateCounts){return Object.fromEntries(['added','consulted','converted'].map(k=>[k,spend!=null&&value[k as keyof PrivateCounts]!=null&&value[k as keyof PrivateCounts]!>0?Math.round(spend/value[k as keyof PrivateCounts]!*100)/100:null])) as Record<keyof PrivateCounts,number|null>;}
export async function readMonthlyPrivate(db:Database,base:{query:{month:string;subject:string};taxonomy:Awaited<ReturnType<typeof readTaxonomy>>;categories:Array<{key:string;subjectId:string;spend:number|null}>;spend:{spend:number|null}}){
 const [row]=await db.select().from(privateTable).where(eq(privateTable.month,base.query.month));const mapping=await readCostMapping(db);
 const data:PrivateData=row?.data??{total:emptyCounts(),rows:[],note:''};
 const subjects=base.taxonomy.subjects.filter(s=>!base.query.subject||s.id===base.query.subject).map(subject=>{
  const categories=base.categories.filter(c=>c.subjectId===subject.id);const spend=categories.some(c=>c.spend!==null)?categories.reduce((n,c)=>n+(c.spend??0),0):null;
  const total=data.rows.find(r=>r.subjectId===subject.id&&r.demand==='total')??emptyCounts();
  const demands=demandTypes.map(demand=>{const groups=categories.filter(c=>mapping.entries[c.key]===demand);const amount=groups.some(c=>c.spend!==null)?groups.reduce((n,c)=>n+(c.spend??0),0):null;const value=data.rows.find(r=>r.subjectId===subject.id&&r.demand===demand)??emptyCounts();return {demand,label:demandLabels[demand],spend:amount,counts:value,costs:privateCosts(amount,value)};});
  return {id:subject.id,name:subject.name,spend,counts:total,costs:privateCosts(spend,total),demands,unmapped:categories.filter(c=>!mapping.entries[c.key]).reduce((n,c)=>n+(c.spend??0),0)};
 });
 const active=data.rows.filter(r=>[r.added,r.consulted,r.converted].some(v=>v!==null));const values=[...Object.values(data.total),...active.flatMap(r=>[r.added,r.consulted,r.converted])];
 const suppliedSubjects=new Set([...active.map(r=>r.subjectId),...base.categories.map(c=>c.subjectId)]);
 const completeSubjects=[...suppliedSubjects].every(id=>['total',...demandTypes].every(d=>data.rows.some(r=>r.subjectId===id&&r.demand===d&&[r.added,r.consulted,r.converted].every(v=>v!==null))));
 const status=!values.some(v=>v!==null)?'missing':values.every(v=>v!==null)&&suppliedSubjects.size>0&&completeSubjects?'complete':'partial';
 return {data,revision:row?.revision??-1,updatedAt:row?.updatedAt.toISOString()??null,updatedBy:row?.updatedBy??null,status,totalCosts:privateCosts(base.spend.spend,data.total),subjects,unmapped:subjects.reduce((n,s)=>n+s.unmapped,0),mappingRevision:mapping.revision};
}
