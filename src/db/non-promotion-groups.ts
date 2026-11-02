import {summarizeRates} from './stage-review-rules.mjs';
export const nonPromotionGroupLabel=(subject:string,category:string|null)=>category&&category===subject?subject:`${subject} · ${category??'临时帖'}`;
interface Item {row:{subjectId:string;subjectName:string;categoryId:string|null;categoryName:string|null};checkpoint:{type:string};metric?:{readCount?:number|null;clickRate:string|number|null;threeSecondReadRate:string|number|null}}
/** 分类事实来自当前筛选下的实际复盘，同学科、同类型、同轮次分别汇总。 */
export function nonPromotionGroups(items:Item[]){
 const groups=new Map<string,{key:string;label:string;rounds:{type:string;count:number;reading:number|null;readingCount:number;click:number|null;clickCount:number;read:number|null;readCount:number}[]}>();
 for(const item of items){const key=`${item.row.subjectId}:${item.row.categoryId??'temporary'}`;if(!groups.has(key))groups.set(key,{key,label:nonPromotionGroupLabel(item.row.subjectName,item.row.categoryName),rounds:[]});}
 for(const group of groups.values())for(const type of ['day_7','day_15']){
  const rows=items.filter(item=>`${item.row.subjectId}:${item.row.categoryId??'temporary'}`===group.key&&item.checkpoint.type===type&&item.metric);
  const summarize=(field:'readCount'|'clickRate'|'threeSecondReadRate')=>summarizeRates(rows.flatMap(item=>item.metric?.[field]==null?[]:[Number(item.metric[field])]));
  const reading=summarize('readCount'),click=summarize('clickRate'),read=summarize('threeSecondReadRate');
  group.rounds.push({type,count:rows.length,reading:reading.mean,readingCount:reading.count,click:click.mean,clickCount:click.count,read:read.mean,readCount:read.count});
 }
 const order=['step','tmua','interview','temporary'];
 return [...groups.values()].sort((a,b)=>order.indexOf(a.key.split(':')[0])-order.indexOf(b.key.split(':')[0])||a.label.localeCompare(b.label,'zh-CN'));
}
