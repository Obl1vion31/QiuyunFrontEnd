import {eq} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from './client';
import {operationsMonthlyPrivate as privateTable,operationsMonthlyCostMapping as mappingTable} from './schema';
import {demandTypes,demandLabels,emptyCounts,type DemandType,type PrivateData} from './monthly-plan-types';
import {WorkflowError} from './schedule-workflow';
import {readTaxonomy} from './taxonomy-store';
import {lockPromotionWorkflow} from './promotion-pauses';
import {isSourcePrivateData,sourceCountsProjection,sourcePromotionRows,privateUnitCosts} from './monthly-private-sources';
import type {StoredPrivateData} from './monthly-plan-types';

export const monthSchema=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const counts=z.object({added:z.number().int().nonnegative().nullable(),consulted:z.number().int().nonnegative().nullable(),converted:z.number().int().nonnegative().nullable()}).strict();
const sourceDataInput=z.object({schemaVersion:z.literal(2),promotion:z.array(counts.extend({subjectId:z.string(),demand:z.enum(demandTypes)})).max(200),nonPromotion:z.array(counts.extend({id:z.uuid(),subjectId:z.string(),source:z.string().trim().min(1).max(160)})).max(200),note:z.string().max(2000)}).strict();
const legacyDataInput=z.object({total:counts,rows:z.array(counts.extend({subjectId:z.string(),demand:z.enum(['total',...demandTypes])})).max(200),note:z.string().max(2000)}).strict();
export const privateInput=z.object({month:monthSchema,expectedRevision:z.number().int().min(-1),data:z.union([sourceDataInput,legacyDataInput])}).strict();
export const mappingInput=z.object({expectedRevision:z.number().int().min(-1),entries:z.record(z.string(),z.enum(demandTypes).nullable())}).strict();
const defaultDemand=(id:string):DemandType|null=>['small-class-or-tutoring','large-class','intensive-course','interview-course'].includes(id)?'course':['promotional-handout','non-promotional-handout'].includes(id)?'handout':id==='mock-exam'?'mock':null;
export async function readCostMapping(db:Database){
 const [row]=await db.select().from(mappingTable).where(eq(mappingTable.id,'global'));const taxonomy=await readTaxonomy(db);
 const entries=Object.fromEntries(taxonomy.subjectCategoryMappings.map(m=>{const key=`${m.subjectId}:${m.categoryId}`;return [key,row&&key in row.entries?row.entries[key]:defaultDemand(m.categoryId)];}));
 return {entries,revision:row?.revision??-1,taxonomy,updatedAt:row?.updatedAt.toISOString()??null};
}
export async function savePrivate(db:Database,input:z.infer<typeof privateInput>,actor:string){
 return db.transaction(async tx=>{await lockPromotionWorkflow(tx);const taxonomy=await readTaxonomy(tx);const keys=new Set<string>();
  const incoming=input.data;
  const source=isSourcePrivateData(incoming);
  const promotionRows=isSourcePrivateData(incoming)?incoming.promotion:incoming.rows;
  for(const row of promotionRows){const key=`${row.subjectId}:${row.demand}`;if(keys.has(key)||!taxonomy.subjects.some(s=>s.id===row.subjectId))throw new WorkflowError('学科明细重复或已失效，请核对。',422);keys.add(key);}
  if(isSourcePrivateData(incoming)){const ids=new Set<string>(),names=new Set<string>();for(const row of incoming.nonPromotion){const name=`${row.subjectId}:${row.source.trim()}`;if(ids.has(row.id)||names.has(name)||!taxonomy.subjects.some(s=>s.id===row.subjectId))throw new WorkflowError('来源名称重复或学科已失效，请核对。',422);ids.add(row.id);names.add(name);}}
  const [old]=await tx.select().from(privateTable).where(eq(privateTable.month,input.month)).for('update');
  if(old&&isSourcePrivateData(old.data)&&!source)throw new WorkflowError('私域录入方式已更新，请刷新后继续；当前输入请先保留。',409);
  const data:StoredPrivateData=isSourcePrivateData(incoming)?incoming:{...incoming,rows:incoming.rows.filter(r=>[r.added,r.consulted,r.converted].some(v=>v!==null))};
  const history=[...(old?.history??[])];
  if(source&&old&&!isSourcePrivateData(old.data)&&!history.length)history.push({at:old.updatedAt.toISOString(),actor:old.updatedBy,data:old.data});
  const values={data,revision:(old?.revision??-1)+1,updatedAt:new Date(),updatedBy:actor,history:[...history,{at:new Date().toISOString(),actor,data}]};
  if(old)await tx.update(privateTable).set(values).where(eq(privateTable.month,input.month));else await tx.insert(privateTable).values({month:input.month,...values});return values;
 });
}
export async function saveCostMapping(db:Database,input:z.infer<typeof mappingInput>,actor:string){
 return db.transaction(async tx=>{await lockPromotionWorkflow(tx);const existing=await readCostMapping(tx),valid=new Set(existing.taxonomy.subjectCategoryMappings.map(m=>`${m.subjectId}:${m.categoryId}`));
  if(Object.keys(input.entries).some(key=>!valid.has(key)))throw new WorkflowError('费用分类已变化，请重新核对。',422);
  const [old]=await tx.select().from(mappingTable).where(eq(mappingTable.id,'global')).for('update');
  const values={entries:input.entries,revision:(old?.revision??-1)+1,updatedAt:new Date(),updatedBy:actor,history:[...(old?.history??[]),{at:new Date().toISOString(),actor,entries:input.entries}]};
  if(old)await tx.update(mappingTable).set(values).where(eq(mappingTable.id,'global'));else await tx.insert(mappingTable).values({id:'global',...values});return values;
 });
}
export const privateCosts=privateUnitCosts;
export async function readMonthlyPrivate(db:Database,base:{query:{month:string;subject:string};taxonomy:Awaited<ReturnType<typeof readTaxonomy>>;categories:Array<{key:string;subjectId:string;spend:number|null}>;spend:{spend:number|null};promotionScope?:Array<{subjectId:string;categoryId:string|null}>},includeSources=false){
 const [row]=await db.select({data:privateTable.data,revision:privateTable.revision,updatedAt:privateTable.updatedAt,updatedBy:privateTable.updatedBy}).from(privateTable).where(eq(privateTable.month,base.query.month));const mapping=await readCostMapping(db);
 const stored=row?.data??{total:emptyCounts(),rows:[],note:''};
 const sourceData=isSourcePrivateData(stored)?stored:null;
 const promotionScope=base.categories.flatMap(c=>{const demand=mapping.entries[c.key];return demand?[{subjectId:c.subjectId,demand}]:[];});
 const sourceRows=sourceData?sourcePromotionRows(sourceData,promotionScope):[];
 const data:PrivateData=sourceData?sourceCountsProjection({...sourceData,promotion:sourceRows}):stored as PrivateData;
 const scope=base.promotionScope??base.categories.map(c=>({subjectId:c.subjectId,categoryId:c.key.split(':')[1]}));
 const activeSubjects=new Set([...scope.map(s=>s.subjectId),...data.rows.map(r=>r.subjectId)]);
 const subjects=base.taxonomy.subjects.filter(s=>activeSubjects.has(s.id)&&(!base.query.subject||s.id===base.query.subject)).map(subject=>{
  const categories=base.categories.filter(c=>c.subjectId===subject.id);const spend=categories.some(c=>c.spend!==null)?categories.reduce((n,c)=>n+(c.spend??0),0):null;
  const total=data.rows.find(r=>r.subjectId===subject.id&&r.demand==='total')??emptyCounts();
  const unmapped=categories.filter(c=>!mapping.entries[c.key]).reduce((n,c)=>n+(c.spend??0),0);
  const demands=demandTypes.filter(d=>(sourceData?promotionScope.some(s=>s.subjectId===subject.id&&s.demand===d):scope.some(s=>s.subjectId===subject.id&&mapping.entries[`${s.subjectId}:${s.categoryId}`]===d))||data.rows.some(r=>r.subjectId===subject.id&&r.demand===d)).map(demand=>{const groups=categories.filter(c=>mapping.entries[c.key]===demand);const amount=groups.some(c=>c.spend!==null)?groups.reduce((n,c)=>n+(c.spend??0),0):null;const value=data.rows.find(r=>r.subjectId===subject.id&&r.demand===demand)??emptyCounts();return {demand,label:demandLabels[demand],spend:amount,counts:value,costs:privateCosts(sourceData&&unmapped>0?null:amount,value)};});
  return {id:subject.id,name:subject.name,spend,counts:total,costs:privateCosts(sourceData&&unmapped>0?null:spend,total),demands,unmapped};
 });
 const active=data.rows.filter(r=>[r.added,r.consulted,r.converted].some(v=>v!==null));const values=[...Object.values(data.total),...active.flatMap(r=>[r.added,r.consulted,r.converted]),...(sourceData?.nonPromotion??[]).flatMap(r=>[r.added,r.consulted,r.converted])];
 const completeSubjects=subjects.every(s=>[s.counts,...s.demands.map(d=>d.counts)].every(v=>Object.values(v).filter(n=>typeof n!=='string').every(n=>n!==null)));
 const status=!values.some(v=>v!==null)?'missing':values.every(v=>v!==null)&&completeSubjects?'complete':'partial';
 const unmapped=subjects.reduce((n,s)=>n+s.unmapped,0),totalSpend=base.spend.spend;
 const catalog=includeSources?await db.select({data:privateTable.data}).from(privateTable).orderBy(privateTable.updatedAt):[];
 const sourceOptions=[...new Map(catalog.flatMap(r=>isSourcePrivateData(r.data)?r.data.nonPromotion.map(({id,subjectId,source})=>[id,{id,subjectId,source}] as const):[])).values()];
 return {data,sourceData:sourceData?{...sourceData,promotion:sourceRows}:null,sourceOptions,subjectNames:Object.fromEntries(base.taxonomy.subjects.map(s=>[s.id,s.name])),totalSpend,revision:row?.revision??-1,updatedAt:row?.updatedAt.toISOString()??null,updatedBy:row?.updatedBy??null,status,totalCosts:privateUnitCosts(sourceData&&unmapped>0?null:totalSpend,data.total),subjects,unmapped,mappingRevision:mapping.revision};
}
