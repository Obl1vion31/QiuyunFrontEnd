/** 与真实的应用内确认框交互；默认取消，避免测试自动放弃未保存输入。 */
export function respondToBusinessConfirm(page:any,accept=false){
 return page.locator('[data-business-confirm][open]').waitFor().then(async()=>{
   await page.locator(accept?'[data-confirm-accept]':'[data-confirm-cancel]').click();
   await page.locator('[data-business-confirm]').waitFor({state:'hidden'});
 });
}
