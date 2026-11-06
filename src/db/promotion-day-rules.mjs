import {promotionSuccessors,promotionStatusStage} from './promotion-successors.mjs';
export function historicalDayCanFollow(from,to,restart=false){
 if(!from||!to)return true;
 if(from===to)return true;
 if(restart&&to==='testing'&&['testing','test_paused','test_pending'].includes(from))return true;
 if(['test_paused','test_pending'].includes(from)&&['test_paused','test_pending'].includes(to))return true;
 return (promotionSuccessors[from]??[]).includes(to);
}
/** 既有次日状态保持不变；旧存储字段只承担衔接，不作为历史表单的编辑内容。 */
export function historicalDayBridge(from,to,restart=false){
 if(!to)return promotionStatusStage(from)?from==='testing'?'test_continue':from==='scaling'?'scaling_continue':'wait_continue':from;
 if(!historicalDayCanFollow(from,to,restart))return null;
 if(restart&&to==='testing')return 'restart_testing';
 if(from===to)return from==='testing'?'test_continue':from==='scaling'?'scaling_continue':promotionStatusStage(from)?'wait_continue':from;
 return ({testing:'test_continue',test_paused:'test_pause',test_pending:'test_pending',scaling:from==='scaling_paused'?'scaling_continue':'start_scaling',scaling_paused:'scaling_pause'})[to]??to;
}
