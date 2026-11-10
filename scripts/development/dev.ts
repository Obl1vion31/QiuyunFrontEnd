import { spawn } from 'node:child_process';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import {createServer} from 'node:net';
import { loadDevelopmentEnvironment } from './environment';
import { ensureDevelopmentTunnel } from './tunnel';
try {
  config({ path: resolve('.env'), quiet: true });
  const url = loadDevelopmentEnvironment();
  const built=process.argv.includes('--built'),args=process.argv.slice(2).filter(value=>value!=='--built'),portFlag=args.indexOf('--port');
  const explicitPort=portFlag>=0?args[portFlag+1]:args.find(value=>value.startsWith('--port='))?.slice(7);
  const authURL=new URL(process.env.BETTER_AUTH_URL!);
  if(explicitPort){if(!/^\d+$/.test(explicitPort))throw new Error('开发网站端口配置不正确。');authURL.port=explicitPort;}
  const port=Number(authURL.port||80);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('开发网站端口配置不正确。');
  process.env.BETTER_AUTH_URL=authURL.origin;
  // Astro自动换端口会与登录地址不一致；已有服务时明确停止。
  await new Promise<void>((accept,reject)=>{
    const probe=createServer();probe.once('error',()=>reject(new Error(`本机 ${port} 端口已有服务；请先停止旧开发进程，或显式指定 --port。`)));
    probe.listen(port,'127.0.0.1',()=>probe.close(()=>accept()));
  });
  await ensureDevelopmentTunnel(url);
  console.log('开发连接已确认：上海 qiuyun_dev；仅使用开发账号。');
  const child = spawn(process.execPath, built?['dist/server/entry.mjs']:['node_modules/astro/astro.js', 'dev', ...args,...(!explicitPort?['--port',String(port)]:[])], { stdio: 'inherit', env: { ...process.env, ...(built?{HOST:'127.0.0.1',PORT:String(port),NODE_ENV:'production'}:{}), ASTRO_TELEMETRY_DISABLED: '1' } });
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => child.kill(signal));
  child.on('exit', code => { process.exitCode = code ?? 1; });
} catch (error) { console.error(error instanceof Error ? error.message : '开发环境启动失败。'); process.exitCode = 1; }
