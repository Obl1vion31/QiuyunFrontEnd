import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { config } from 'dotenv';
import { validateDatabaseTarget, type DatabasePurpose } from '../../src/db/database-target';

export function privateDevelopmentDirectory() {
  const common = execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim();
  return resolve(dirname(resolve(common)), '.tools/private');
}

export function loadDevelopmentEnvironment(purpose: DatabasePurpose = 'application') {
  const file = resolve(privateDevelopmentDirectory(), purpose === 'maintenance' ? 'development-maintenance.env' : 'development.env');
  if (!existsSync(file)) throw new Error('开发配置尚未准备好；请按数据库指南建立独立开发库。');
  // 显式环境优先，错误的外部 DATABASE_URL 必须被拦截，不能被配置文件掩盖。
  config({ path: file, quiet: true });
  process.env.APP_ENV ??= 'development';
  if (process.env.APP_ENV !== 'development') throw new Error('开发命令只允许 APP_ENV=development。');
  return validateDatabaseTarget(process.env.DATABASE_URL, process.env, purpose);
}

export function loadMaintenanceEnvironment() {
  if (process.argv.includes('--production')) {
    if (process.env.APP_ENV !== 'production') throw new Error('正式维护须显式提供 APP_ENV=production 和运行时连接；不会读取本机开发或旧正式配置。');
    return validateDatabaseTarget(process.env.DATABASE_URL, process.env, 'maintenance');
  }
  return loadDevelopmentEnvironment('maintenance');
}
