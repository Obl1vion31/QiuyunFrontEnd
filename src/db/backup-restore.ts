import {createHash} from 'node:crypto';
import {sql} from 'drizzle-orm';
import type {createDatabase} from './client';
type RestoreDatabase=ReturnType<typeof createDatabase>['db'];
export interface PrivateBackup{format:number;createdAt:string;tables:Record<string,{rows:string[];digest:string}>}
/** 只恢复到已建立对应结构的空库；整次写入失败则回滚。 */
export async function restorePrivateBackup(db:RestoreDatabase,backup:PrivateBackup,apply=false){
 if(backup.format!==1||!backup.tables||!Object.keys(backup.tables).length)throw new Error('不支持的备份格式');
 for(const [name,table] of Object.entries(backup.tables)){
  if(!/^[a-z_][a-z0-9_]*$/.test(name)||!Array.isArray(table.rows)||createHash('sha256').update([...table.rows].sort().join('\n')).digest('hex')!==table.digest)throw new Error('备份校验失败：'+name);
 }
 return db.transaction(async tx=>{
  const names=await tx.execute<{table_name:string}>(sql`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`);
  const known=new Set(names.map(row=>row.table_name));for(const name of Object.keys(backup.tables))if(!known.has(name))throw new Error('目标缺少对应结构：'+name);
  if(apply)for(const name of [...known].sort())await tx.execute(sql`lock table ${sql.identifier(name)} in access exclusive mode`);
  for(const name of known){const [count]=await tx.execute<{count:string}>(sql`select count(*)::text as count from ${sql.identifier(name)}`);if(Number(count.count))throw new Error('恢复目标必须为空库：'+name);}
  const dependencies=await tx.execute<{child:string;parent:string}>(sql`select child.relname as child,parent.relname as parent from pg_constraint c join pg_class child on child.oid=c.conrelid join pg_class parent on parent.oid=c.confrelid join pg_namespace n on n.oid=child.relnamespace where c.contype='f' and n.nspname='public'`);
  const remaining=new Set(Object.keys(backup.tables)),ordered:string[]=[];
  while(remaining.size){const ready=[...remaining].filter(name=>!dependencies.some(row=>row.child===name&&row.parent!==name&&remaining.has(row.parent))).sort();if(!ready.length)throw new Error('目标存在需要单独处理的循环外键');for(const name of ready){ordered.push(name);remaining.delete(name);}}
  if(apply){
   for(const name of ordered){const rows=backup.tables[name].rows;if(rows.length)await tx.execute(sql`insert into ${sql.identifier(name)} select * from json_populate_recordset(null::${sql.identifier(name)},${'['+rows.join(',')+']'}::json)`);}
   const sequences=await tx.execute<{table_name:string;column_name:string;sequence:string|null}>(sql`select table_name,column_name,pg_get_serial_sequence(quote_ident(table_schema)||'.'||quote_ident(table_name),column_name) as sequence from information_schema.columns where table_schema='public' and column_default like 'nextval(%'`);
   for(const row of sequences)if(row.sequence){const [value]=await tx.execute<{value:string|null}>(sql`select max(${sql.identifier(row.column_name)})::text as value from ${sql.identifier(row.table_name)}`);if(value.value)await tx.execute(sql`select setval(${row.sequence}::regclass,${value.value}::bigint,true)`);}
  }
  return {applied:apply,tables:ordered.length,rows:Object.values(backup.tables).reduce((sum,table)=>sum+table.rows.length,0)};
 });
}
