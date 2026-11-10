/** 数据库连接的环境边界；在创建连接前检查，不把连接串带入错误信息。 */
export type DatabaseEnvironment = Record<string, string | undefined>;
export type DatabasePurpose = 'application' | 'maintenance';
export const developmentDatabase = { name: 'qiuyun_dev', port: '15432', app: 'qiuyun_dev_app', migrator: 'qiuyun_dev_migrator' } as const;

export function databaseIdentity(value: string) {
  const target = new URL(value);
  return `${target.hostname.toLowerCase().replace('-pooler.', '.')}:${target.port || '5432'}${target.pathname}`;
}

export function validateDatabaseTarget(value: string | undefined, env: DatabaseEnvironment, purpose: DatabasePurpose = 'application') {
  if (!value) throw new Error('缺少 DATABASE_URL；开发环境不会回退到正式数据库。');
  let target: URL;
  try { target = new URL(value); } catch { throw new Error('数据库连接配置格式不正确。'); }
  if (!['postgres:', 'postgresql:'].includes(target.protocol)) throw new Error('数据库连接必须使用 PostgreSQL。');
  if (env.NODE_ENV === 'test') {
    const isolated=target.pathname.startsWith('/qiuyun_test_')||(target.pathname==='/postgres'&&!['5432','15432',''].includes(target.port));
    if (!['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) || !isolated) throw new Error('自动测试只允许显式的本机隔离库。');
  } else if (env.APP_ENV === 'development') {
    const role = purpose === 'maintenance' ? developmentDatabase.migrator : developmentDatabase.app;
    if (target.hostname !== '127.0.0.1' || target.port !== developmentDatabase.port || target.pathname !== '/' + developmentDatabase.name || decodeURIComponent(target.username) !== role || !target.password) {
      throw new Error('开发连接被拦截：只允许通过本机 15432 通道连接 qiuyun_dev，并使用对应的开发账号。');
    }
  } else if (env.VERCEL_ENV !== 'production' && env.APP_ENV !== 'production') {
    throw new Error('缺少明确的数据库环境；请先配置 APP_ENV=development。');
  }
  return value;
}
