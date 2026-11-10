/** 服务端权限来源与业务危险操作边界；浏览器只使用可显示的角色。 */
import {isConfigurableBusinessWrite} from './business-capabilities';
export type Role = 'admin' | 'employee';
export interface OperationsUser { id: string; username: string; name?:string; role: Role }

export const isAdmin = (user: OperationsUser | null | undefined) => user?.role === 'admin';

export class AccessDenied extends Error {
  constructor(message='这项操作需要管理员权限。') { super(message); }
}

export function requireAdmin(user: OperationsUser | null | undefined) {
  if (!isAdmin(user)) throw new AccessDenied();
}

export const deniedResponse = () => Response.json({ code: 'FORBIDDEN', message: '这项操作需要管理员权限。' }, { status: 403 });
export const permissionErrorResponse = (error: unknown) => error instanceof AccessDenied ? Response.json({code:'FORBIDDEN',message:error.message},{status:403}) : null;

export function requiresAdmin(path: string, method: string, settingsView?: string | null) {
  const normalized = path.replace(/\/+$/, '');
  if (normalized.startsWith('/api/integrations/xiaohongshu/')) return true;
  if (normalized === '/business/settings') return !(['GET','HEAD'].includes(method) && settingsView === 'guide');
  if (normalized.startsWith('/api/business-settings') || normalized === '/api/stage-reviews/category-policies') return true;
  if(normalized.startsWith('/api/admin/accounts'))return true;
  if(normalized==='/api/monthly-cost-mapping')return true;
  if(normalized.startsWith('/api/collaboration/'))return false;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if(normalized==='/api/monthly-private-data'&&method==='PATCH')return false;
  if(method==='POST'&&/^\/api\/monthly-plans\/[^/]+\/arrangement$/.test(normalized))return false;
  // 成对改期在专用事务内分别检查双方正常／超时改期权限。
  if(method==='POST'&&/^\/api\/operations-content\/[^/]+\/placement$/.test(normalized))return false;
  // 年度与排期写入由逐账号操作权限在事务内检查；其他危险操作沿用原管理员边界。
  if(isConfigurableBusinessWrite(normalized,method))return false;
  if(normalized==='/api/promotion-daily/batch'&&method==='POST')return false;
  if(method==='POST'&&/^\/api\/meeting-versions\/[^/]+\/pdf$/.test(normalized))return false;
  if (method === 'DELETE') return true;
  if (normalized === '/api/operations-annual-plans' || normalized.startsWith('/api/operations-annual-plans/')) return true;
  if (/^\/api\/operations-content\/[^/]+\/platform-note-id$/.test(normalized)) return false;
  // 新增业务写入接口默认由管理员使用，明确列入日常操作后才向员工开放。
  const dailyWrites: Record<string, RegExp> = {
    POST: /^\/api\/(?:operations-content|promotion-daily|promotion-awaiting|promotion-timeline|promotion-pauses|promotion-wait-ranges|promotion-stage-reviews|meeting-attachments|meeting-decisions|non-promotion-reviews|non-promotion-checkpoints|meeting-reviews|stage-reviews)$|^\/api\/operations-content\/versions\/[^/]+\/revisions$|^\/api\/operations-content\/[^/]+\/(?:change-requests|delay-reasons|publication-reservations)$/,
    PATCH: /^\/api\/(?:operations-content|promotion-daily|promotion-pauses|promotion-wait-ranges|promotion-stage-reviews|meeting-reviews|stage-reviews)\/[^/]+$|^\/api\/operations-content\/[^/]+\/(?:publication|publication-reservations\/[^/]+)$/,
  };
  return !dailyWrites[method]?.test(normalized);
}

export function safeReturnTo(value: string | null | undefined, origin: string) {
  if (value) {
    try {
      const target = new URL(value, origin);
      if (target.origin === origin && (target.pathname.startsWith('/business/') || target.pathname === '/organization' || target.pathname.startsWith('/organization/'))) return `${target.pathname}${target.search}${target.hash}`;
    } catch { /* 无效返回地址使用业务默认入口。 */ }
  }
  return '/business/operations-schedule';
}
