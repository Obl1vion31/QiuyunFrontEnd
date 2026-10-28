/** 只描述写入目标；不把表单值发送给协作接口。浏览器和服务器共用路由映射。 */
export function writeResources(path:string,method:string,data:Record<string,unknown>):string[]{
 if(['GET','HEAD','OPTIONS'].includes(method))return [];
 const parts=path.split('/').filter(Boolean),kind=parts[1],id=parts[2],text=(key:string)=>typeof data[key]==='string'?String(data[key]):'';
 if(kind==='admin'&&id==='accounts')return parts[3]?[`account:${parts[3]}`]:[];
 if(kind==='business-settings'&&id==='account-permissions')return text('userId')?[`account:${text('userId')}`]:[];
 if(kind==='operations-annual-plans'){
  if(id==='year')return [...new Set([parts[3],text('targetYear')].filter(Boolean))].map(year=>`year:${year}`);
  return id?[`plan:${id}`]:data.year?[`year:${String(data.year)}`]:[];
 }
 if(kind==='operations-content'){
  if(parts[3]==='platform-note-id')return [`content:${id}`];
  if(id==='versions')return text('sourceScheduleId')?[`schedule:${text('sourceScheduleId')}`]:[];
  return id?[`schedule:${id}`]:[];
 }
 if(kind==='non-promotion-reviews'||kind==='non-promotion-checkpoints')return text('scheduleId')?[`schedule:${text('scheduleId')}${text('scope')==='schedule'?'':`:non:${text('checkpointType')}`}`]:[];
 if(kind==='promotion-daily'){
  if(id==='batch')return (Array.isArray(data.rows)?data.rows:[]).flatMap(row=>writeResources('/api/promotion-daily',method,row as Record<string,unknown>));
  if(id)return [`metric:${id}`];
  return text('campaignId')?[`campaign:${text('campaignId')}:day:${text('metricDate')}`]:[];
 }
 if(['promotion-timeline','promotion-awaiting','promotion-wait-ranges'].includes(kind))return text('scheduleId')?[`schedule:${text('scheduleId')}`]:text('campaignId')?[`campaign:${text('campaignId')}`]:[];
 if(kind==='promotion-stage-reviews')return id?[`stageReview:${id}`]:['promotion-stage-reviews'];
 if(kind==='meeting-reviews'||kind==='stage-reviews')return id?[`meeting:${id}`]:Array.isArray(data.ids)?data.ids.map(value=>`meeting:${value}`):[];
 if(kind==='meeting-decisions')return text('id')?[`decision:${text('id')}`]:[];
 if(kind==='meeting-attachments')return id?[`attachment:${id}`]:text('meetingId')?[`meeting:${text('meetingId')}`]:[];
 if(kind==='meeting-versions')return id?[`meetingVersion:${id}`]:[];
 if(kind==='business-change-proposals')return id?[`proposal:${id}`]:[];
 if(kind==='taxonomy')return ['taxonomy'];
 return [];
}
