import {checkpointWindow,checkpointsForPublishDate} from './stage-review-rules.mjs';
export type ReviewMode='standard'|'instant'|'continuous';
export const reviewModeLabels={standard:'常规复盘',instant:'即时复盘',continuous:'持续复盘'};
export const checkpointKeyPattern=/^(day_7|day_15|custom:[0-9a-f-]{36})$/;
export const customCheckpointId=(key:string)=>key.startsWith('custom:')?key.slice(7):null;
export const checkpointLabel=(key:string)=>key==='day_7'?'7 天':key==='day_15'?'15 天':'自定义';
export type ReviewNode={type:string;kind:'standard'|'custom';nodeId:string|null;days:number;label:string;publishedOn:string;dueOn:string};
export function reviewNodes(actual:Date,plan:{mode:ReviewMode;day7:boolean;day15:boolean}|undefined,custom:Array<{id:string;dueOn:string;cancelledAt:unknown}>):ReviewNode[]{
 const fixed=checkpointsForPublishDate(actual).filter(n=>!plan||(n.type==='day_7'?plan.day7:plan.day15));
 const publishedOn=checkpointsForPublishDate(actual)[0].publishedOn;
 return [...fixed.map(n=>({...n,kind:'standard' as const,nodeId:null})),...custom.filter(n=>!n.cancelledAt).map(n=>({type:'custom:'+n.id,kind:'custom' as const,nodeId:n.id,days:cumulativeDays(publishedOn,n.dueOn),label:'自定义',publishedOn,dueOn:n.dueOn}))].sort((a,b)=>a.dueOn.localeCompare(b.dueOn)||a.type.localeCompare(b.type));
}
export function reviewNodeWindow(actual:Date,node:ReviewNode,today:string){
 return node.kind==='standard'?checkpointWindow(actual,node.type,today):{target:node.dueOn,min:node.dueOn,max:node.dueOn,open:node.dueOn<today,defaultValue:node.dueOn<today?node.dueOn:''};
}
export function nextEnabledNode(nodes:ReviewNode[],resolved:string[],today:string){return nodes.find(n=>!resolved.includes(n.type)&&n.dueOn<=today&& (n.kind!=='custom'||n.dueOn<today))??null;}
export function nodeCanRecord(nodes:ReviewNode[],node:ReviewNode,resolved:string[],today:string){
 if(node.dueOn>today||(node.kind==='custom'&&node.dueOn>=today))return false;
 return node.type!=='day_15'||!nodes.some(n=>n.type==='day_7')||resolved.includes('day_7');
}
export const validReviewDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
export const cumulativeDays=(publishedOn:string,dueOn:string)=>Math.round((Date.parse(dueOn)-Date.parse(publishedOn))/86400000)+1;
