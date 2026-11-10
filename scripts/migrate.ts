import {loadMaintenanceEnvironment} from './development/environment';
import {ensureDevelopmentTunnel} from './development/tunnel';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { createDatabase } from '../src/db/client';
const url=loadMaintenanceEnvironment();
if(process.env.APP_ENV==='development')await ensureDevelopmentTunnel(url);
const database = createDatabase(url);
try { await migrate(database.db, { migrationsFolder: './drizzle' }); console.log('数据库迁移完成。'); }
finally { await database.close(); }
