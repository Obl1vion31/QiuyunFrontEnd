import assert from 'node:assert/strict';

const primaryAreas:Record<string,string[]>={
 'annual-plan':['.summary-shell','.matrix-shell'],
 'operations-schedule':['.content-layout','.content-stage'],
 'daily-promotion-review':['.calendar-section','.daily-section','.history-workspace'],
 'non-promotion-review':['.review-controls','.review-workspace'],
 'meeting-review':['.meeting-records','.meeting-history-overview','.meeting-contextbar','.weekly-report','.weekly-frozen'],
 'monthly-operations':['[data-monthly-operations]','[data-monthly-operations]>form','[data-monthly-operations]>div','[data-report-month]','[data-monthly-operations] [role=alert]'],
 'settings':['[data-account-management]','.account-permissions','.account-permissions>form','.usage-guide','.guide-layout'],
};

/** 比较公共画布与真实一级内容，不能用同一份padding声明代替实际边界。 */
export async function assertBusinessContent(page:any,label=''){
 const route=new URL(page.url()).pathname.split('/').at(-1)!;
 const selectors=primaryAreas[route];assert(selectors,route);
 const result=await page.evaluate((selectors:string[])=>{
  const workspace=document.querySelector<HTMLElement>('.business-console-workspace')!,main=document.querySelector<HTMLElement>('main.business-console-content')!;
  const outer=workspace.getBoundingClientRect(),content=main.getBoundingClientRect();
  const style=getComputedStyle(main);
  const areas=selectors.flatMap(selector=>[...document.querySelectorAll<HTMLElement>(selector)].filter(n=>n.getBoundingClientRect().width>0).map(n=>{const r=n.getBoundingClientRect();return {selector,left:r.left,right:r.right,width:r.width};}));
  return {viewport:innerWidth,scrollY,toolbarBottom:document.querySelector('.business-toolbar')!.getBoundingClientRect().bottom,workspace:{left:outer.left,right:outer.right,width:outer.width},main:{top:content.top,left:content.left,right:content.right,width:content.width},padding:[parseFloat(style.paddingLeft),parseFloat(style.paddingRight)],areas};
 },selectors);
 const message=`${label||route} ${result.viewport}`;
 assert(Math.abs(result.main.left-result.workspace.left)<=1&&Math.abs(result.main.right-result.workspace.right)<=1,message+' 公共正文占满工作区');
 const padding=result.viewport>900?24:10;
 assert.deepEqual(result.padding,[padding,padding],message+' 共享左右留白');
 if(result.scrollY<1)assert(Math.abs(result.main.top-result.toolbarBottom)<=1,message+' 正文接续公共工具栏');
 assert(result.areas.length>0,message+' 有真实一级内容');
 for(const area of result.areas){
  assert(Math.abs(area.left-result.main.left-padding)<=1&&Math.abs(area.right-result.main.right+padding)<=1,message+' '+area.selector+' 实际左右边界 '+JSON.stringify(area));
 }
 if(route==='settings')for(const table of await page.locator('.permissions-table:visible').all()){
  const inside=await table.evaluate((node:HTMLElement)=>{
   const form=node.closest('form')!,a=form.getBoundingClientRect(),b=node.getBoundingClientRect(),style=getComputedStyle(form);
   return Math.abs(b.left-a.left-parseFloat(style.borderLeftWidth)-parseFloat(style.paddingLeft))<=1&&Math.abs(a.right-b.right-parseFloat(style.borderRightWidth)-parseFloat(style.paddingRight))<=1;
  });assert(inside,message+' 权限分组表占满表单内侧，不自行限宽');
 }
 return {label:label||route,...result};
}
