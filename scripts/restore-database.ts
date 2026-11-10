import {loadMaintenanceEnvironment} from './development/environment';
import {ensureDevelopmentTunnel} from './development/tunnel';
import {databaseIdentity,validateDatabaseTarget} from '../src/db/database-target';
import {readFile} from 'node:fs/promises';
import {resolve,sep} from 'node:path';
import {createDatabase} from '../src/db/client';
import {restorePrivateBackup,type PrivateBackup} from '../src/db/backup-restore';
loadMaintenanceEnvironment();
const target=process.env.RESTORE_DATABASE_URL;
if(!target)throw new Error('请单独指定隔离恢复目标 RESTORE_DATABASE_URL');
validateDatabaseTarget(target,process.env,'maintenance');
if(process.env.APP_ENV!=='development'&&process.env.DATABASE_URL&&databaseIdentity(target)===databaseIdentity(process.env.DATABASE_URL))throw new Error('不能将当前业务库用作恢复目标');
if(process.env.APP_ENV==='development')await ensureDevelopmentTunnel(target);
const input=process.argv.find(value=>value.endsWith('.json'));if(!input)throw new Error('请指定私有备份JSON');
const path=resolve(input),root=resolve('.tools/backups')+sep;if(!path.startsWith(root))throw new Error('只允许读取 .tools/backups 中的私有备份');
const backup=JSON.parse(await readFile(path,'utf8')) as PrivateBackup;
if(process.env.APP_ENV==='development'&&(backup as PrivateBackup&{environment?:string}).environment!=='development')throw new Error('开发恢复只接受明确标记为 development 的备份。');
const database=createDatabase(target);
try{console.log(await restorePrivateBackup(database.db,backup,process.argv.includes('--apply')));}finally{await database.close();}
