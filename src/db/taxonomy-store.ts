import {eq,sql} from 'drizzle-orm';
import {randomUUID} from 'node:crypto';
import type {Database} from './client';
import {operationsSubject as subjects,operationsCategory as categories,operationsSubjectCategory as mappings} from './schema';
import {createPostSchemas} from './validation';
import {WorkflowError} from './schedule-workflow';
import {readContentConfigurations} from './content-config';

export async function readTaxonomy(db:Database){
 const catalog=await readContentConfigurations(db);
 const subjectCategories=catalog.configurations.flatMap(c=>c.config.types.map((t,sortOrder)=>({...t,subjectId:c.subjectId,sortOrder})));
 return {...catalog,subjectCategories};
}
export async function readPostSchemas(db:Database){return createPostSchemas(await readTaxonomy(db));}
export async function appendTaxonomy(db:Database,input:{kind:'subject'|'category';name:string;subjectId?:string;id?:string}){
 return db.transaction(async tx=>{
  await tx.execute(sql`select pg_advisory_xact_lock(739214503)`);
  const name=input.name.trim();if(!name||name.length>80)throw new WorkflowError('请填写1至80字的名称。',422);
  if(input.kind==='category'&&(!input.subjectId||!(await tx.select().from(subjects).where(eq(subjects.id,input.subjectId))).length))throw new WorkflowError('请先选择有效学科。',422);
  const table=input.kind==='subject'?subjects:categories;
  let [item]=await tx.select().from(table).where(eq(table.name,name));const created=!item;
  if(!item){const rows=await tx.select().from(table);[item]=await tx.insert(table).values({id:input.id??`${input.kind}-${randomUUID()}`,name,sortOrder:Math.max(0,...rows.map(r=>r.sortOrder))+10}).returning();}
  await tx.insert(mappings).values(input.kind==='subject'?{subjectId:item.id,categoryId:'temporary'}:{subjectId:input.subjectId!,categoryId:item.id}).onConflictDoNothing();
  return {item,created,...await readTaxonomy(tx)};
 });
}
