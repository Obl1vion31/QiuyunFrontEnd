import {asc,eq,sql,type SQLWrapper} from 'drizzle-orm';
import {z} from 'zod';
import type {Database} from './client';
import {requireAdmin,type OperationsUser} from '../auth/permissions';
import {WorkflowError,StaleWriteError} from './schedule-workflow';
import {operationTypes} from './operation-types';
import {initialContentConfiguration} from './content-config-values';
import {operationsContentConfig as configs,operationsSubject as subjects,operationsCategory as categories,operationsSubjectCategory as mappings,operationsMonthlyCostMapping as legacyMapping} from './schema';

const name=z.string().trim().min(1,'请填写名称。').max(80,'名称最多80字。');
const id=z.string().min(1).max(100);
export const contentConfigurationInput=z.object({
 subjectId:id,expectedRevision:z.number().int().min(-1),
 config:z.object({purposes:z.array(z.object({id,name}).strict()).min(1).max(100),types:z.array(z.object({id,name,defaultOperationType:z.enum(operationTypes),purposeId:id.nullable()}).strict()).min(1).max(300)}).strict(),
}).strict();
export async function readContentConfigurations(db:Database) {
 const [subjectRows,categoryRows,mappingRows,rows,legacy]=await Promise.all([db.select().from(subjects).orderBy(asc(subjects.sortOrder),asc(subjects.name)),db.select().from(categories).orderBy(asc(categories.sortOrder),asc(categories.name)),db.select().from(mappings),db.select({subjectId:configs.subjectId,config:configs.config,revision:configs.revision,updatedAt:configs.updatedAt}).from(configs),db.select({entries:legacyMapping.entries}).from(legacyMapping).where(eq(legacyMapping.id,'global'))]);
 return {subjects:subjectRows,postCategories:categoryRows,subjectCategoryMappings:mappingRows,configurations:subjectRows.map(subject=>{
  const row=rows.find(r=>r.subjectId===subject.id);
  return {subjectId:subject.id,revision:row?.revision??-1,config:row?.config??initialContentConfiguration(subject.id,categoryRows,mappingRows,legacy[0]?.entries),updatedAt:row?.updatedAt.toISOString()??null};
 })};
}
/** SQL读取与表单字典共用同一份按学科配置；冻结JSON从不调用此入口重写。 */
export const effectiveCategoryName=(subject:SQLWrapper,category:SQLWrapper,fallback:SQLWrapper)=>sql<string>`coalesce((select t.value->>'name' from operations_content_config c cross join lateral jsonb_array_elements(c.config->'types') t(value) where c.subject_id=${subject} and t.value->>'id'=${category}),${fallback})`;

export async function saveContentConfiguration(db:Database,input:z.infer<typeof contentConfigurationInput>,actor:OperationsUser) {
 requireAdmin(actor);
 return db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(739214503)`);
  const current=await readContentConfigurations(tx),existing=current.configurations.find(c=>c.subjectId===input.subjectId);
  if(!existing)throw new WorkflowError('学科不存在，请重新选择。',422);
  if(existing.revision!==input.expectedRevision)throw new StaleWriteError('此学科配置已更新，请重新载入后核对；当前输入已保留。');
  const {config}=input,unique=(rows:Array<{id:string;name:string}>)=>new Set(rows.map(r=>r.id)).size===rows.length&&new Set(rows.map(r=>r.name.toLocaleLowerCase())).size===rows.length;
  if(!unique(config.types)||!unique(config.purposes))throw new WorkflowError('同一学科内的名称或标识不能重复。',422);
  const purposeIds=new Set(config.purposes.map(p=>p.id));
  if(config.types.some(t=>t.purposeId&&!purposeIds.has(t.purposeId)))throw new WorkflowError('请选择本学科的有效推广用途。',422);
  if(existing.config.types.some(t=>!config.types.some(n=>n.id===t.id))||existing.config.purposes.some(p=>!purposeIds.has(p.id)))throw new WorkflowError('已有类型和用途需保留身份，请使用改名或调整归属。',422);
  for(const type of config.types.filter(t=>!existing.config.types.some(old=>old.id===t.id))){
   if(!type.id.startsWith('category-')||!z.uuid().safeParse(type.id.slice(9)).success)throw new WorkflowError('新增类型标识无效，请重新打开表单。',422);
   const global=current.postCategories.find(c=>c.id===type.id);
   if(global)throw new WorkflowError('新增类型标识已被使用。',409);
   // 全局基表保留稳定身份；显示名称由学科配置提供，不受全局唯一名称约束。
   await tx.insert(categories).values({id:type.id,name:type.name+' · '+type.id.slice(9),sortOrder:0});
   await tx.insert(mappings).values({subjectId:input.subjectId,categoryId:type.id});
  }
  for(const purpose of config.purposes.filter(p=>!existing.config.purposes.some(old=>old.id===p.id)))if(!z.uuid().safeParse(purpose.id).success)throw new WorkflowError('新增用途标识无效，请重新打开表单。',422);
  const [old]=await tx.select().from(configs).where(eq(configs.subjectId,input.subjectId)).for('update');
  const now=new Date(),revision=existing.revision+1;
  const event={at:now.toISOString(),actorId:actor.id,actor:actor.username,before:existing.config,config};
  const values={config,revision,updatedAt:now,updatedById:actor.id,updatedBy:actor.username,history:[...(old?.history??[]),event]};
  if(old)await tx.update(configs).set(values).where(eq(configs.subjectId,input.subjectId));else await tx.insert(configs).values({subjectId:input.subjectId,...values});
  return {subjectId:input.subjectId,config,revision,updatedAt:now.toISOString()};
 });
}
