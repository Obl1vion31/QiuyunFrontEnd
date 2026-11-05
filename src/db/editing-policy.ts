/** 暂停跨页面实时编辑共享；保存时的版本校验始终生效。 */
export const realtimeEditingEnabled = false;
export const staleWriteCode = 'STALE_WRITE';
export const staleWriteMessage = '当前核对依据已变化，本次未保存。输入已保留，请重新核对最新内容后再提交。';

export function collaborationDisabledResponse() {
  return Response.json({code:'COLLABORATION_DISABLED',message:'实时编辑共享已停用，请刷新页面后继续。'}, {status:410,headers:{'Cache-Control':'no-store'}});
}
