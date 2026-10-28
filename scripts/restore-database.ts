import 'dotenv/config';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createDatabase} from '../src/db/client';
import {restorePrivateBackup,type PrivateBackup} from '../src/db/backup-restore';
const target=process.env.RESTORE_DATABASE_URL;
if(!target)throw new Error('请单独指定隔离恢复目标 RESTORE_DATABASE_URL');
const identity=(value:string)=>{const url=new URL(value);return `${url.hostname}${url.pathname}`;};
if(process.env.DATABASE_URL&&identity(target)===identity(process.env.DATABASE_URL))throw new Error('不能将当前业务库用作恢复目标');
const input=process.argv.find(value=>value.endsWith('.json'));if(!input)throw new Error('请指定私有备份JSON');
const path=resolve(input),root=resolve('.tools/backups')+sep;if(!path.startsWith(root))throw new Error('只允许读取 .tools/backups 中的私有备份');
const backup=JSON.parse(await readFile(path,'utf8')) as PrivateBackup,database=createDatabase(target);
try{console.log(await restorePrivateBackup(database.db,backup,process.argv.includes('--apply')));}finally{await database.close();}
