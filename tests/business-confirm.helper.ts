/** 与真实的应用内确认框交互；默认取消，避免测试自动放弃未保存输入。 */
export function respondToBusinessConfirm(page:any,accept=false){
 return page.locator('[data-business-confirm][open]').waitFor().then(async()=>{
   await page.locator(accept?'[data-confirm-accept]':'[data-confirm-cancel]').click();
   await page.locator('[data-business-confirm]').waitFor({state:'hidden'});
 });
}

/** 最终图等待字体和有限进出动画稳定；动态过程由独立录像验收。 */
export async function settleBusinessUI(page:any){
 await page.evaluate(async()=>{await document.fonts.ready;await Promise.allSettled(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished));await new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve())));});
}
export async function openPostLookup(page:any){
 const entry=page.locator('.business-assistant-entry--sidebar');
 if(await entry.isVisible())await entry.click();
 else{await page.locator('.business-account--toolbar [data-account-trigger]').click();await page.locator('.business-assistant-entry--menu').click();}
 await settleBusinessUI(page);
}
