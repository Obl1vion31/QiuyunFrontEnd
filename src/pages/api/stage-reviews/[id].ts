// 旧接口仅保留兼容；新页面统一使用 /api/meeting-reviews/:id。
export { DELETE, PATCH } from '../meeting-reviews/[id]';
export const prerender = false;
