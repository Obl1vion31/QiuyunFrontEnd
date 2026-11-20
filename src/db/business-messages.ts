/** 前后端共用的操作说明；只描述现有能力，不改变业务规则。 */
export const unsafeSubmissionMessage = "这次提交未通过安全验证，请从工作台重新打开该功能后再试。";
export const saveResultUnknownMessage = "暂未收到保存结果。请保留当前输入，先核对最新记录，再决定是否重新提交。";
export const requestUsedMessage = "这次提交无法继续使用。请先保留输入，再重新打开该记录后提交。";
export const administratorRequiredMessage = "此操作需要管理员处理，请联系管理员完成。";
export const sealedMeetingMessage = "本月统计、原计划和事项已固定。核心结论、下一步行动仍可修订；后续排期调整请到“排期管理”填写原因。";
export const sealedMeetingConfirmation = "封存后，本月统计、原计划和事项将固定。\n核心结论、下一步行动仍可修订。\n后续排期调整请到“排期管理”填写原因。";
export const frozenStatisticsMessage = "本版统计数据已固定，修改文字不会更新这些数字。";
export const unchangedContentMessage = "内容与上次保存相同，无需再次保存。";
export const operationUnavailableMessage = (action='完成本次操作') => `暂时无法${action}，请稍后再试。`;
export const staleRecordMessage = (subject='这条记录') => `${subject}已更新，本次修改尚未保存。请先保留需要的输入，再打开最新记录核对。`;
export function weeklyDeadlineMessage(effectiveOn:string,action:'arrangements'|'post'|'restore'='arrangements'){
 const deadline=effectiveOn+' 05:00（北京时间）';
 if(action==='post')return `本周会的会后定稿已于 ${deadline} 截止，当前不能执行这份会前安排。会议文字仍可修订。`;
 if(action==='restore')return `恢复历史版本的截止时间为 ${deadline}，现已截止。你仍可查看历史版本，或修订最新版本的文字。`;
 return `本周会的推广安排已于 ${deadline} 锁定，不能再在本周会修改。结论和说明仍可修订。`;
}
export function preplanRequiredMessage(month:string,role?:'admin'|'employee'){
 const next=role==='admin'?'请先到该月月会确认预排期':role==='employee'?'请联系管理员在该月月会中确认预排期':'请先在该月月会完成预排期确认';
 return `${month} 的预排期尚未确认。${next}，再新增或移入帖子。`;
}
export function readableOperationError(error:unknown,fallback=operationUnavailableMessage()){
 // 浏览器网络／解析错误不直接展示英文异常；业务接口的中文说明继续保留。
 return error instanceof Error&&/[\u4e00-\u9fff]/.test(error.message)?error.message:fallback;
}
export function reviewAvailableMessage(dueOn:string,nextDay=true){
 const date=new Date(dueOn+'T00:00:00+08:00');if(nextDay)date.setUTCDate(date.getUTCDate()+1);
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
 return `这次复盘从 ${day} 起可录入。`;
}
