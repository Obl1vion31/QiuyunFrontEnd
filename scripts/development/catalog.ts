import type postgres from 'postgres';
/** 结构核对不读取业务行、所有者或实例特有对象编号。 */
export async function developmentCatalog(client: postgres.Sql) {
  const schemas=['public','drizzle'];
  return {
    // 历史删列留下的物理编号空洞不会进入逻辑导出；比较现存列的相对顺序。
    columns:await client`select table_schema,table_name,column_name,(row_number() over(partition by table_schema,table_name order by ordinal_position))::int as ordinal_position,data_type,udt_schema,udt_name,is_nullable,column_default,is_identity,is_generated,generation_expression,collation_name from information_schema.columns where table_schema in ${client(schemas)} order by table_schema,table_name,ordinal_position`,
    constraints:await client`select n.nspname as schema,c.relname as table_name,k.conname as name,pg_get_constraintdef(k.oid,true) as definition from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${client(schemas)} order by 1,2,3`,
    indexes:await client`select schemaname,tablename,indexname,indexdef from pg_indexes where schemaname in ${client(schemas)} order by 1,2,3`,
    functions:await client`select n.nspname as schema,p.proname as name,pg_get_functiondef(p.oid) as definition from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ${client(schemas)} and p.prokind='f' order by 1,2,3`,
    triggers:await client`select n.nspname as schema,c.relname as table_name,t.tgname as name,pg_get_triggerdef(t.oid,true) as definition from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname in ${client(schemas)} and not t.tgisinternal order by 1,2,3`,
  };
}
