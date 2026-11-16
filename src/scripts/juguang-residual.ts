import {isJuguangMetricDate,juguangTargetKey} from '../integrations/juguang-metric-types';

/** 补录沿用同一套聚光字段及来源组件，补录对象、日期和实际人数仍由人决定。 */
export function prepareJuguangResidual(form:HTMLFormElement,editor:HTMLElement,campaignId:string,date:string,noteId:string){
 if(!isJuguangMetricDate(date))return;
 form.querySelector('time')!.textContent=Number(date.slice(5,7))+'/'+Number(date.slice(8,10));
 form.querySelector('.review-day-state strong')!.textContent='残留消耗';
 form.classList.add('review-pilot-grid');form.dataset.juguangPilot=juguangTargetKey(campaignId,date);form.dataset.juguangDate=date;form.dataset.juguangCampaign=campaignId;form.dataset.noteId=noteId;
 const labels=new Map<string,HTMLElement>();
 for(const name of ['spend','platformOpenCount','platformLeadCount','actualOpenCount','actualLeadCount']){
  const label=form.querySelector<HTMLInputElement>('[name="'+name+'"]')!.closest('label')!;labels.set(name,label);label.dataset.reviewField=name;
  if(!name.startsWith('actual')){label.dataset.juguangField=name;const badge=document.createElement('span');badge.className='juguang-source-badge';badge.dataset.juguangBadge='';badge.textContent='待读取';label.append(badge);const restore=document.createElement('button');restore.type='button';restore.dataset.restoreJuguang=name;restore.hidden=true;restore.textContent='恢复原值';label.append(restore);}
 }
 const cost=form.querySelector<HTMLElement>('.review-calculated')!,traffic=editor.querySelector<HTMLTemplateElement>('[data-residual-traffic-template]')!.content.cloneNode(true);
 form.insertBefore(labels.get('spend')!,cost);form.insertBefore(traffic,cost);
 for(const name of ['platformOpenCount','platformLeadCount','actualOpenCount','actualLeadCount'])form.insertBefore(labels.get(name)!,cost);
 const identity=form.querySelector('.review-entry-identity')!,meta=document.createElement('div');meta.className='review-version-line';meta.append(identity.querySelector('small')!,editor.querySelector<HTMLTemplateElement>('[data-residual-source-template]')!.content.cloneNode(true));identity.append(meta);
}
