/** 浏览器与服务端共用的操作目录；角色与有效授权只在服务端计算。 */
export type PermissionMode = 'disabled' | 'direct' | 'review';
export const businessOperations = [
  ['annual.create','annual','新增规划行','disabled'],
  ['annual.edit','annual','编辑规划内容','disabled'],
  ['annual.toggle','annual','启用／停用规划行','disabled'],
  ['annual.instructions','annual','修改年度说明','disabled'],
  ['annual.copy','annual','复制年度规划','disabled'],
  ['annual.restore','annual','恢复历史版本','disabled'],
  ['schedule.create','schedule','新建帖子','direct'],
  ['schedule.revise','schedule','创建改帖','direct'],
  ['schedule.edit','schedule','编辑排期普通信息与用途','direct'],
  ['schedule.reschedule','schedule','正常修改应发时间','direct'],
  ['schedule.overdueReschedule','schedule','超时尚未登记时改期','review'],
  ['schedule.publish','schedule','发布登记与更新链接','direct'],
  ['schedule.correctPublication','schedule','更正已有实际发布时间','disabled'],
  ['schedule.reason','schedule','填写／更正延期原因','direct'],
  ['schedule.endPromotion','schedule','已有关联推广时改为非推广','disabled'],
  ['schedule.delete','schedule','删除排期','disabled'],
] as const;
export type BusinessOperation = typeof businessOperations[number][0];
export type BusinessPermissions = Record<BusinessOperation, PermissionMode>;
export const operationLabels = Object.fromEntries(businessOperations.map(([key,,label])=>[key,label])) as Record<BusinessOperation,string>;
export const defaultBusinessPermissions = () => Object.fromEntries(businessOperations.map(([key,,,mode])=>[key,mode])) as BusinessPermissions;
export const permissionModes: Record<PermissionMode,string> = {disabled:'关闭',direct:'直接生效',review:'审核后生效'};
/** 只有已接入授权事务的明确写入入口可越过旧角色总门禁。未知写入仍限管理员。 */
export function isConfigurableBusinessWrite(path:string,method:string){
  path=path.replace(/\/+$/,'');
  if(method==='POST')return /^\/api\/(?:operations-annual-plans(?:\/[^/]+\/restore|\/year\/\d{4}\/copy)?|operations-content(?:\/versions\/[^/]+\/revisions|\/[^/]+\/(?:delay-reasons|change-requests))?)$/.test(path);
  if(method==='PATCH')return /^\/api\/(?:operations-annual-plans\/(?:year\/\d{4}|[^/]+)|operations-content\/[^/]+(?:\/publication)?)$/.test(path);
  return method==='DELETE'&&/^\/api\/operations-content\/[^/]+$/.test(path);
}
