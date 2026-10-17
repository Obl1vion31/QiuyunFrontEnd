/** 服务端权限来源与业务危险操作边界；浏览器只使用可显示的角色。 */
export type Role = 'admin' | 'employee';
export interface OperationsUser { id: string; username: string; role: Role }

export const isAdmin = (user: OperationsUser | null | undefined) => user?.role === 'admin';

export class AccessDenied extends Error {
  constructor() { super('这项操作需要管理员权限。'); }
}

export function requireAdmin(user: OperationsUser | null | undefined) {
  if (!isAdmin(user)) throw new AccessDenied();
}

export const deniedResponse = () => Response.json({ code: 'FORBIDDEN', message: '这项操作需要管理员权限。' }, { status: 403 });
export const permissionErrorResponse = (error: unknown) => error instanceof AccessDenied ? deniedResponse() : null;

export function requiresAdmin(path: string, method: string) {
  const normalized = path.replace(/\/+$/, '');
  if (normalized === '/business/settings') return true;
  if (normalized.startsWith('/api/business-settings') || normalized === '/api/stage-reviews/category-policies') return true;
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (method === 'DELETE') return true;
  if (normalized === '/api/operations-annual-plans' || normalized.startsWith('/api/operations-annual-plans/')) return true;
  if (/^\/api\/operations-content\/[^/]+\/platform-note-id$/.test(normalized)) return true;
  // 新增业务写入接口默认由管理员使用，明确列入日常操作后才向员工开放。
  const dailyWrites: Record<string, RegExp> = {
    POST: /^\/api\/(?:operations-content|promotion-daily|promotion-awaiting|promotion-pauses|promotion-wait-ranges|promotion-stage-reviews|meeting-attachments|non-promotion-reviews|non-promotion-checkpoints|meeting-reviews|stage-reviews)$|^\/api\/operations-content\/versions\/[^/]+\/revisions$|^\/api\/operations-content\/[^/]+\/(?:change-requests|delay-reasons|publication-reservations)$/,
    PATCH: /^\/api\/(?:operations-content|promotion-daily|promotion-pauses|promotion-wait-ranges|promotion-stage-reviews|meeting-reviews|stage-reviews)\/[^/]+$|^\/api\/operations-content\/[^/]+\/(?:publication|publication-reservations\/[^/]+)$/,
  };
  return !dailyWrites[method]?.test(normalized);
}

export function safeReturnTo(value: string | null | undefined, origin: string) {
  if (value) {
    try {
      const target = new URL(value, origin);
      if (target.origin === origin && target.pathname.startsWith('/business/')) return `${target.pathname}${target.search}${target.hash}`;
    } catch { /* 无效返回地址使用业务默认入口。 */ }
  }
  return '/business/operations-schedule';
}
