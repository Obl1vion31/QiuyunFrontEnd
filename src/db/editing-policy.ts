import {staleRecordMessage} from './business-messages';
/** 暂停跨页面实时编辑共享；保存时的版本校验始终生效。 */
export const realtimeEditingEnabled = false;
export const staleWriteCode = 'STALE_WRITE';
export const staleWriteMessage = staleRecordMessage("这条记录");

export function collaborationDisabledResponse() {
  return Response.json({code:'COLLABORATION_DISABLED',message:'实时编辑共享已停用，请刷新页面后继续。'}, {status:410,headers:{'Cache-Control':'no-store'}});
}
