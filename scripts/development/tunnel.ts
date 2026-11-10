import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { privateDevelopmentDirectory } from './environment';

interface TunnelConfiguration { host: string; user: string; identityFile: string; knownHostsFile: string; }
export async function checkDevelopmentConnection(url: string) {
  const client = postgres(url, { max: 1, connect_timeout: 15, idle_timeout: 2, prepare: false });
  try {
    const [row] = await client`select current_database() as database, current_user as role`;
    const target = new URL(url);
    if (row.database !== 'qiuyun_dev' || row.role !== decodeURIComponent(target.username)) throw new Error('开发数据库身份不符。');
  } finally { await client.end({ timeout: 2 }); }
}

export async function ensureDevelopmentTunnel(url: string) {
  try { await checkDevelopmentConnection(url); return; } catch { /* 通道可能尚未启动；创建后仍核对实际身份。 */ }
  const config = JSON.parse(readFileSync(resolve(privateDevelopmentDirectory(), 'development-tunnel.json'), 'utf8')) as TunnelConfiguration;
  const socket = resolve(privateDevelopmentDirectory(), '../qiuyun-dev-ssh.sock');
  if (existsSync(socket)) {
    let live = false;
    try { execFileSync('ssh', ['-S', socket, '-O', 'check', config.user + '@' + config.host], { stdio: 'ignore', timeout: 3000 }); live = true; } catch { /* WSL 重启可能留下失效的控制文件。 */ }
    if (live) throw new Error('已有开发通道，但数据库检查失败；请检查网络后重试，不会连接 Neon。');
    unlinkSync(socket);
  }
  try {
    execFileSync('ssh', ['-f', '-N', '-C', '-M', '-S', socket, '-i', config.identityFile, '-o', 'IPQoS=none', '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'UserKnownHostsFile=' + config.knownHostsFile,
      '-o', 'ExitOnForwardFailure=yes', '-o', 'ConnectTimeout=8', '-o', 'ServerAliveInterval=20', '-o', 'ServerAliveCountMax=3',
      '-L', '127.0.0.1:15432:127.0.0.1:5432', config.user + '@' + config.host], { stdio: 'ignore', timeout: 15000 });
    await checkDevelopmentConnection(url);
  } catch { throw new Error('开发通道不可用或数据库身份验证失败；已停止，不会连接 Neon。请核对 SSH 登录及本机 15432 端口。'); }
}
