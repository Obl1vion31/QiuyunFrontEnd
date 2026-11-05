import {operationTypeLabels,type OperationType} from '../db/operation-types';
import {contentRoleLabel} from '../db/content-roles';
import {businessDateTime} from './business-date';
export type ExecutionEntry={at:string;actor:string;reason:string;before:Record<string,unknown>|null;after:Record<string,unknown>|null};
export function executionDescription(entry:ExecutionEntry){
 const before=entry.before,after=entry.after;
 const title=after?.cancelledAt?'取消排期':before?.cancelledAt&&!after?.cancelledAt?'重新安排':!before?'建立排期':'调整排期';
 const changes:string[]=[];
 for(const [key,label] of [['name','标题'],['plannedAt','计划时间'],['subjectName','学科'],['categoryName','分类'],['projectDocUrl','项目文档'],['operationType','运营类型'],['contentRole','内容职能'],['syncToMoments','同步朋友圈'],['isPromoted','推广身份']] as const){
  if((before?.[key]??null)===(after?.[key]??null))continue;
  const format=(value:unknown)=>key==='syncToMoments'||key==='isPromoted'?(value?'是':'否'):value==null||value===''?'未填写':key==='plannedAt'?businessDateTime(String(value)):key==='operationType'?operationTypeLabels[value as OperationType]??String(value):key==='contentRole'?contentRoleLabel(String(value)):String(value);
  changes.push(label+'：'+format(before?.[key])+' → '+format(after?.[key]));
 }
 return title+(changes.length?' · '+changes.join('；'):'')+'\n'+businessDateTime(entry.at)+' · '+entry.actor+'：'+entry.reason;
}
