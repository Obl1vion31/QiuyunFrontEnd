import 'dotenv/config';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { createDatabase } from '../src/db/client';
import { provisionAccount } from '../src/auth/provision';
import type { Role } from '../src/auth/permissions';

if (!process.env.DATABASE_URL) throw new Error('请配置目标数据库 DATABASE_URL。');
const prompts = createInterface({ input: stdin, output: stdout });
const username = process.argv[2] || await prompts.question('账号名称：');
const role = (process.argv[3] || await prompts.question('角色（admin / employee）：')) as Role;
let password: string;
if (stdin.isTTY) {
  prompts.close(); stdout.write('账号密码（输入不显示）：');
  password = await new Promise<string>((resolve, reject) => {
    let value = '';
    stdin.setRawMode(true); stdin.resume();
    const finish = () => { stdin.setRawMode(false); stdin.off('data', receive); stdin.pause(); stdout.write('\n'); };
    const receive = (chunk: Buffer) => {
      for (const char of chunk.toString()) {
        if (char === '\r' || char === '\n') { finish(); resolve(value); return; }
        if (char === '\u0003') { finish(); reject(new Error('已取消账号创建。')); return; }
        if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
        else if (char >= ' ') value += char;
      }
    };
    stdin.on('data', receive);
  });
} else { password = await prompts.question('账号密码：'); prompts.close(); }
const database = createDatabase(process.env.DATABASE_URL);
try {
  const result = await provisionAccount(database.db, { username, role, password });
  console.log(result.created ? '账号已创建。' : '账号已存在，密码和角色保持不变。');
} finally { await database.close(); }
