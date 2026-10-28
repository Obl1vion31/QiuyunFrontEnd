/** 登录标识的边界校验与数据库约束错误翻译。 */
import { z } from 'zod';
import { WorkflowError } from '../db/schedule-workflow';
export const accountIdentifier = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,30}$/, '账号须为 3–30 位英文字母、数字或下划线。');
export const accountName = z.string().trim().min(1, '请填写用户名。').max(40, '用户名最多 40 个字符。');
export const accountPassword = z.string().min(6, '密码至少 6 个字符。').max(128, '密码最多 128 个字符。');
export function accountConflict(error: unknown): WorkflowError | undefined {
 const e=error as {code?:string;constraint?:string;constraint_name?:string;cause?:unknown};
 if(e?.code==='23505' && /auth_user_(?:name_key|username_key|login_identifier)/.test(e.constraint??e.constraint_name??''))return new WorkflowError('账号或用户名已被使用，请换一个。',409);
 return e?.cause?accountConflict(e.cause):undefined;
}
